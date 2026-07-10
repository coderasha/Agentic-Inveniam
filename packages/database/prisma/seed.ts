import { PrismaClient, OrganizationStatus, UserStatus, MembershipStatus } from '@prisma/client';
import {
  SYSTEM_ROLE_PERMISSIONS,
  type Permission,
  type SystemRole,
} from '@gain/shared';

const prisma = new PrismaClient();

const SYSTEM_ROLE_DEFINITIONS: Array<{
  slug: SystemRole;
  name: string;
  description: string;
}> = [
  {
    slug: 'platform_super_admin',
    name: 'Platform Super Admin',
    description: 'Full platform-wide administrative access',
  },
  {
    slug: 'org_owner',
    name: 'Organization Owner',
    description: 'Full control within an organization',
  },
  {
    slug: 'org_admin',
    name: 'Organization Admin',
    description: 'Administrative access within an organization',
  },
  {
    slug: 'org_member',
    name: 'Organization Member',
    description: 'Standard member access',
  },
  {
    slug: 'org_viewer',
    name: 'Organization Viewer',
    description: 'Read-only access within an organization',
  },
  {
    slug: 'service_account',
    name: 'Service Account',
    description: 'Machine identity with constrained access',
  },
];

async function seedSystemRoles() {
  for (const role of SYSTEM_ROLE_DEFINITIONS) {
    const permissions = [...SYSTEM_ROLE_PERMISSIONS[role.slug]] as Permission[];
    const existing = await prisma.role.findFirst({
      where: { slug: role.slug, organizationId: null, isSystem: true },
    });

    if (existing) {
      await prisma.role.update({
        where: { id: existing.id },
        data: {
          name: role.name,
          description: role.description,
          permissions,
        },
      });
    } else {
      await prisma.role.create({
        data: {
          name: role.name,
          slug: role.slug,
          description: role.description,
          permissions,
          isSystem: true,
          organizationId: null,
        },
      });
    }
  }
}

async function seedDemoTenant() {
  const org = await prisma.organization.upsert({
    where: { slug: 'gain-platform' },
    update: {},
    create: {
      name: 'GAIN Platform',
      slug: 'gain-platform',
      legalName: 'Global Asset Intelligence Network Inc.',
      description: 'Platform operator organization',
      industry: 'Financial Technology',
      countryCode: 'US',
      timezone: 'UTC',
      status: OrganizationStatus.active,
      settings: {
        mfaRequired: true,
        sessionTimeoutMinutes: 480,
      },
    },
  });

  const ownerRole = await prisma.role.findFirstOrThrow({
    where: { slug: 'org_owner', isSystem: true, organizationId: null },
  });

  const platformRole = await prisma.role.findFirstOrThrow({
    where: { slug: 'platform_super_admin', isSystem: true, organizationId: null },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@gain.network' },
    update: {},
    create: {
      email: 'admin@gain.network',
      firstName: 'Platform',
      lastName: 'Admin',
      displayName: 'Platform Admin',
      status: UserStatus.active,
      emailVerified: true,
      locale: 'en-US',
      timezone: 'UTC',
      metadata: { seeded: true },
    },
  });

  const membership = await prisma.membership.upsert({
    where: {
      userId_organizationId: {
        userId: admin.id,
        organizationId: org.id,
      },
    },
    update: {
      status: MembershipStatus.active,
      isPrimary: true,
    },
    create: {
      userId: admin.id,
      organizationId: org.id,
      status: MembershipStatus.active,
      isPrimary: true,
      title: 'Platform Administrator',
      department: 'Engineering',
    },
  });

  for (const role of [ownerRole, platformRole]) {
    await prisma.membershipRole.upsert({
      where: {
        membershipId_roleId: {
          membershipId: membership.id,
          roleId: role.id,
        },
      },
      update: {},
      create: {
        membershipId: membership.id,
        roleId: role.id,
        assignedBy: admin.id,
      },
    });
  }
  const existingVersion = await prisma.organizationVersion.findUnique({
    where: {
      organizationId_version: {
        organizationId: org.id,
        version: org.version,
      },
    },
  });
  if (!existingVersion) {
    await prisma.organizationVersion.create({
      data: {
        organizationId: org.id,
        version: org.version,
        snapshot: org,
        changedByUserId: admin.id,
      },
    });
  }
}

async function main() {
  await seedSystemRoles();
  await seedDemoTenant();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
