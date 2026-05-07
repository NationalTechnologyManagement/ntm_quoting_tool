-- AI Chat: agent config + KB + sessions/messages.

CREATE TABLE "ai_agent_config" (
  "id"                TEXT NOT NULL DEFAULT 'default',
  "enabled"           BOOLEAN NOT NULL DEFAULT false,
  "primaryModel"      TEXT NOT NULL DEFAULT 'anthropic/claude-sonnet-4-5',
  "fallbackModel"     TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
  "temperature"       DOUBLE PRECISION NOT NULL DEFAULT 0.3,
  "maxTokens"         INTEGER NOT NULL DEFAULT 1024,
  "requestTimeoutMs"  INTEGER NOT NULL DEFAULT 30000,
  "systemPrompt"      TEXT NOT NULL DEFAULT '',
  "greeting"          TEXT NOT NULL DEFAULT 'Hi! I can help you build your quote. What would you like to know?',
  "disclaimer"        TEXT NOT NULL DEFAULT 'AI assistant — may make mistakes. You make the final decisions.',
  "perSessionUsdCap"  DOUBLE PRECISION NOT NULL DEFAULT 10,
  "dailyUsdCap"       DOUBLE PRECISION NOT NULL DEFAULT 50,
  "idleTimeoutMs"     INTEGER NOT NULL DEFAULT 1800000,
  "absoluteTimeoutMs" INTEGER NOT NULL DEFAULT 14400000,
  "ratePerMin"        INTEGER NOT NULL DEFAULT 20,
  "allowedTools"      TEXT NOT NULL DEFAULT 'highlight_field,prefill_field,navigate,suggest_addon,suggest_package',
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_agent_config_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_kb" (
  "id"        TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "content"   TEXT NOT NULL,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_kb_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_kb_active_sortOrder_idx" ON "ai_kb"("active", "sortOrder");

CREATE TABLE "chat_sessions" (
  "id"             TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'active',
  "quoteId"        TEXT,
  "ipAddress"      TEXT,
  "userAgent"      TEXT,
  "usdSpent"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tokensIn"       INTEGER NOT NULL DEFAULT 0,
  "tokensOut"      INTEGER NOT NULL DEFAULT 0,
  "usingFallback"  BOOLEAN NOT NULL DEFAULT false,
  "meta"           JSONB NOT NULL DEFAULT '{}',
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt"        TIMESTAMP(3),
  CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "chat_sessions_status_idx" ON "chat_sessions"("status");
CREATE INDEX "chat_sessions_createdAt_idx" ON "chat_sessions"("createdAt");

CREATE TABLE "chat_messages" (
  "id"        TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "role"      TEXT NOT NULL,
  "content"   TEXT NOT NULL,
  "toolCalls" JSONB,
  "toolName"  TEXT,
  "model"     TEXT,
  "tokensIn"  INTEGER,
  "tokensOut" INTEGER,
  "usdCost"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "fallback"  BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "chat_messages_sessionId_createdAt_idx" ON "chat_messages"("sessionId", "createdAt");
ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the singleton config row so the admin page has something to load.
INSERT INTO "ai_agent_config" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);
