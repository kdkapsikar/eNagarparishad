import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import { config } from './config.js';
import { query } from './db/pool.js';
import { loadSession, requireAdmin, requireStaff } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/error.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import certificateRoutes from './routes/certificates.js';
import contentRoutes from './routes/content.js';
import dashboardRoutes from './routes/dashboard.js';
import householdRoutes from './routes/households.js';
import importRoutes from './routes/imports.js';
import messageRoutes from './routes/messages.js';
import publicRoutes from './routes/public.js';
import speechRoutes from './routes/speech.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev'));

  const defaults = helmet.contentSecurityPolicy.getDefaultDirectives();
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...defaults,
          // Mukta (Devanagari + Latin) comes from Google Fonts.
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          'upgrade-insecure-requests': config.forceHttps ? [] : null,
        },
      },
    }),
  );
  // The bot's voice input needs the microphone on this page; nothing else needs camera or location.
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
    next();
  });

  // Family records with up to 30 members fit comfortably; spreadsheets go through multer instead.
  app.use(express.json({ limit: '200kb' }));

  if (config.corsOrigins.length > 0) {
    app.use('/api', cors({
      origin: config.corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      exposedHeaders: ['Content-Disposition', 'X-Speech-Cache'],
      maxAge: 600,
    }));
  }

  app.get('/api/health', async (_req, res) => {
    await query('SELECT 1');
    res.json({ status: 'ok' });
  });

  app.use('/api', loadSession);
  app.use('/api/public', publicRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/speech', speechRoutes); // public: the assistant talks to residents who are not signed in
  app.use('/api/dashboard', requireStaff, dashboardRoutes);
  app.use('/api/households', requireStaff, householdRoutes);
  app.use('/api/messages', requireStaff, messageRoutes);
  app.use('/api/certificates', requireStaff, certificateRoutes);
  app.use('/api/imports', requireStaff, importRoutes);
  app.use('/api/content', requireAdmin, contentRoutes);
  app.use('/api/admin', requireAdmin, adminRoutes);
  app.use('/api', notFound);

  // Production single-server mode: serve the built React app and fall back to index.html for client routes.
  const indexHtml = path.join(config.clientDistDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.clientDistDir, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      return res.sendFile(indexHtml);
    });
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
