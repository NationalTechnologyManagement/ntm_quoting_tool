-- Guardrails moved into code and are always prepended at runtime. The
-- admin-editable systemPrompt now contains only the persona + playbook.
-- Clear the existing systemPrompt row IF it still matches the previous
-- baseline (which had the guardrails inline) so the in-app bootstrap
-- re-seeds with the cleaner playbook-only default. Admin customizations
-- — anything not matching that exact baseline — are preserved.

UPDATE "ai_agent_config"
SET "systemPrompt" = ''
WHERE "id" = 'default'
  AND "systemPrompt" LIKE 'You are NTM''s quoting assistant on the customer-facing quoting tool. You are friendly, proactive, and conversational%pre-fills and stops without asking what''s next is also a bug.%';
