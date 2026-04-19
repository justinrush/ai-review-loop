-- List comments in a picker. Uses telescope if available; falls back to
-- vim.ui.select so the plugin works without telescope installed.
local comments = require("ai_review_loop.comments")
local git = require("ai_review_loop.git")

local M = {}

local STATUS_ORDER = { open = 1, addressed = 2, resolved = 3, outdated = 4 }

local function sort_comments(list)
  table.sort(list, function(a, b)
    local sa = STATUS_ORDER[a.status] or 99
    local sb = STATUS_ORDER[b.status] or 99
    if sa ~= sb then return sa < sb end
    if a.filePath ~= b.filePath then return a.filePath < b.filePath end
    return (a.startLine or 0) < (b.startLine or 0)
  end)
end

local function format_entry(c)
  local loc = c.filePath .. ":" .. tostring(c.startLine or 0)
  local preview = (c.body or ""):gsub("\n", " ")
  if #preview > 60 then preview = preview:sub(1, 57) .. "…" end
  return string.format("[%s] %-40s  %s", c.status, loc, preview)
end

local function jump_to(c, cwd)
  local root = git.repo_root(cwd) or cwd
  vim.cmd("edit " .. vim.fn.fnameescape(root .. "/" .. c.filePath))
  if c.startLine and c.startLine > 0 then
    vim.api.nvim_win_set_cursor(0, { c.startLine, 0 })
  end
end

function M.show(cwd, base_branch)
  local list = comments.list(cwd, base_branch)
  sort_comments(list)

  if #list == 0 then
    vim.notify("[ai-review-loop] no comments in the active session", vim.log.levels.INFO)
    return
  end

  local has_telescope, pickers = pcall(require, "telescope.pickers")
  if has_telescope then
    local finders = require("telescope.finders")
    local conf = require("telescope.config").values
    local actions = require("telescope.actions")
    local state = require("telescope.actions.state")

    pickers.new({}, {
      prompt_title = "AI Review Comments",
      finder = finders.new_table({
        results = list,
        entry_maker = function(c)
          return {
            value = c,
            display = format_entry(c),
            ordinal = c.status .. " " .. c.filePath .. " " .. (c.body or ""),
          }
        end,
      }),
      sorter = conf.generic_sorter({}),
      attach_mappings = function(bufnr, _)
        actions.select_default:replace(function()
          local selection = state.get_selected_entry()
          actions.close(bufnr)
          if selection then jump_to(selection.value, cwd) end
        end)
        return true
      end,
    }):find()
    return
  end

  vim.ui.select(list, {
    prompt = "Review comments:",
    format_item = format_entry,
  }, function(c)
    if c then jump_to(c, cwd) end
  end)
end

return M
