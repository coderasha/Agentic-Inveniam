import { createHash } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  Body, Controller, Delete, Get, Header, Injectable, Module, Param, Patch, Post,
  Put, Query, Req, Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma, type Document } from '@gain/database';
import { v4 as uuidv4 } from 'uuid';
import type { Request, Response } from 'express';
import { AuthorizationService, CurrentPrincipal, type Principal } from '../common/auth';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import { PrismaService } from '../infrastructure/services';

export function buildStorageKey(orgId: string, documentId: string, version: number, checksum: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(orgId) || !/^[0-9a-f-]{36}$/i.test(documentId)) {
    throw new ValidationError('Organization and document IDs must be UUIDs');
  }
  if (!Number.isInteger(version) || version < 1) throw new ValidationError('Version must be positive');
  if (!/^[a-f0-9]{64}$/.test(checksum)) throw new ValidationError('Invalid SHA-256 checksum');
  return `org/${orgId}/documents/${documentId}/v${version}/${checksum}`;
}

@Injectable()
export class LocalDocumentStorage {
  private readonly root: string;
  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('DOCUMENT_STORAGE_ROOT') ?? './storage/documents');
  }
  private path(key: string): string {
    const value = resolve(this.root, key);
    if (!value.startsWith(`${this.root}/`)) throw new ValidationError('Invalid storage key');
    return value;
  }
  async putObject(key: string, content: Buffer): Promise<void> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, { flag: 'wx' }).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
      await writeFile(path, content);
    });
  }
  getObject(key: string): { path: string; stream: ReadStream } {
    const path = this.path(key);
    return { path, stream: createReadStream(path) };
  }
  async exists(key: string): Promise<boolean> {
    try { await access(this.path(key)); return true; } catch { return false; }
  }
  async delete(key: string): Promise<void> { await rm(this.path(key), { force: true }); }
}

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const serialize = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value, (_, item) => typeof item === 'bigint'
    ? (item <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(item) : item.toString()) : item)) as T;
const positiveInt = (value: unknown, name: string): number => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new ValidationError(`${name} must be a positive integer`);
  return n;
};
const checksum = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new ValidationError('checksumSha256 must be a lowercase SHA-256 hex digest');
  }
  return value;
};

@Injectable()
export class DocumentService {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: LocalDocumentStorage,
  ) {}
  async create(input: Record<string, unknown>, p: Principal) {
    if (typeof input.title !== 'string' || !input.title.trim()) throw new ValidationError('title is required');
    if (typeof input.mimeType !== 'string' || typeof input.fileName !== 'string') {
      throw new ValidationError('mimeType and fileName are required');
    }
    const id = uuidv4();
    const hash = checksum(input.checksumSha256);
    const size = positiveInt(input.byteSize, 'byteSize');
    const storageKey = buildStorageKey(p.organizationId!, id, 1, hash);
    const document = await this.db.$transaction(async (tx) => {
      const row = await tx.document.create({ data: {
        id, organizationId: p.organizationId!, title: input.title as string,
        description: input.description as string | undefined,
        category: input.category as string | undefined,
        sensitivity: input.sensitivity as never,
        tags: input.tags as string[] | undefined, mimeType: input.mimeType as string,
        fileName: input.fileName as string, byteSize: BigInt(size),
        checksumSha256: hash, storageKey, metadata: json(input.metadata ?? {}),
        createdByUserId: p.userId,
      } });
      await tx.documentVersion.create({ data: {
        documentId: id, versionNumber: 1, fileName: row.fileName, mimeType: row.mimeType,
        byteSize: row.byteSize, checksumSha256: hash, storageKey, createdByUserId: p.userId,
      } });
      return row;
    });
    return serialize({ document, upload: {
      method: 'PUT', url: `/api/v1/documents/${id}/content`,
      headers: { 'content-type': document.mimeType, 'content-length': size.toString() },
    } });
  }
  async get(id: string, p: Principal): Promise<Document> {
    const row = await this.db.document.findFirst({
      where: { id, organizationId: p.organizationId!, deletedAt: null },
    });
    if (!row) throw new NotFoundError('Document', id);
    return row;
  }
  async list(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where = {
      organizationId: p.organizationId!, deletedAt: null,
      status: query.status as never, category: query.category,
    };
    const [items, total] = await this.db.$transaction([
      this.db.document.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { updatedAt: 'desc' },
      }),
      this.db.document.count({ where }),
    ]);
    return serialize({ items, total, page, pageSize });
  }
  async update(id: string, input: Record<string, unknown>, p: Principal) {
    const current = await this.get(id, p);
    if (Number(input.version) !== current.version) throw new ConflictError('Document version is stale');
    const allowed = ['title', 'description', 'category', 'sensitivity', 'tags', 'status'] as const;
    const data: Record<string, unknown> = { version: { increment: 1 } };
    for (const key of allowed) if (key in input) data[key] = input[key];
    return serialize(await this.db.document.update({ where: { id }, data: data as never }));
  }
  async upload(id: string, versionValue: string | undefined, body: Buffer, headers: Request['headers'], p: Principal) {
    const document = await this.get(id, p);
    const version = versionValue ? positiveInt(versionValue, 'version') : document.currentVersion;
    const versionRow = await this.db.documentVersion.findUnique({
      where: { documentId_versionNumber: { documentId: id, versionNumber: version } },
    });
    if (!versionRow) throw new NotFoundError('Document version');
    const declared = headers['content-length'];
    if (!declared || Number(declared) !== Number(versionRow.byteSize) || body.length !== Number(versionRow.byteSize)) {
      throw new ValidationError('Content-Length does not match declared byteSize');
    }
    const actual = createHash('sha256').update(body).digest('hex');
    const supplied = headers['x-checksum-sha256'];
    if (typeof supplied === 'string' && supplied !== actual) throw new ValidationError('x-checksum-sha256 mismatch');
    if (actual !== versionRow.checksumSha256) throw new ValidationError('Content checksum does not match metadata');
    await this.storage.putObject(versionRow.storageKey, body);
    const event = {
      eventId: uuidv4(), eventType: 'DOCUMENT_UPLOADED', aggregateType: 'Document',
      aggregateId: id, occurredAt: new Date().toISOString(), correlationId: p.correlationId,
      actorUserId: p.userId, organizationId: p.organizationId ?? null,
      payload: { version, byteSize: body.length, checksumSha256: actual },
      metadata: { service: 'platform-api' },
    };
    const updated = await this.db.$transaction(async (tx) => {
      await tx.document.update({ where: { id }, data: { status: 'uploaded' } });
      const row = await tx.document.update({ where: { id }, data: {
        fileName: versionRow.fileName, mimeType: versionRow.mimeType, byteSize: versionRow.byteSize,
        checksumSha256: actual, storageKey: versionRow.storageKey, currentVersion: version,
        status: 'ready', scanStatus: 'skipped', version: { increment: 1 },
      } });
      await tx.outboxMessage.create({ data: {
        topic: 'gain.document.uploaded', aggregateType: event.aggregateType,
        aggregateId: id, eventType: event.eventType, payload: json(event),
        headers: json({ correlationId: p.correlationId }),
      } });
      return row;
    });
    return serialize(updated);
  }
  async createVersion(id: string, input: Record<string, unknown>, p: Principal) {
    await this.get(id, p);
    const latest = await this.db.documentVersion.aggregate({
      where: { documentId: id }, _max: { versionNumber: true },
    });
    const versionNumber = (latest._max.versionNumber ?? 0) + 1;
    const hash = checksum(input.checksumSha256);
    const size = positiveInt(input.byteSize, 'byteSize');
    if (typeof input.fileName !== 'string' || typeof input.mimeType !== 'string') {
      throw new ValidationError('fileName and mimeType are required');
    }
    const row = await this.db.documentVersion.create({ data: {
      documentId: id, versionNumber, fileName: input.fileName, mimeType: input.mimeType,
      byteSize: BigInt(size), checksumSha256: hash,
      storageKey: buildStorageKey(p.organizationId!, id, versionNumber, hash),
      changeSummary: input.changeSummary as string | undefined, createdByUserId: p.userId,
    } });
    await this.db.document.update({ where: { id }, data: { status: 'draft' } });
    return serialize({ version: row, upload: {
      method: 'PUT', url: `/api/v1/documents/${id}/content?version=${versionNumber}`,
      headers: { 'content-type': row.mimeType, 'content-length': size.toString() },
    } });
  }
  async link(id: string, input: Record<string, unknown>, p: Principal) {
    await this.get(id, p);
    if (typeof input.targetId !== 'string' || typeof input.targetType !== 'string') {
      throw new ValidationError('targetType and targetId are required');
    }
    return this.db.documentLink.create({ data: {
      documentId: id, organizationId: p.organizationId!, targetId: input.targetId,
      targetType: input.targetType as never, relationship: input.relationship as string | undefined,
    } });
  }
  async links(id: string, p: Principal) {
    await this.get(id, p);
    return this.db.documentLink.findMany({
      where: { documentId: id, organizationId: p.organizationId!, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }
  async remove(id: string, deleteFile: boolean, p: Principal): Promise<void> {
    const document = await this.get(id, p);
    const versions = deleteFile
      ? await this.db.documentVersion.findMany({ where: { documentId: id } }) : [];
    await this.db.document.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.db.documentLink.updateMany({ where: { documentId: id }, data: { deletedAt: new Date() } });
    await Promise.all(versions.map((item) => this.storage.delete(item.storageKey)));
    if (deleteFile && versions.length === 0) await this.storage.delete(document.storageKey);
  }
  async download(id: string, p: Principal) {
    const document = await this.get(id, p);
    if (document.status !== 'ready' || !(await this.storage.exists(document.storageKey))) {
      throw new NotFoundError('Document content');
    }
    return { document, ...this.storage.getObject(document.storageKey) };
  }
}

@ApiTags('Documents')
@ApiBearerAuth()
@Controller({ path: 'documents', version: '1' })
export class DocumentController {
  constructor(private readonly service: DocumentService, private readonly auth: AuthorizationService) {}
  @Post()
  create(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'document:create'); return this.service.create(body, p);
  }
  @Put(':id/content')
  upload(@Param('id') id: string, @Query('version') version: string | undefined,
    @Req() req: Request, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'document:update');
    if (!Buffer.isBuffer(req.body)) throw new ValidationError('Raw binary body required');
    return this.service.upload(id, version, req.body, req.headers, p);
  }
  @Get()
  list(@Query() q: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'document:read'); return this.service.list(p, q);
  }
  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'document:download');
    const item = await this.service.download(id, p);
    res.setHeader('Content-Type', item.document.mimeType);
    res.setHeader('Content-Length', item.document.byteSize.toString());
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(item.document.fileName)}`);
    item.stream.on('error', (error) => res.destroy(error)).pipe(res);
  }
  @Get(':id')
  async get(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'document:read'); return serialize(await this.service.get(id, p));
  }
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'document:update'); return this.service.update(id, body, p);
  }
  @Delete(':id')
  @Header('Cache-Control', 'no-store')
  async remove(@Param('id') id: string, @Query('deleteFile') value: string,
    @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'document:delete'); await this.service.remove(id, value === 'true', p);
    return { deleted: true };
  }
  @Post(':id/versions')
  version(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'document:version:manage'); return this.service.createVersion(id, body, p);
  }
  @Post(':id/links')
  link(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'document:link:manage'); return this.service.link(id, body, p);
  }
  @Get(':id/links')
  links(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'document:read'); return this.service.links(id, p);
  }
}

@Module({
  controllers: [DocumentController],
  providers: [DocumentService, LocalDocumentStorage],
  exports: [LocalDocumentStorage],
})
export class DocumentModule {}
