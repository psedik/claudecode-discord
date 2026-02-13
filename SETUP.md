# Setup Guide

Complete guide for installing and running the Discord bot that manages Claude Code sessions.

> **[Korean version (한국어)](SETUP.kr.md)**

---

## 0. Auto Install (Recommended)

After cloning, run the install script to automatically check and install Node.js, Claude Code CLI, and npm packages.

```bash
git clone git@github.com:chadingTV/claudecode-discord.git
cd claudecode-discord

# macOS / Linux
./install.sh

# Windows (cmd or PowerShell)
install.bat
```

Once the script completes, edit the `.env` file and run `npm run dev`.
If auto install fails, follow the manual installation steps below.

---

## 0-M. Manual Install - Prerequisites

### Node.js

Node.js 20 or higher is required.

```bash
node -v   # v20.x.x or higher
```

If not installed:

- **macOS**: `brew install node` or download from [nodejs.org](https://nodejs.org)
- **Linux/WSL**:
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```
- **Windows**: See Windows section below or `winget install OpenJS.NodeJS.LTS`

### Claude Code

This bot requires **Claude Code CLI** to be installed and logged in.

```bash
claude --version   # Verify installation
```

If not installed:

```bash
npm install -g @anthropic-ai/claude-code
```

First-time login:

```bash
claude
# Browser opens for Anthropic account login
# After login, CLI is ready to use
```

> **⚠️ Important: You MUST run `claude` in the terminal and log in before starting the bot.**
> The bot cannot create Claude Code sessions if you haven't logged in first.
> To verify: run `claude` — if it starts a conversation immediately, you're logged in.

> Claude Code uses **OAuth authentication**, not an API key.
> No `ANTHROPIC_API_KEY` environment variable is needed.
> (Max plan users: use as-is. API key users: set `ANTHROPIC_API_KEY` env var)

---

## 0-W. Windows Users

Windows supports both **native** and **WSL** modes.

### Option A: Windows Native

Running `install.bat` installs Node.js via `winget` and handles the rest automatically.
If `better-sqlite3` installation fails, Visual Studio Build Tools are required:
```powershell
winget install Microsoft.VisualStudio.2022.BuildTools
```
Select the "Desktop development with C++" workload after installation.

### Option B: WSL (Recommended)

WSL provides the same environment as macOS/Linux.

### Installing WSL

Run PowerShell as **Administrator**:

```powershell
wsl --install
```

Reboot after installation. Ubuntu will be installed automatically.
Open **Ubuntu** from the Start menu to get a Linux terminal.

### Node.js in WSL

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # Verify v22.x.x
```

### Claude Code in WSL

```bash
npm install -g @anthropic-ai/claude-code
claude   # First-time login
```

### Git in WSL

```bash
sudo apt-get install -y git
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

### Notes

- Project paths in WSL use `/home/username/projects/...` format
- Windows filesystem (`/mnt/c/...`) is accessible but slower; use WSL internal paths
- For VSCode, install **Remote - WSL** extension, then run `code .` from WSL

> **⚠️ Session sharing note:** If you use VSCode natively on Windows (most users do), you must run the bot on **Windows Native** (Option A) as well.
> Running the bot in WSL gives project paths like `/home/...`, which won't match VSCode's `C:\Users\...` paths — so Claude Code sessions from VSCode cannot be resumed from Discord.

> All subsequent steps in WSL are identical to macOS.

---

## 1. Clone and Install

```bash
git clone git@github.com:chadingTV/claudecode-discord.git
cd claudecode-discord
npm install
```

> For HTTPS clone:
> ```bash
> git clone https://github.com/chadingTV/claudecode-discord.git
> ```

### Verify Build (Optional)

```bash
npm run build   # Check for type errors
```

---

## 2. Create Discord Bot

### 2-1. Create Discord Application

1. Go to https://discord.com/developers/applications
2. Click **"New Application"**
3. Enter a name (e.g., "My Claude Code") → **Create**

### 2-2. Bot Settings

1. Click **"Bot"** in the left menu
2. Click **"Reset Token"** → Copy the token (shown only once!)
   - This is your `DISCORD_BOT_TOKEN`
3. Scroll down to **Privileged Gateway Intents**:
   - Enable **MESSAGE CONTENT INTENT** (required!)
   - Save Changes

### 2-3. Invite Bot to Server

1. Click **"OAuth2"** in the left menu
2. In **"OAuth2 URL Generator"**:
   - **SCOPES**: Check `bot`, `applications.commands`
   - **BOT PERMISSIONS**: Check `Send Messages`, `Embed Links`, `Read Message History`, `Use Slash Commands`
3. Copy the generated URL and paste in your browser
4. Select the server to invite to → **Authorize**

---

## 3. Get Discord Server ID

1. Discord app (desktop/mobile) → **User Settings** (gear icon)
2. **App Settings > Advanced** → Enable **Developer Mode**
3. Right-click server name (desktop) or long-press (mobile) → **"Copy Server ID"**
   - This is your `DISCORD_GUILD_ID`

## 4. Get User ID

1. With Developer Mode enabled
2. Click your profile → **"Copy User ID"**
   - This is your `ALLOWED_USER_IDS`
   - Multiple users: comma-separated: `123456789,987654321`

---

## 5. Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_GUILD_ID=your_server_id_here
ALLOWED_USER_IDS=your_user_id_here
BASE_PROJECT_DIR=/Users/yourname/projects
RATE_LIMIT_PER_MINUTE=10
SHOW_COST=true
```

| Variable | Description | Example |
|----------|-------------|---------|
| `DISCORD_BOT_TOKEN` | Bot token from step 2-2 | `MTQ3MDc...` |
| `DISCORD_GUILD_ID` | Server ID from step 3 | `1470730378955456578` |
| `ALLOWED_USER_IDS` | User ID from step 4 | `942037337519575091` |
| `BASE_PROJECT_DIR` | Parent directory of your projects | `/Users/you/projects` |
| `RATE_LIMIT_PER_MINUTE` | Message rate limit (default 10) | `10` |
| `SHOW_COST` | Show estimated API cost in results (default true) | `false` |

`BASE_PROJECT_DIR` is the base path when using folder names in `/register`.
Example: If `BASE_PROJECT_DIR=/Users/you/projects`, then `/register my-app` → `/Users/you/projects/my-app`

---

## 6. Run

```bash
# Development mode (hot reload)
npm run dev

# Or production build
npm run build
npm start
```

On successful startup:
```
Bot logged in as MyClaudeCode#1234
Registered 8 slash commands
```

---

## 7. Usage

### Register a Project to a Channel

In Discord, go to the desired channel:
```
/register path:my-project-folder
```

**How path resolution works:**

| Input type | Example input | Resolved path (`BASE_PROJECT_DIR=/Users/you/projects`) |
|---|---|---|
| Folder name only | `my-app` | `/Users/you/projects/my-app` |
| Relative path | `work/my-app` | `/Users/you/projects/work/my-app` |
| Absolute path | `/Users/you/other/project` | `/Users/you/other/project` (used as-is) |

> **Tip:** Run `pwd` in your terminal inside the project directory to get the absolute path.
> When using an absolute path, `BASE_PROJECT_DIR` is ignored and the path is used directly.

### Send Messages to Claude

Send a regular message in a registered channel and Claude Code will respond:
```
Explain the structure of this project
```

Attach images, documents, or code files and Claude can read and analyze them.

### In-Progress Controls

- **⏹️ Stop** button appears on progress messages for instant cancellation
- Sending a new message while busy shows "previous task in progress" notice
- `/stop` slash command also available

### Tool Approval

When Claude requests file edits, creation, or command execution, buttons appear:
- **Approve** — Approve this one time
- **Deny** — Reject
- **Auto-approve All** — Auto-approve all future requests in this channel

### Session Management

- `/sessions` — Browse existing sessions and choose to **Resume** or **Delete**
- `/clear-sessions` — Delete all session files for the current project

### Slash Commands

| Command | Description |
|---------|-------------|
| `/register path:<folder>` | Register a project to this channel |
| `/unregister` | Unregister the project |
| `/status` | Check all project/session statuses |
| `/stop` | Stop the Claude session in this channel |
| `/auto-approve mode:on\|off` | Toggle auto-approval |
| `/sessions` | List sessions to resume or delete |
| `/clear-sessions` | Delete all sessions for the project |

---

## 8. Multi-PC Setup

Create a separate Discord bot for each PC and invite them to the same Discord server (guild).

1. Create a **new bot** per PC in Discord Developer Portal (repeat step 2)
2. Invite each bot to the same Discord server
3. Clone this repo on each PC and set the PC's bot token in `.env`
4. Each bot registers projects to different channels via `/register`

Multiple bots in the same guild are distinguishable by bot name when running slash commands.

---

## 9. Security

- Discord servers are **private** by default (no access without invite link)
- Only users in `ALLOWED_USER_IDS` can interact with the bot
- Never expose your bot token. If compromised, immediately **Reset Token** in Discord Developer Portal
- File attachments: executable files (.exe, .bat, etc.) blocked, 25MB size limit

---

## 10. Troubleshooting

### Bot doesn't respond to messages
- Verify MESSAGE CONTENT INTENT is enabled (step 2-2)
- Check that your ID is in `ALLOWED_USER_IDS`

### "Unknown interaction" error
- Occurs when bot can't respond within 3 seconds → usually resolves automatically

### Slash commands not showing
- Ensure `applications.commands` scope was checked when inviting the bot
- May take up to 1 hour after bot restart (Discord cache)

### Resuming sessions
- Sessions persist across bot restarts (session ID stored in DB)
- Session records are kept even after `/stop` (auto-resumes on next message)
- Use `/sessions` to browse and resume or delete previous sessions
- Use `/clear-sessions` to delete all sessions at once
- `/unregister` removes the DB session mapping

### Claude Code issues
- Verify installation with `claude --version`
- Run `claude` to check login status
- If not logged in, run `claude` to re-authenticate
