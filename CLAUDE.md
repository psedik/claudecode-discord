# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Discord bot that manages multiple Claude Code sessions from mobile Discord. Each Discord channel maps to an independent Claude Agent SDK session tied to a project directory. Write tools (Edit, Write, Bash) require approval via Discord buttons; read-only tools are auto-approved. File attachments (images, documents, code files) are downloaded to `.claude-uploads/` in the project directory and passed to Claude via Read tool. Dangerous executables (.exe, .bat, etc.) are blocked; 25MB size limit enforced. Supports macOS, Linux, and Windows (native/WSL).

## Commands

```bash
npm run dev          # Development (tsx)
npm run build        # Production build (tsup, ESM)
npm start            # Run built output
npm test             # Tests (vitest)
npm run test:watch   # Test watch mode
npx tsc --noEmit     # Type check only
./install.sh         # macOS/Linux auto-install (Node.js, Claude Code, npm)
install.bat          # Windows auto-install
```

## Architecture

```
[Mobile Discord] <-> [Discord Bot (discord.js v14)] <-> [SessionManager] <-> [Claude Agent SDK]
                              |
                        [SQLite (better-sqlite3)]
```

**Core data flow:** Message in registered channel -> `message.ts` handler validates auth/rate-limit -> concurrent session check (rejects if busy) -> file attachments downloaded (images + documents) -> `SessionManager.sendMessage()` creates/resumes Agent SDK `query()` -> streaming response edited into Discord message every 1.5s -> heartbeat every 15s before text output (tool name, elapsed time, tool count) -> Stop button on progress messages for instant cancellation -> `canUseTool` callback auto-approves read-only tools, otherwise sends Discord button embed -> user approve/deny -> promise resolve -> result embed (cost/duration) sent.

### File Structure

```
claudecode-discord/
├── install.sh              # macOS/Linux auto-install script
├── install.bat             # Windows auto-install script
├── .env.example            # Environment variable template
├── src/
│   ├── index.ts            # Entry point
│   ├── bot/
│   │   ├── client.ts       # Discord bot init & event routing
│   │   ├── commands/       # Slash commands (8)
│   │   │   ├── register.ts
│   │   │   ├── unregister.ts
│   │   │   ├── status.ts
│   │   │   ├── stop.ts
│   │   │   ├── auto-approve.ts
│   │   │   ├── sessions.ts
│   │   │   └── clear-sessions.ts
│   │   └── handlers/
│   │       ├── message.ts      # Message handling, file downloads
│   │       └── interaction.ts  # Button/select menu handling
│   ├── claude/
│   │   ├── session-manager.ts  # Session lifecycle, progress display
│   │   └── output-formatter.ts # Discord output formatting
│   ├── db/
│   │   ├── database.ts     # SQLite init & queries
│   │   └── types.ts
│   ├── security/
│   │   └── guard.ts        # Auth, rate limit, path validation
│   └── utils/
│       └── config.ts       # Env var validation (zod v4)
├── SETUP.md / SETUP.kr.md  # Detailed setup guide (EN/KR)
├── README.md / README.kr.md
├── package.json
└── tsconfig.json
```

### Key Modules

- **`src/bot/client.ts`** — Discord.js client init, event routing, guild-scoped slash command registration
- **`src/bot/commands/`** — 8 slash commands: register, unregister, status, stop, auto-approve, sessions, clear-sessions
- **`src/bot/handlers/message.ts`** — Routes channel messages to SessionManager after security checks. Downloads image and document attachments to `.claude-uploads/`. Rejects concurrent messages when a session is active. Blocks dangerous file types (.exe, .bat, etc.) and enforces 25MB size limit
- **`src/bot/handlers/interaction.ts`** — Handles button interactions (approve/deny/approve-all/stop/session-resume/session-delete/session-cancel) and StringSelectMenu (session selection with Resume/Delete/Cancel buttons)
- **`src/claude/session-manager.ts`** — Singleton managing per-channel active sessions. Implements approval workflow via Agent SDK `query()` and `canUseTool` callback. requestId-based Map for pending approvals (5min timeout). Session resume via SDK session ID. Auto-resumes from DB session_id on bot restart. Heartbeat (15s interval) shows progress before text output. Stop button on progress messages for instant cancellation. Cleans up active session in finally block
- **`src/bot/commands/sessions.ts`** — Scans `~/.claude/projects/` JSONL session files to list existing sessions. Filters out empty sessions (<512 bytes, no user message). Strips IDE-injected tags from session labels. Discord StringSelectMenu for session selection
- **`src/bot/commands/clear-sessions.ts`** — Bulk deletes all JSONL session files for the registered project
- **`src/claude/output-formatter.ts`** — Message splitting at Discord 2000-char limit with markdown code block fence preservation. Tool approval request and result embed generation. Stop button factory
- **`src/db/database.ts`** — SQLite WAL mode. data.db auto-created. 2 tables: `projects` (channel->project path mapping, auto_approve flag), `sessions` (session state tracking, SDK session_id storage)
- **`src/security/guard.ts`** — User whitelist (ALLOWED_USER_IDS), in-memory sliding window rate limit, path traversal (`..`) blocking
- **`src/utils/config.ts`** — Zod v4 schema for env var validation, singleton pattern

### Tool Approval Logic (`canUseTool`)

1. Read-only tools (Read, Glob, Grep, WebSearch, WebFetch, TodoWrite) -> always auto-approved
2. Channel `auto_approve` enabled -> auto-approved
3. Otherwise -> Discord button embed sent, awaits user response (5min timeout, denied if no response)

### Session States

- **🟢 online** — Claude is actively working
- **🟡 waiting** — Awaiting tool use approval
- **⚪ idle** — Task complete, awaiting next input
- **🔴 offline** — No session

### Multi-PC Support

Create a separate Discord bot per PC, invite all to the same guild. Each bot registers projects to different channels for independent operation.

## TypeScript Conventions

- ESM modules (`"type": "module"`), `.js` extension for local imports
- strict mode, `noUnusedLocals` and `noUnusedParameters` enabled
- Target: ES2022, moduleResolution: bundler
- Zod v4 (API differs from v3)
- Use `path.join()`, `path.resolve()` for path handling (Windows compat)
- Use `split(/[\\/]/)` for filename extraction (macOS/Windows path separator support)

## Environment Setup

Copy `.env.example` to `.env` and fill in values. Required: `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `ALLOWED_USER_IDS`, `BASE_PROJECT_DIR`. Optional: `RATE_LIMIT_PER_MINUTE` (default 10). data.db is auto-created on first run.
