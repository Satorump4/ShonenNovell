import { env } from './config.js';
import { createApp } from './app.js';
import { ensureAdmin, ensureBook } from './auth/bootstrap.js';
import { prisma } from './db.js';

async function main() {
  await prisma.$connect();
  await ensureBook();
  await ensureAdmin();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`[server] listening on http://localhost:${env.PORT} (${env.NODE_ENV}, storage: ${env.STORAGE_TYPE})`);
  });

  const shutdown = (signal: string) => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(() => {
      prisma.$disconnect().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[server] failed to start', err);
  process.exit(1);
});
