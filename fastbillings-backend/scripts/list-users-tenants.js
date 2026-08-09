const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const users = await p.user.findMany({
    select: { id: true, email: true, firstName: true, lastName: true, user_type: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log('USERS:', JSON.stringify(users, null, 2));

  const tenants = await p.tenant.findMany({
    include: {
      memberships: {
        include: { user: { select: { email: true, firstName: true, lastName: true } } },
      },
      companySettings: { select: { companyName: true } },
    },
  });
  console.log('TENANTS:', JSON.stringify(tenants, null, 2));

  const counts = {
    customers: await p.customer.count(),
    invoices: await p.invoice.count(),
    products: await p.product.count(),
    countries: await p.country.count(),
  };
  console.log('COUNTS:', counts);
}

main()
  .finally(() => p.$disconnect());
