import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROLE_DEFS: { name: 'Viewer' | 'Planner' | 'Applier' | 'Admin'; description: string }[] = [
  { name: 'Viewer', description: 'Default SSO role. Can view runs and plans.' },
  { name: 'Planner', description: 'Legacy role — prefer Viewer or Admin.' },
  { name: 'Applier', description: 'Legacy role — prefer Viewer or Admin.' },
  {
    name: 'Admin',
    description: 'First SSO user after setup. Full access including user management.',
  },
];

async function seedRoles() {
  for (const role of ROLE_DEFS) {
    await prisma.role.upsert({
      where: { name: role.name },
      create: role,
      update: { description: role.description },
    });
  }
  console.log(`Seeded ${ROLE_DEFS.length} roles.`);
}

async function seedBootstrapAdmin() {
  const email = process.env.AUTH_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  // Leave users empty so the first Google sign-in becomes Admin.
  if (!email) {
    console.log('No AUTH_BOOTSTRAP_ADMIN_EMAIL — first login will become Admin.');
    return;
  }
  const roles = await prisma.role.findMany();
  const adminRole = roles.find((r) => r.name === 'Admin');
  if (!adminRole) throw new Error('Admin role missing');

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: 'Terraplan Admin',
      status: 'active',
    },
    update: {},
  });

  await prisma.roleAssignment.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    create: { userId: user.id, roleId: adminRole.id, environment: '*' },
    update: { environment: '*' },
  });
  console.log(`Bootstrap admin ready: ${email}`);
}

async function main() {
  await seedRoles();
  await seedBootstrapAdmin();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
