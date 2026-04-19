-- Gutter signs for lines with review comments in the current buffer.
local comments = require("ai_review_loop.comments")

local M = {}

local NS = vim.api.nvim_create_namespace("ai_review_loop_signs")
local SIGN_GROUP = "AIReviewLoop"

local defined = false
local function define_signs()
  if defined then return end
  defined = true
  vim.fn.sign_define("AIReviewOpen",      { text = "●", texthl = "DiagnosticWarn" })
  vim.fn.sign_define("AIReviewAddressed", { text = "●", texthl = "DiagnosticInfo" })
  vim.fn.sign_define("AIReviewResolved",  { text = "●", texthl = "DiagnosticOk" })
  vim.fn.sign_define("AIReviewOutdated",  { text = "●", texthl = "DiagnosticHint" })
end

local function sign_for_status(status)
  if status == "addressed" then return "AIReviewAddressed" end
  if status == "resolved" then return "AIReviewResolved" end
  if status == "outdated" then return "AIReviewOutdated" end
  return "AIReviewOpen"
end

function M.refresh(buf, cwd, base_branch)
  define_signs()
  buf = buf or vim.api.nvim_get_current_buf()
  local path = vim.api.nvim_buf_get_name(buf)
  if path == "" then return end
  local root = require("ai_review_loop.git").repo_root(cwd)
  if not root then return end

  -- Clear prior signs for this buffer.
  vim.fn.sign_unplace(SIGN_GROUP, { buffer = buf })

  local all = comments.list(cwd, base_branch)
  for _, c in ipairs(all) do
    local abs = root .. "/" .. c.filePath
    if abs == path then
      vim.fn.sign_place(0, SIGN_GROUP, sign_for_status(c.status), buf, {
        lnum = c.startLine,
        priority = 10,
      })
    end
  end
end

return M
