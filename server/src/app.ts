import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';

// Routes
import healthRoutes from './routes/health.js';
import configRoutes from './routes/config.js';
import authRoutes from './routes/auth.js';
import ssoRoutes from './routes/sso.js';
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
import aiChatRoutes from './routes/ai-chat.js';
import adminAiRoutes from './routes/admin-ai.js';
import adminSiteContentRoutes from './routes/admin-site-content.js';

export function createApp() {
  const app = express();

  // Trust the Railway / reverse-proxy hop so req.ip is the client, not the
  // proxy. The AI chat IP rate-limit and ChatSession.ipAddress logging both
  // rely on this being correct.
  app.set('trust proxy', 1);

  // Standard middleware
  // Reflect the request Origin instead of '*'. The wildcard is incompatible
  // with `credentials: true` per the CORS spec (the browser rejects the
  // response), and we now send a session cookie for the GHL-embedded admin
  // portal. In prod the SPA + API are same-origin so this header isn't
  // consulted; in dev the Vite SPA runs on a separate port and needs an
  // explicit allow.
  app.use(
    cors({
      origin: env.NODE_ENV === 'development' ? env.FRONTEND_URL : true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '10mb' }));

  // Routes
  app.use(healthRoutes);
  app.use(configRoutes);
  app.use(authRoutes);
  app.use(ssoRoutes);
  app.use(adminPackageRoutes);
  app.use(adminAddonRoutes);
  app.use(adminPromoCodeRoutes);
  app.use(adminTermsRoutes);
  app.use(adminQuoteRoutes);
  app.use(adminSettingsRoutes);
  app.use(adminAiRoutes);
  app.use(adminSiteContentRoutes);
  app.use(quoteRoutes);
  app.use(leadRoutes);
  app.use(webhookRoutes);
  app.use(contractRoutes);
  app.use(aiChatRoutes);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
