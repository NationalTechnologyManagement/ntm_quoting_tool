import { prisma } from '../config/prisma.js';
import { AppError } from '../middleware/error-handler.js';

export async function listUsers() {
  const users = await prisma.adminUser.findMany({
    orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      twoFactorMethod: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  return users;
}

// Sales reps for the assignment picker on quotes. Returns active users with
// either role (admins can also be assigned as the rep on a quote).
export async function listSalesReps() {
  return prisma.adminUser.findMany({
    where: { active: true },
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
    select: { id: true, email: true, name: true, role: true },
  });
}

export async function setUserActive(id: string, active: boolean) {
  await prisma.adminUser.update({ where: { id }, data: { active } });
}

export async function setUserRole(id: string, role: 'admin' | 'sales_rep') {
  await prisma.adminUser.update({ where: { id }, data: { role } });
}

export async function deleteUser(id: string, requesterId: string) {
  if (id === requesterId) {
    throw new AppError(400, "You can't delete your own account");
  }
  const admins = await prisma.adminUser.count({ where: { role: 'admin', active: true } });
  const target = await prisma.adminUser.findUnique({ where: { id } });
  if (!target) throw new AppError(404, 'User not found');
  if (target.role === 'admin' && admins <= 1) {
    throw new AppError(400, 'Cannot delete the last active admin');
  }
  await prisma.adminUser.delete({ where: { id } });
}
