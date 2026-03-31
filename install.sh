#!/usr/bin/env bash
set -euo pipefail

# AI Code Reviewer — Install Script
# Installs: VS Code extension, Claude Code MCP server + skill
# Safe to run multiple times (idempotent).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
CLAUDE_COMMANDS_DIR="$CLAUDE_DIR/commands"
MCP_SERVER_ENTRY="$SCRIPT_DIR/packages/mcp-server/dist/index.js"
MCP_SERVER_NAME="code-reviewer"
SKILL_SRC="$SCRIPT_DIR/.claude/commands/process-review-feedback.md"
SKILL_DST="$CLAUDE_COMMANDS_DIR/process-review-feedback.md"

# ─── Colors ───────────────────────────────────────────────────────────────────

bold() { printf "\033[1m%s\033[0m" "$*"; }
green() { printf "\033[32m%s\033[0m" "$*"; }
yellow() { printf "\033[33m%s\033[0m" "$*"; }
info()  { echo "  $(green ">>") $*"; }
warn()  { echo "  $(yellow "!!") $*"; }
step()  { echo; echo "$(bold "==> $*")"; }

# ─── Preflight checks ────────────────────────────────────────────────────────

missing=()
command -v node  >/dev/null 2>&1 || missing+=("node")
command -v npm   >/dev/null 2>&1 || missing+=("npm")
command -v code  >/dev/null 2>&1 || missing+=("code (VS Code CLI)")
command -v claude >/dev/null 2>&1 || missing+=("claude (Claude Code CLI)")

if [ ${#missing[@]} -gt 0 ]; then
    echo "Missing required tools: ${missing[*]}"
    exit 1
fi

# ─── Build ────────────────────────────────────────────────────────────────────

step "Building project"
cd "$SCRIPT_DIR"
npm install --silent
npm run build
info "Build complete"

# ─── VS Code extension ───────────────────────────────────────────────────────

step "Installing VS Code extension"
cd "$SCRIPT_DIR/packages/extension"

VSIX_FILE="$(ls -1 *.vsix 2>/dev/null | head -1 || true)"

# Always repackage to pick up any changes
npm run package 2>/dev/null
VSIX_FILE="$(ls -1t *.vsix | head -1)"

code --install-extension "$VSIX_FILE" --force
info "Extension installed: $VSIX_FILE"

# ─── Claude skill (global command) ───────────────────────────────────────────

step "Installing Claude Code skill"
mkdir -p "$CLAUDE_COMMANDS_DIR"

if [ -f "$SKILL_DST" ] && cmp -s "$SKILL_SRC" "$SKILL_DST"; then
    info "Skill already up to date"
else
    cp "$SKILL_SRC" "$SKILL_DST"
    info "Copied process-review-feedback skill to $SKILL_DST"
fi

# ─── Claude MCP server ───────────────────────────────────────────────────────

step "Registering Claude Code MCP server"

# Remove first (if exists) so re-running always picks up path changes.
# Both commands are safe no-ops when the server doesn't exist / already removed.
claude mcp remove --scope user "$MCP_SERVER_NAME" 2>/dev/null || true
claude mcp add --scope user "$MCP_SERVER_NAME" -- node "$MCP_SERVER_ENTRY"
info "MCP server '$MCP_SERVER_NAME' registered (scope: user)"

# ─── Done ─────────────────────────────────────────────────────────────────────

step "Installation complete"
info "VS Code extension: reload VS Code window to activate"
info "Claude skill: use /process-review-feedback in any project"
info "MCP server: available as '$MCP_SERVER_NAME' in Claude Code"
echo
