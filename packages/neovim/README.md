# ai-review-loop.nvim

Neovim companion for [ai-review-loop](../..), the git-notes-backed code
review loop for AI agents. Mirrors the VS Code extension's core workflow:
list review comments, add new ones on visual selections, mark them
addressed/resolved, and jump between them.

## Requirements

- Neovim 0.10+
- `git` on `$PATH`
- Optional: [telescope.nvim](https://github.com/nvim-telescope/telescope.nvim)
  (picker UI). Falls back to `vim.ui.select` if telescope is not installed.
- Optional: [jq](https://jqlang.org/) for pretty-printed git note JSON
  (matches the VS Code extension's formatting).

## Install

With [lazy.nvim](https://github.com/folke/lazy.nvim):

```lua
{
  "justinrush/ai-review-loop",
  -- Only the neovim/ subtree is a plugin; lazy picks it up via `config`.
  -- If you check the repo out locally, use `dir = "~/path/to/ai-review-loop/packages/neovim"`.
  config = function()
    require("ai_review_loop").setup({})
  end,
}
```

For local iteration (the pattern used in `mac/home/nvim/lua/jr/plugins/ai.lua`):

```lua
{
  dir = vim.fn.expand("~/dev/github/justinrush/ai-review-loop/packages/neovim"),
  name = "ai-review-loop.nvim",
  cmd = { "AIReviewList", "AIReviewAdd" },
  config = function()
    require("ai_review_loop").setup({})
  end,
}
```

## Commands

| Command            | Description                                |
|--------------------|--------------------------------------------|
| `:AIReviewList`    | Pick across all comments in active session |
| `:AIReviewAdd`     | Add comment on current line or selection   |
| `:AIReviewDone`    | Mark comment under cursor as addressed     |
| `:AIReviewResolve` | Mark comment under cursor as resolved      |
| `:AIReviewDelete`  | Delete comment under cursor                |
| `:AIReviewThread`  | Show full thread for comment under cursor  |
| `:AIReviewReReview`| Re-review after rebase (partial)           |

## Config

```lua
require("ai_review_loop").setup({
  base_branch = "main",        -- compare against this branch
  auto_refresh_signs = true,    -- gutter signs on BufRead/BufWrite/FocusGained
})
```

## Compatibility with the VS Code extension

This plugin reads and writes the same two git notes refs as the VS Code
extension and the MCP server:

- `refs/notes/code-review` — per-commit comment data
- `refs/notes/code-review-sessions` — session list on the merge-base commit

JSON shape is defined in `packages/shared/src/types.ts`. If you change
that shape, update `lua/ai_review_loop/git.lua` in lockstep — the
parity test (`test/test-git-notes-lua.sh`) catches drift on round-trip.

## Tests

From the repo root:

```
./test/test-git-notes-lua.sh
```

Runs the Lua side against a shared fixture
(`test/fixtures/sample-note.json`) and verifies the round-trip through
git notes preserves structure.
