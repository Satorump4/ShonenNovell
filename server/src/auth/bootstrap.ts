import { env } from '../config.js';
import { prisma } from '../db.js';
import { hashPassword } from './password.js';

/**
 * Создаёт администратора из ADMIN_USERNAME / ADMIN_PASSWORD, если его ещё нет.
 * Пароль в коде не хранится; в БД — только bcrypt-хэш.
 * ADMIN_RESET_PASSWORD=true перезаписывает пароль существующего администратора.
 */
export async function ensureAdmin() {
  const { ADMIN_USERNAME: username, ADMIN_PASSWORD: password } = env;
  if (!username || !password) {
    const count = await prisma.adminUser.count();
    if (count === 0) console.warn('[auth] No admin user yet: set ADMIN_USERNAME and ADMIN_PASSWORD to create one.');
    return;
  }
  const existing = await prisma.adminUser.findUnique({ where: { username } });
  if (!existing) {
    await prisma.adminUser.create({ data: { username, passwordHash: await hashPassword(password) } });
    console.log(`[auth] Admin "${username}" created.`);
  } else if (env.ADMIN_RESET_PASSWORD) {
    await prisma.adminUser.update({
      where: { id: existing.id },
      data: { passwordHash: await hashPassword(password), tokenVersion: { increment: 1 } },
    });
    console.log(`[auth] Password for "${username}" was reset from ADMIN_PASSWORD. Remove ADMIN_RESET_PASSWORD now.`);
  }
}

/** Гарантирует, что запись книги существует (сайт работает и с пустой базой). */
export async function ensureBook() {
  await prisma.book.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, title: 'Моя книга', author: '', description: '' },
  });
}
