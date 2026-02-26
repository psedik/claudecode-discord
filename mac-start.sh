#!/bin/bash
# Claude Discord Bot - Auto-update & Start Script
# Usage:
#   ./mac-start.sh          → Start (background + menu bar)
#   ./mac-start.sh --fg     → Foreground mode (for debugging)
#   ./mac-start.sh --stop   → Stop
#   ./mac-start.sh --status → Check status

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

PLIST_NAME="com.claude-discord.plist"
PLIST_SRC="$SCRIPT_DIR/$PLIST_NAME"
PLIST_DST="$HOME/Library/LaunchAgents/$PLIST_NAME"
LABEL="com.claude-discord"
MENUBAR="$SCRIPT_DIR/menubar/ClaudeBotMenu"

# --stop: 중지
if [ "$1" = "--stop" ]; then
    if launchctl list | grep -q "$LABEL"; then
        launchctl unload "$PLIST_DST" 2>/dev/null
        echo "🔴 Bot stopped"
    else
        echo "Bot is not running"
    fi
    # Stop menu bar app too
    pkill -f "ClaudeBotMenu" 2>/dev/null
    exit 0
fi

# --status: 상태 확인
if [ "$1" = "--status" ]; then
    if launchctl list | grep -q "$LABEL"; then
        PID=$(launchctl list | grep "$LABEL" | awk '{print $1}')
        echo "🟢 Bot running (PID: $PID)"
    else
        echo "🔴 Bot stopped"
    fi
    exit 0
fi

# --fg: 포그라운드 실행 (launchd 없이 직접 실행)
if [ "$1" = "--fg" ]; then
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    cd "$SCRIPT_DIR"

    VERSION=$(git describe --tags --always 2>/dev/null || echo "unknown")
    echo "[claude-bot] Current version: $VERSION"
    echo "[claude-bot] Checking for updates..."
    git fetch origin main 2>/dev/null
    LOCAL=$(git rev-parse HEAD 2>/dev/null)
    REMOTE=$(git rev-parse origin/main 2>/dev/null)

    if [ -n "$LOCAL" ] && [ -n "$REMOTE" ] && [ "$LOCAL" != "$REMOTE" ]; then
        echo "[claude-bot] Update available (update from menu bar)"
    else
        echo "[claude-bot] Up to date"
    fi

    if [ ! -d "dist" ]; then
        echo "[claude-bot] No build files found, building..."
        npm run build
    fi

    echo "[claude-bot] Starting bot (foreground)..."
    touch "$SCRIPT_DIR/.bot.lock"
    trap 'rm -f "$SCRIPT_DIR/.bot.lock"' EXIT
    exec node dist/index.js
fi

# Default: background mode (register with launchd)
if [ ! -f "$PLIST_SRC" ]; then
    echo "❌ $PLIST_NAME not found"
    exit 1
fi

# Stop existing bot if running
if launchctl list | grep -q "$LABEL"; then
    echo "🔄 Stopping existing bot..."
    launchctl unload "$PLIST_DST" 2>/dev/null
    sleep 1
fi

# Compile menu bar app (rebuild if source is newer than binary)
if [ -f "$SCRIPT_DIR/menubar/ClaudeBotMenu.swift" ]; then
    if [ ! -f "$MENUBAR" ] || [ "$SCRIPT_DIR/menubar/ClaudeBotMenu.swift" -nt "$MENUBAR" ]; then
        echo "🔨 Building menu bar app..."
        swiftc -o "$MENUBAR" "$SCRIPT_DIR/menubar/ClaudeBotMenu.swift" -framework Cocoa 2>/dev/null
    fi
fi

# Start menu bar app (shows settings dialog if .env not configured)
if [ -f "$MENUBAR" ]; then
    pkill -f "ClaudeBotMenu" 2>/dev/null
    nohup "$MENUBAR" > /dev/null 2>&1 &
fi

# Start bot if .env is properly configured, otherwise let menu bar handle setup
is_env_configured() {
    [ -f "$ENV_FILE" ] || return 1
    local token=$(grep "^DISCORD_BOT_TOKEN=" "$ENV_FILE" 2>/dev/null | cut -d= -f2)
    local guild=$(grep "^DISCORD_GUILD_ID=" "$ENV_FILE" 2>/dev/null | cut -d= -f2)
    [ -n "$token" ] && [ "$token" != "your_bot_token_here" ] && \
    [ -n "$guild" ] && [ "$guild" != "your_server_id_here" ]
}

if is_env_configured; then
    cp "$PLIST_SRC" "$PLIST_DST"
    launchctl load "$PLIST_DST"
    if [ -f "$MENUBAR" ]; then
        echo "🟢 Bot started in background (menu bar active)"
    else
        echo "🟢 Bot started in background"
    fi
else
    echo "⚙️ .env not found. Please configure settings from the menu bar icon."
fi
echo "   Stop:   ./mac-start.sh --stop"
echo "   Status: ./mac-start.sh --status"
echo "   Log:    tail -f bot.log"
