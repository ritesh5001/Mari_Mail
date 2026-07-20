---
description: Execute a MariMail build phase end-to-end against its acceptance criteria
argument-hint: <phase number 1-8>
---

You are entering **autopilot execution mode** for MariMail Phase $1.

## Steps

1. Read `.claude/phases/phase-$1.md` — this is your contract for this phase.
2. Read `docs/project-context.md` for project rules, stack, and design tokens.
3. Reference `.claude/docs/schema.md`, `.claude/docs/filters.md`, `.claude/docs/eta-engine.md` as needed for technical specs.
4. Use `TodoWrite` to break the phase into ordered tasks. One task per concrete deliverable.
5. Execute every task. Do not stop to ask permission for routine operations (file edits, `pnpm install`, `pnpm db:migrate`, `pnpm test`, `pnpm dev`).
6. After implementation: run lint, typecheck, and the relevant tests. Fix all errors.
7. Walk through the **Acceptance Criteria** at the bottom of `phase-$1.md`. Verify each item; report pass/fail.
8. End with a concise summary: what shipped, what's pending, any blockers.

## Hard rules

- Stack is locked — no library substitutions.
- TypeScript strict mode. No `any` without inline justification.
- Server Components first on the web app.
- All API inputs validated with Zod.
- AES-256-GCM for credentials at rest. Never log plaintext.
- No emoji in source. Comments only when WHY is non-obvious.
- All workspace-scoped models include `workspaceId String? @index`.
- UTC in DB; convert at UI edge.
- No third-party email/campaign SaaS.

## When the phase is done

Update `.claude/phases/phase-$1.md` — change `**Status:**` from `⏳ pending` to `✅ complete — <YYYY-MM-DD>`.

Do not start phase $(($1 + 1)) until the user explicitly says so.
