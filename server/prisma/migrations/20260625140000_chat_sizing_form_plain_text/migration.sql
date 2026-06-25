-- The assistant now collects sizing via an inline form too (collect_sizing),
-- and the prompt was tightened to enforce plain text and short replies. Reset
-- the prompt so the newest DEFAULT_SYSTEM_PROMPT backfills, and enable the new
-- tool. Admin-customized prompts (which won't match the baseline) are kept.

-- Reset to '' ONLY when the row still holds the previous default (the
-- contact-form-flow prompt). getAiConfig() then backfills the newest prompt.
UPDATE "ai_agent_config"
SET "systemPrompt" = ''
WHERE "id" = 'default'
  AND "systemPrompt" LIKE 'You are NTM''s quoting assistant. You help a small-business owner build a managed-IT quote%';

-- Enable collect_sizing. Append only if missing so admin tool choices and the
-- already-added tools are preserved and never duplicated.
ALTER TABLE "ai_agent_config"
  ALTER COLUMN "allowedTools"
  SET DEFAULT 'highlight_field,prefill_field,navigate,suggest_addon,suggest_package,request_followup,collect_contact,collect_sizing,set_sizing,go_to_checkout';

UPDATE "ai_agent_config"
SET "allowedTools" = "allowedTools" || ',collect_sizing'
WHERE "id" = 'default' AND "allowedTools" NOT LIKE '%collect_sizing%';
