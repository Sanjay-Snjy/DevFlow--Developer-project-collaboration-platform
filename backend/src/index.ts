import http from 'node:http';
import { createApp } from './app.js';
import { connectDb, disconnectDb } from './config/db.js';
import { env } from './config/env.js';
import { initSocket } from './socket.js';

async function main() {
  await connectDb(env.mongoUri);
  console.log(`[db] connected → ${env.mongoUri}`);

  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);

  server.listen(env.port, () => {
    console.log(`[api] DevFlow API listening on http://localhost:${env.port}`);
    console.log(`[ws]  Socket.IO attached (path /socket.io)`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n[api] ${signal} received, shutting down…`);
    server.close();
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[api] fatal startup error', err);
  process.exit(1);
});
