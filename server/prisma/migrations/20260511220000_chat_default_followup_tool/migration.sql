-- Bump the AI agent's default allowed-tools list to include the new
-- request_followup tool. Also refresh the default greeting copy.
-- Existing rows get the new tool appended IF they haven't customized the
-- list — preserve admin edits otherwise.

ALTER TABLE "ai_agent_config"
  ALTER COLUMN "allowedTools"
  SET DEFAULT 'highlight_field,prefill_field,navigate,suggest_addon,suggest_package,request_followup';

ALTER TABLE "ai_agent_config"
  ALTER COLUMN "greeting"
  SET DEFAULT 'Hi! 👋 I''m here to help you build your quote — I can answer questions, recommend a package, and even fill out fields for you. What can I help you with first?';

UPDATE "ai_agent_config"
SET "allowedTools" = 'highlight_field,prefill_field,navigate,suggest_addon,suggest_package,request_followup'
WHERE "allowedTools" = 'highlight_field,prefill_field,navigate,suggest_addon,suggest_package';

UPDATE "ai_agent_config"
SET "greeting" = 'Hi! 👋 I''m here to help you build your quote — I can answer questions, recommend a package, and even fill out fields for you. What can I help you with first?'
WHERE "greeting" = 'Hi! I can help you build your quote. What would you like to know?';

-- Wipe systemPrompt on the singleton row when it still equals the prior
-- baseline. Empty value triggers the in-app bootstrap path which seeds the
-- fresh DEFAULT_SYSTEM_PROMPT from code on next read. Admin edits (anything
-- not matching the prior baseline verbatim) are preserved.
UPDATE "ai_agent_config"
SET "systemPrompt" = ''
WHERE "id" = 'default'
  AND "systemPrompt" LIKE 'You are NTM''s quoting assistant on the customer-facing quoting tool.%HARD RULES%TONE: Friendly, brief, plain language. No jargon dumps. Two-to-four sentences per turn unless they explicitly ask for detail.';
