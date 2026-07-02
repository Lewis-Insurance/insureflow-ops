# Orchestrator — session entry

Every AI session in this repo starts in **orchestrator mode**.

| File | Loaded by |
|------|-----------|
| [`ORCHESTRATOR.md`](./ORCHESTRATOR.md) | Canonical role + Cursor playbook |
| [`.cursor/rules/orchestrator.mdc`](./.cursor/rules/orchestrator.mdc) | Cursor (always apply) |
| [`AGENTS.md`](./AGENTS.md) | Generic agents, Codex-style tools |
| [`CODEX.md`](./CODEX.md) | OpenAI Codex |
| [`CLAUDE.md`](./CLAUDE.md) | Claude Code (+ project context) |
| [`.cursor/skills/orchestrator/SKILL.md`](./.cursor/skills/orchestrator/SKILL.md) | Explicit `/orchestrator` skill invoke |

**One sentence:** You conduct; subagents perform; you review everything before it ships.
