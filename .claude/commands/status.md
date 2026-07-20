---
description: Show MariMail build status across all 8 phases
---

Run this analysis and print a single markdown table.

1. For each file `.claude/phases/phase-1.md` … `phase-8.md`, read the `**Status:**` line near the top.
2. Print a table:

| Phase | Title | Status |
|---|---|---|
| 1 | Foundation, Auth & Monorepo | … |
| 2 | Vessel & Company DBMS | … |
| 3 | Contact Intelligence Engine | … |
| 4 | ETA System & Port Radar | … |
| 5 | Email Account & Sending Engine | … |
| 6 | Campaign Builder & ETA Sequencer | … |
| 7 | Analytics, CRM & Operator Intelligence | … |
| 8 | Billing, Admin, Polish & Launch | … |

3. Then run `git status --short` and `git log --oneline -5` and print them in fenced code blocks.
4. End with a one-line recommendation: which phase to start next.

Do not modify any files.
