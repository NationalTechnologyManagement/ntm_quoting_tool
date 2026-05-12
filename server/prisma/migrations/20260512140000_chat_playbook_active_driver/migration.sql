-- Force the AI agent's systemPrompt to re-bootstrap from code on the next
-- request — only when the row still matches the prior baseline (the
-- "playbook with bullet add-on menu, no commit-via-tool guidance"). Admin
-- customizations are preserved (anything not matching that exact baseline).

UPDATE "ai_agent_config"
SET "systemPrompt" = ''
WHERE "id" = 'default'
  AND "systemPrompt" LIKE 'You are NTM''s quoting assistant — friendly, proactive, and conversational%suggest_package with the matching id and explain why using the package features + prices in the snapshot.%';
