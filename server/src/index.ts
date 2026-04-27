import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { createApp } from './app.js';
import { startCwRetryWorker } from './services/cw-retry.worker.js';
import { initCredentialsCache } from './services/integration-credentials.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // Hydrate integration credentials from DB before any handler runs so that
  // the first inbound request sees the correct merged env/DB view.
  await initCredentialsCache();

  const app = createApp();

  // In production, serve the built React app
  if (env.NODE_ENV === 'production') {
    const clientDist = path.resolve(__dirname, '../../client/dist');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT} (${env.NODE_ENV})`);
  });

  startCwRetryWorker();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  prisma.$disconnect();
  process.exit(1);
});
