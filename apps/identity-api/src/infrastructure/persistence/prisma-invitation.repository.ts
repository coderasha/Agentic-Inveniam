import { Injectable } from '@nestjs/common';
import type {
  CreateInvitationInput,
  InvitationResponse,
} from '@gain/shared';
import { Prisma } from '@gain/database';
import type {
  InvitationListFilters,
  InvitationRecord,
  InvitationRepository,
} from '../../../domain/identity/ports/invitation.repository';
import { NotFoundError } from '../../../domain/identity/errors';
import { PrismaService } from './prisma.service';
import { mapInvitation } from './mappers';

const invitationInclude = { roles: true } as const;

@Injectable()
export class PrismaInvitationRepository implements InvitationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: CreateInvitationInput,
    tokenHash: string,
    invitedByUserId: string,
    expiresAt: Date,
  ): Promise<InvitationResponse> {
    const invitation = await this.prisma.invitation.create({
      data: {
        organizationId: input.organizationId,
        email: input.email.toLowerCase(),
        tokenHash,
        message: input.message,
        invitedByUserId,
        expiresAt,
        status: 'pending',
        roles: {
          create: input.roleIds.map((roleId) => ({ roleId })),
        },
      },
      include: invitationInclude,
    });
    return mapInvitation(invitation);
  }

  async findById(id: string): Promise<InvitationRecord | null> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id },
      include: invitationInclude,
    });
    if (!invitation) return null;
    return { ...mapInvitation(invitation), tokenHash: invitation.tokenHash };
  }

  async findByTokenHash(tokenHash: string): Promise<InvitationRecord | null> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash },
      include: invitationInclude,
    });
    if (!invitation) return null;
    return { ...mapInvitation(invitation), tokenHash: invitation.tokenHash };
  }

  async list(filters: InvitationListFilters): Promise<{
    items: InvitationResponse[];
    total: number;
  }> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const where: Prisma.InvitationWhereInput = {
      ...(filters.organizationId
        ? { organizationId: filters.organizationId }
        : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.email ? { email: filters.email.toLowerCase() } : {}),
      ...(filters.search
        ? { email: { contains: filters.search, mode: 'insensitive' } }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.invitation.count({ where }),
      this.prisma.invitation.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: filters.sortOrder ?? 'desc' },
        include: invitationInclude,
      }),
    ]);

    return { items: rows.map(mapInvitation), total };
  }

  async accept(id: string, acceptedAt: Date): Promise<InvitationResponse> {
    const invitation = await this.prisma.invitation.update({
      where: { id },
      data: { status: 'accepted', acceptedAt },
      include: invitationInclude,
    });
    return mapInvitation(invitation);
  }

  async revoke(id: string, revokedAt: Date): Promise<InvitationResponse> {
    const existing = await this.prisma.invitation.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Invitation', id);
    }
    const invitation = await this.prisma.invitation.update({
      where: { id },
      data: { status: 'revoked', revokedAt },
      include: invitationInclude,
    });
    return mapInvitation(invitation);
  }

  async expireStale(now: Date): Promise<number> {
    const result = await this.prisma.invitation.updateMany({
      where: {
        status: 'pending',
        expiresAt: { lt: now },
      },
      data: { status: 'expired' },
    });
    return result.count;
  }
}
