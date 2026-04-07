#!/usr/bin/env bash
set -euo pipefail

# AI Review Loop — Install Script
# Installs: VS Code extension, Claude Code MCP server + skill, Codex prompt + MCP server
# Safe to run multiple times (idempotent).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
CLAUDE_COMMANDS_DIR="$CLAUDE_DIR/commands"
CODEX_DIR="$HOME/.codex"
CODEX_PROMPTS_DIR="$CODEX_DIR/prompts"
MCP_SERVER_ENTRY="$SCRIPT_DIR/packages/mcp-server/dist/index.js"
MCP_SERVER_NAME="ai-review-loop"
SKILL_SRC="$SCRIPT_DIR/.claude/commands/process-review-feedback.md"
SKILL_DST="$CLAUDE_COMMANDS_DIR/process-review-feedback.md"
CODEX_PROMPT_SRC="$SCRIPT_DIR/.codex/prompts/process-review-feedback.md"
CODEX_PROMPT_DST="$CODEX_PROMPTS_DIR/process-review-feedback.md"

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

# Optional tools (warn but don't block)
HAS_CODEX=false
if command -v codex >/dev/null 2>&1; then
    HAS_CODEX=true
else
    warn "codex CLI not found — skipping Codex prompt and MCP registration"
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

# ─── Codex prompt (slash command) ────────────────────────────────────────────

if [ "$HAS_CODEX" = true ]; then
    step "Installing Codex prompt"
    mkdir -p "$CODEX_PROMPTS_DIR"

    if [ -f "$CODEX_PROMPT_DST" ] && cmp -s "$CODEX_PROMPT_SRC" "$CODEX_PROMPT_DST"; then
        info "Codex prompt already up to date"
    else
        cp "$CODEX_PROMPT_SRC" "$CODEX_PROMPT_DST"
        info "Copied process-review-feedback prompt to $CODEX_PROMPT_DST"
    fi
fi

# ─── Codex MCP server ───────────────────────────────────────────────────────

if [ "$HAS_CODEX" = true ]; then
    step "Registering Codex MCP server"
    codex mcp add "$MCP_SERVER_NAME" -- node "$MCP_SERVER_ENTRY"
    info "MCP server '$MCP_SERVER_NAME' registered in Codex"
fi

# ─── Done ─────────────────────────────────────────────────────────────────────

step "Installation complete"
info "VS Code extension: reload VS Code window to activate"
info "Claude skill: use /process-review-feedback in any project"
info "MCP server: available as '$MCP_SERVER_NAME' in Claude Code"
if [ "$HAS_CODEX" = true ]; then
    info "Codex prompt: use /prompts:process-review-feedback in Codex"
    info "Codex MCP server: available as '$MCP_SERVER_NAME' in Codex"
fi
echo
