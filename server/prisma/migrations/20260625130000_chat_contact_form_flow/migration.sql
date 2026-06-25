-- The AI assistant flow changed: it now collects contact info via an inline
-- chat form first, then asks locations and desktop/web users, picks a package,
-- and jumps the customer to the sign-and-pay page. Tone is plain text and
-- short. This adds three UI-only tools (collect_contact, set_sizing,
-- go_to_checkout) and re-bootstraps the prompt + greeting from code.

-- 1. Reset systemPrompt to '' ONLY when it still matches the current code
--    baseline, so getAiConfig() backfills the new DEFAULT_SYSTEM_PROMPT on the
--    next request. Admin-customized prompts (which won't match) are preserved.
UPDATE "ai_agent_config"
SET "systemPrompt" = ''
WHERE "id" = 'default'
  AND "systemPrompt" LIKE 'You are NTM''s quoting assistant — friendly, proactive, and conversational, like a knowledgeable rep%CONTACT INFO — After add-ons, ask Full Name%';

-- 2. Enable the three new tools. Append each only when it's missing, so an
--    admin's existing tool selection is preserved and we never duplicate.
ALTER TABLE "ai_agent_config"
  ALTER COLUMN "allowedTools"
  SET DEFAULT 'highlight_field,prefill_field,navigate,suggest_addon,suggest_package,request_followup,collect_contact,set_sizing,go_to_checkout';

UPDATE "ai_agent_config"
SET "allowedTools" = "allowedTools" || ',collect_contact'
WHERE "id" = 'default' AND "allowedTools" NOT LIKE '%collect_contact%';

UPDATE "ai_agent_config"
SET "allowedTools" = "allowedTools" || ',set_sizing'
WHERE "id" = 'default' AND "allowedTools" NOT LIKE '%set_sizing%';

UPDATE "ai_agent_config"
SET "allowedTools" = "allowedTools" || ',go_to_checkout'
WHERE "id" = 'default' AND "allowedTools" NOT LIKE '%go_to_checkout%';

-- 3. Plain-text greeting (no emoji / long dash), matching the new tone. Only
--    update the row if it still holds the old default so admin edits survive.
ALTER TABLE "ai_agent_config"
  ALTER COLUMN "greeting"
  SET DEFAULT 'Hi, I''m here to help you build your quote. I can answer questions, recommend a package, and fill things out for you. What can I help with first?';

UPDATE "ai_agent_config"
SET "greeting" = 'Hi, I''m here to help you build your quote. I can answer questions, recommend a package, and fill things out for you. What can I help with first?'
WHERE "id" = 'default'
  AND "greeting" = 'Hi! 👋 I''m here to help you build your quote — I can answer questions, recommend a package, and even fill out fields for you. What can I help you with first?';
