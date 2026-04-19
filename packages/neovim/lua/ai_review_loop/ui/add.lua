-- Prompt the user for a comment body and persist it to the current commit.
local comments_mod = require("ai_review_loop.comments")
local git = require("ai_review_loop.git")

local M = {}

-- Returns the { file, start_line, end_line } selection for the current
-- visual range, or the single line under the cursor in normal mode.
local function current_selection(cwd)
  local root = git.repo_root(cwd) or cwd
  local path = vim.api.nvim_buf_get_name(0)
  if path == "" then return nil, "unsaved buffer" end
  if not vim.startswith(path, root) then
    return nil, "buffer is outside the repo"
  end
  local rel = path:sub(#root + 2)

  local mode = vim.fn.mode()
  local start_line, end_line
  if mode:match("[vV]") then
    start_line = vim.fn.line("v")
    end_line = vim.fn.line(".")
    if start_line > end_line then
      start_line, end_line = end_line, start_line
    end
    -- leave visual mode so the range doesn't linger.
    vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes("<Esc>", true, false, true), "n", false)
  else
    start_line = vim.fn.line(".")
    end_line = start_line
  end
  return { file = rel, start_line = start_line, end_line = end_line }
end

function M.prompt(cwd, base_branch)
  local sel, err = current_selection(cwd)
  if not sel then
    vim.notify("[ai-review-loop] " .. err, vim.log.levels.WARN)
    return
  end

  vim.ui.input({ prompt = "Review comment: " }, function(body)
    if not body or body == "" then return end
    local c, add_err = comments_mod.add(cwd, base_branch, sel, body)
    if add_err then
      vim.notify("[ai-review-loop] add failed: " .. add_err, vim.log.levels.ERROR)
      return
    end
    vim.notify(
      string.format("[ai-review-loop] added comment on %s:%d", c.filePath, c.startLine),
      vim.log.levels.INFO
    )
  end)
end

return M
