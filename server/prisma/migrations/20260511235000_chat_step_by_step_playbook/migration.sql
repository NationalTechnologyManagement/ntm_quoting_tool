-- Force the AI agent to re-bootstrap its systemPrompt from code on the next
-- request, IFF the existing value still matches the previous default
-- (the "always speak / friendly, proactive, conversational" baseline from
-- the previous deploy). Admin customizations are preserved.

UPDATE "ai_agent_config"
SET "systemPrompt" = ''
WHERE "id" = 'default'
  AND "systemPrompt" LIKE 'You are NTM''s quoting assistant on the customer-facing quoting tool. You are friendly, proactive, and conversational%narrate what you just did:%';
