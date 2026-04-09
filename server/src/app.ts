import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';

// Routes
import healthRoutes from './routes/health.js';
import configRoutes from './routes/config.js';
import authRoutes from './routes/auth.js';
import adminPackageRoutes from './routes/admin-packages.js';
import adminAddonRoutes from './routes/admin-addons.js';
import adminPromoCodeRoutes from './routes/admin-promo-codes.js';
import adminTermsRoutes from './routes/admin-terms.js';
import adminQuoteRoutes from './routes/admin-quotes.js';
import adminSettingsRoutes from './routes/admin-settings.js';
import quoteRoutes from './routes/quotes.js';
import leadRoutes from './routes/leads.js';
import webhookRoutes from './routes/webhooks.js';
import contractRoutes from './routes/contracts.js';

export function createApp() {
  const app = express();

  // Standard middleware
  app.use(cors({ origin: env.NODE_ENV === 'development' ? '*' : undefined }));
  app.use(express.json({ limit: '10mb' }));

  // Routes
  app.use(healthRoutes);
  app.use(configRoutes);
  app.use(authRoutes);
  app.use(adminPackageRoutes);
  app.use(adminAddonRoutes);
  app.use(adminPromoCodeRoutes);
  app.use(adminTermsRoutes);
  app.use(adminQuoteRoutes);
  app.use(adminSettingsRoutes);
  app.use(quoteRoutes);
  app.use(leadRoutes);
  app.use(webhookRoutes);
  app.use(contractRoutes);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
