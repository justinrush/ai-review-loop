local M = {}

local default_config = {
  base_branch = "main",
  auto_refresh_signs = true,
}

M.config = vim.deepcopy(default_config)

local function cwd()
  return vim.fn.getcwd()
end

function M.setup(opts)
  M.config = vim.tbl_deep_extend("force", default_config, opts or {})

  if M.config.auto_refresh_signs then
    local grp = vim.api.nvim_create_augroup("ai_review_loop_signs", { clear = true })
    vim.api.nvim_create_autocmd({ "BufReadPost", "BufWritePost", "FocusGained" }, {
      group = grp,
      callback = function(args)
        require("ai_review_loop.ui.signs").refresh(args.buf, cwd(), M.config.base_branch)
      end,
    })
  end
end

function M.list()
  require("ai_review_loop.ui.list").show(cwd(), M.config.base_branch)
end

function M.add()
  require("ai_review_loop.ui.add").prompt(cwd(), M.config.base_branch)
end

-- Find the comment under the cursor (by file + line range). Returns
-- (comment, commitSha) or (nil, err).
local function comment_under_cursor()
  local comments = require("ai_review_loop.comments")
  local git = require("ai_review_loop.git")
  local path = vim.api.nvim_buf_get_name(0)
  if path == "" then return nil, "unsaved buffer" end
  local root = git.repo_root(cwd()) or cwd()
  if not vim.startswith(path, root) then return nil, "buffer is outside the repo" end
  local rel = path:sub(#root + 2)
  local line = vim.fn.line(".")

  local all = comments.list(cwd(), M.config.base_branch)
  for _, c in ipairs(all) do
    if c.filePath == rel and line >= (c.startLine or 0) and line <= (c.endLine or 0) then
      return c
    end
  end
  return nil, "no comment on this line"
end

function M.mark_addressed()
  local c, err = comment_under_cursor()
  if not c then vim.notify("[ai-review-loop] " .. err, vim.log.levels.WARN) return end
  require("ai_review_loop.comments").update_status(cwd(), c.commitSha, c.id, "addressed")
  require("ai_review_loop.ui.signs").refresh(0, cwd(), M.config.base_branch)
  vim.notify("[ai-review-loop] marked addressed", vim.log.levels.INFO)
end

function M.mark_resolved()
  local c, err = comment_under_cursor()
  if not c then vim.notify("[ai-review-loop] " .. err, vim.log.levels.WARN) return end
  require("ai_review_loop.comments").update_status(cwd(), c.commitSha, c.id, "resolved")
  require("ai_review_loop.ui.signs").refresh(0, cwd(), M.config.base_branch)
  vim.notify("[ai-review-loop] marked resolved", vim.log.levels.INFO)
end

function M.delete()
  local c, err = comment_under_cursor()
  if not c then vim.notify("[ai-review-loop] " .. err, vim.log.levels.WARN) return end
  require("ai_review_loop.comments").delete(cwd(), c.commitSha, c.id)
  require("ai_review_loop.ui.signs").refresh(0, cwd(), M.config.base_branch)
  vim.notify("[ai-review-loop] deleted comment", vim.log.levels.INFO)
end

function M.open_thread()
  local c, err = comment_under_cursor()
  if not c then vim.notify("[ai-review-loop] " .. err, vim.log.levels.WARN) return end
  require("ai_review_loop.ui.thread").open(c)
end

-- Re-review placeholder. Full re-review (remap comments after rebase) is
-- implemented in the VS Code extension and would be mirrored here. For
-- now the button simply re-reads and surfaces outdated ones.
function M.rereview()
  vim.notify("[ai-review-loop] re-review: refreshing. Full remap lives in VS Code for now.", vim.log.levels.INFO)
  require("ai_review_loop.ui.signs").refresh(0, cwd(), M.config.base_branch)
end

return M
