import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './utils/errors.js';
import { apiLimiter, originGuard } from './middleware/security.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.trustProxy) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  const origins = env.corsOrigins;
  app.use(
    cors({
      origin(origin, cb) {
        // No CORS headers unless an origin allow-list is configured (same-origin proxy by default).
        if (!origins.length || !origin) return cb(null, false);
        if (origins.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'devflow-api', time: new Date().toISOString() });
  });

  app.use('/api', apiLimiter, originGuard, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
