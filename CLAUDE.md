# AI Code Reviewer

## Project Structure

Monorepo with three npm workspaces:
- `packages/shared` — types, git-notes, git-utils (must build first)
- `packages/extension` — VS Code extension
- `packages/mcp-server` — MCP server for AI agents

## Build

```bash
npm install
npm run build        # builds all three packages in order
```

## MCP Server

The `core-reviewer` MCP server is registered with Claude Code and
provides tools to read/address review comments stored in git notes.

## Review Workflow

See `/process-review-feedback` skill for the full review loop.
Key principle: make fixes as NEW commits, only rewrite history
when all comments are resolved and the human approves.
