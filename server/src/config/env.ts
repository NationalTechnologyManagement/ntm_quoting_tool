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
  // ConnectWise
  CW_COMPANY_ID: z.string().optional(),
  CW_PUBLIC_KEY: z.string().optional(),
  CW_PRIVATE_KEY: z.string().optional(),
  CW_CLIENT_ID: z.string().optional(),
  CW_BASE_URL: z.string().default('https://api-na.myconnectwise.net/v4_6_release/apis/3.0'),
  INITIAL_ADMIN_EMAIL: z.string().optional(),
  INITIAL_ADMIN_PASSWORD: z.string().optional(),
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
});

export const env = envSchema.parse(process.env);
