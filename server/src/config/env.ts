import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string(),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().default('http://localhost:8080'),
  JWT_SECRET: z.string().min(16),
  // Alternative Payments
  AP_CLIENT_ID: z.string().optional(),
  AP_CLIENT_SECRET: z.string().optional(),
  AP_WEBHOOK_SECRET: z.string().optional(),
  // Email
  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().default('quotes@trustntm.com'),
  // GoHighLevel
  GHL_API_KEY: z.string().optional(),
  GHL_LOCATION_ID: z.string().optional(),
  GHL_BOOKING_URL: z.string().optional(),
  // Lead-gen mode: skips payment/contract; collects info, applies tags,
  // returns a GHL calendar booking URL instead of running checkout.
  LEAD_GEN_MODE: z
    .string()
    .optional()
    .transform((v) => v?.toLowerCase() === 'true'),
  // ConnectWise
  CW_COMPANY_ID: z.string().optional(),
  CW_PUBLIC_KEY: z.string().optional(),
  CW_PRIVATE_KEY: z.string().optional(),
  CW_CLIENT_ID: z.string().optional(),
  CW_BASE_URL: z.string().default('https://api-na.myconnectwise.net/v4_6_release/apis/3.0'),
  // Notifications + handoff (Phase 6)
  NOTIFY_WEBHOOK_URL: z.string().optional(),
  // Test mode: log CW writes instead of executing them (read-only audit calls still go through).
  // Use during local UI walkthroughs so the wizard runs end-to-end without touching production CW.
  // NB: do NOT use z.coerce.boolean() — it treats the literal string "false" as truthy.
  // Strict text comparison so CW_DRY_RUN="false" actually means false.
  CW_DRY_RUN: z
    .string()
    .optional()
    .transform((v) => v?.toLowerCase() === 'true'),
  // Retry worker (Phase 5)
  CW_RETRY_INTERVAL_MS: z.coerce.number().default(60_000),
  CW_RETRY_MAX_ATTEMPTS: z.coerce.number().default(5),
  CW_RETRY_DISABLED: z
    .string()
    .optional()
    .transform((v) => v?.toLowerCase() === 'true'),
  INITIAL_ADMIN_EMAIL: z.string().optional(),
  INITIAL_ADMIN_PASSWORD: z.string().optional(),
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
});

export const env = envSchema.parse(process.env);
