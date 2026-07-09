-- The assistant can now email the customer their quote (send_quote) and
-- collect one extra recipient's address (collect_recipients). Enable both
-- tools; append only if missing so admin tool choices and prior tools are
-- preserved and never duplicated.

ALTER TABLE "ai_agent_config"
  ALTER COLUMN "allowedTools"
  SET DEFAULT 'highlight_field,prefill_field,navigate,suggest_addon,suggest_package,request_followup,collect_contact,collect_sizing,set_sizing,go_to_checkout,send_quote,collect_recipients';

UPDATE "ai_agent_config"
SET "allowedTools" = "allowedTools" || ',send_quote'
WHERE "id" = 'default' AND "allowedTools" NOT LIKE '%send_quote%';

UPDATE "ai_agent_config"
SET "allowedTools" = "allowedTools" || ',collect_recipients'
WHERE "id" = 'default' AND "allowedTools" NOT LIKE '%collect_recipients%';
