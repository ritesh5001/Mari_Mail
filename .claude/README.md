# .claude/ — MariMail Build System

Project-level Claude Code configuration. Drives the autopilot 8-phase build of MariMail.

```
.claude/
├── settings.json          # Autopilot permissions (bypassPermissions mode)
├── README.md              # This file
├── phases/                # One agent-ready prompt per phase
│   ├── phase-1.md         # Foundation, Auth & Monorepo
│   ├── phase-2.md         # Vessel & Company DBMS
│   ├── phase-3.md         # Contact Intelligence Engine
│   ├── phase-4.md         # ETA System & Port Radar
│   ├── phase-5.md         # Email Account & Sending Engine
│   ├── phase-6.md         # Campaign Builder & ETA Sequencer
│   ├── phase-7.md         # Analytics, CRM & Reporting
│   └── phase-8.md         # Billing, Admin, Polish & Launch
├── docs/                  # Cross-phase technical specs
│   ├── schema.md          # Complete Prisma model reference
│   ├── filters.md         # 100+ filter spec for FilterBuilder
│   └── eta-engine.md      # ETA automation, Port Radar, port rules
├── commands/              # Custom slash commands
│   ├── phase.md           # /phase <n> — execute build phase N
│   └── status.md          # /status  — show build progress
└── agents/                # Custom subagents
    └── marine-reviewer.md # domain-aware reviewer
```

## How to use

Once a phase is ready to build, tell Claude:

> `/phase 1`

Claude reads `phases/phase-1.md`, plans tasks via TodoWrite, executes end-to-end against the acceptance criteria, and marks the phase complete only when every box is checked.

To check build progress at any point:

> `/status`

To run a domain-aware code review after a phase ships:

> Use the **marine-reviewer** agent on the current branch.

## Autopilot mode

`.claude/settings.json` sets `permissions.defaultMode = "bypassPermissions"`. Claude will not stop to ask permission for file edits, installs, migrations, or test runs. Destructive ops (`rm -rf /`, `git push --force`, `git reset --hard`, `sudo rm`) are still denied.

## Source of truth

The plan document at `docs/MariMail Plan.docx` is the authoritative spec. Every phase prompt is extracted from it. If a phase prompt and the docx disagree, the docx wins.

## Phase rules

1. **One phase at a time.** Phase N+1 does not start until N is acceptance-complete and the user signals to continue.
2. **Stack is locked.** No library substitutions without user approval.
3. **Acceptance criteria are the contract.** Phase done = every box checked.
