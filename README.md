# AI Code Reviewer

A VS Code extension that provides a GitLab-MR-style code review
experience for AI-generated commits. Browse commits on a feature
branch, view diffs, leave line-level comments, submit the review,
and have your AI agent (Claude Code or Codex) read and address
feedback via MCP tools.

The agent rebases/amends but never pushes -- the human always pushes.

## How It Works

1. You create a feature branch and let an AI agent generate commits
2. Open VS Code -- the **AI Code Review** sidebar shows commits
   since the branch diverged from main
3. Click commits to see changed files, click files to see diffs
4. Leave line-level comments directly in the diff using the native
   VS Code comment UI
5. Submit the review -- the agent picks up your feedback via MCP
   tools and addresses each comment
6. Re-review after the agent rebases, with comments automatically
   mapped to new commit SHAs

All review data is stored in **git notes**
(`refs/notes/code-review` and `refs/notes/code-review-sessions`),
so it travels with the repo and requires no external services.

## Setup

### Prerequisites

- Node.js >= 18
- VS Code >= 1.95
- Git

### Install from Release (Recommended)

Download the latest release from the
[Releases page](../../releases/latest). Each release includes:

- **`ai-code-reviewer-X.Y.Z.vsix`** — VS Code extension
- **`mcp-server.tar.gz`** — MCP server for AI agents
- **`skill-prompts.tar.gz`** — Claude Code skill and Codex prompt

**1. Install the VS Code extension:**

```bash
code --install-extension ai-code-reviewer-*.vsix
```

**2. Set up the MCP server:**

```bash
# Extract to a permanent location
mkdir -p ~/.ai-code-reviewer/mcp-server
tar -xzf mcp-server.tar.gz -C ~/.ai-code-reviewer/mcp-server
cd ~/.ai-code-reviewer/mcp-server && npm install --omit=dev
```

Then register it with your AI agent (see
[Connect the MCP Server](#connect-the-mcp-server-to-your-ai-agent)
below).

**3. Install the skill/prompt files:**

```bash
tar -xzf skill-prompts.tar.gz
# Claude Code
mkdir -p ~/.claude/commands
cp .claude/commands/process-review-feedback.md ~/.claude/commands/

# Codex (optional)
mkdir -p ~/.codex/prompts
cp .codex/prompts/process-review-feedback.md ~/.codex/prompts/
```

### Install from Source

```bash
git clone https://github.com/justinrush/ai-review-loop.git
cd ai-review-loop
npm install
npm run build
```

Optionally package and install the VS Code extension:

```bash
cd packages/extension
npm run package
code --install-extension ai-code-reviewer-*.vsix
```

### Connect the MCP Server to Your AI Agent

**Claude Code:**

```bash
# If installed from release:
claude mcp add code-reviewer -- node ~/.ai-code-reviewer/mcp-server/dist/index.js

# If installed from source:
claude mcp add code-reviewer -- node /absolute/path/to/ai-review-loop/packages/mcp-server/dist/index.js
```

**Codex:**

```bash
# If installed from release:
codex mcp add code-reviewer -- node ~/.ai-code-reviewer/mcp-server/dist/index.js

# If installed from source:
codex mcp add code-reviewer -- node /absolute/path/to/ai-review-loop/packages/mcp-server/dist/index.js
```

The MCP server exposes these tools to the agent:

| Tool | Purpose |
|------|---------|
| `get_active_review` | Get the active session and open comments |
| `get_review_comments` | Get all comments with context (filterable) |
| `mark_comment_addressed` | Mark a comment as addressed after fixing |
| `reply_to_comment` | Add a reply to a comment thread |
| `get_diff_context` | Get code snippet around a comment's lines |

## Usage

### Starting a Review

1. Check out a feature branch that is ahead of your base branch
   (default: `main`)
2. Open the **AI Code Review** panel in the activity bar
3. Run **AI Code Review: Start Review Session** from the command
   palette (`Cmd+Shift+P`)

### Reviewing Commits

- The **Commits** view lists all commits on the branch since the
  merge base (newest first)
- Click a commit to populate the **Changed Files** view
- Click a file to open a side-by-side diff

### Adding Comments

- Hover over line numbers in a diff -- click the **+** icon that
  appears to add a comment
- Or right-click a line number and select **Add Review Comment**
- Or select lines and press `Cmd+Shift+R` (macOS) /
  `Ctrl+Shift+R` (Windows/Linux)
- Comments are persisted to git notes immediately

### Submitting a Review

Run **AI Code Review: Submit Review** from the command palette.

- If there are open comments, the session status is set to
  `changes_requested`
- If all comments are resolved, the session is marked `approved`

### Agent Workflow

After submitting, tell your AI agent to check for reviews:

> "Check if there's a code review to address"

The agent will call `get_active_review`, see the open comments,
make fixes, and call `mark_comment_addressed` / `reply_to_comment`
as it goes. The extension auto-refreshes when git notes change.

### Re-Review After Rebase

If the agent rebases or amends commits, run
**AI Code Review: Re-review (After Rebase)** from the command
palette. This:

- Detects the new commit SHAs
- Maps existing comments to the new commits by file path and line
  range
- Marks comments as `outdated` if the referenced lines no longer
  exist
- Increments the session revision number

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `aiCodeReview.baseBranch` | `main` | Base branch to compare against |

You can also run **AI Code Review: Set Base Branch** from the
command palette.

## Project Structure

```
ai-code-reviewer/
  package.json                    # npm workspaces monorepo
  tsconfig.base.json
  packages/
    shared/                       # Types + git-notes + git-utils
      src/
        types.ts                  # ReviewSession, ReviewComment, etc.
        git-notes.ts              # Read/write review data via git notes
        git-utils.ts              # getMergeBase, getCommitsBetween, etc.
        index.ts
    extension/                    # VS Code extension
      src/
        extension.ts              # activate/deactivate, wire everything
        commits-tree.ts           # TreeDataProvider -- commit list
        files-tree.ts             # TreeDataProvider -- changed files
        diff-provider.ts          # TextDocumentContentProvider
        review-comments.ts        # CommentController (native Comments API)
        review-session.ts         # Session lifecycle
      resources/
        icon.svg                  # Activity bar icon
    mcp-server/                   # Standalone MCP server (stdio)
      src/
        index.ts                  # McpServer + StdioServerTransport
        tools.ts                  # Tool definitions
```

## Contributing

### Building

```bash
npm install
npm run build
```

This builds all three packages (`shared`, `mcp-server`,
`extension`) via npm workspaces. The shared package must build
first since the other two depend on it.

### Development Workflow

1. Open this repo in VS Code
2. Press **F5** to launch the Extension Development Host
   (uses `.vscode/launch.json`)
3. Make changes to source files
4. For the extension: the dev host reloads on rebuild. Run
   `npm run build` or use
   `npm run watch -w packages/extension` for auto-rebuild.
5. For the MCP server: rebuild with
   `npm run build -w packages/mcp-server`, then restart the
   agent's MCP connection.

### Testing the Git Notes Library

```bash
bash test/test-git-notes.sh
```

This creates a temporary git repo, writes review data to git
notes, and reads it back to verify the roundtrip.

### Testing the MCP Server

Verify tools are listed:

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n' \
  | node packages/mcp-server/dist/index.js 2>/dev/null \
  | tail -1 \
  | python3 -m json.tool
```

### Testing End-to-End

1. Create a test repo with a feature branch:
   ```bash
   mkdir /tmp/test-review && cd /tmp/test-review
   git init && git commit --allow-empty -m "initial"
   git checkout -b feat/test
   echo "hello" > file.txt && git add . && git commit -m "add file"
   ```
2. Open it in the Extension Development Host (F5)
3. Start a review session, add comments on the diff, submit
4. In a terminal with the MCP server configured, ask the agent to
   check for reviews
5. Verify comments show as addressed in VS Code after the agent
   responds
6. Verify git notes contain the expected data:
   ```bash
   git notes --ref refs/notes/code-review list
   git notes --ref refs/notes/code-review show <commit-sha>
   ```

### Cleaning Up

```bash
npm run clean        # removes all dist/ directories
```
