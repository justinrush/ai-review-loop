-- Floating window showing a comment's thread history.
local M = {}

function M.open(comment)
  local lines = {
    string.format("%s:%d-%d  [%s]", comment.filePath, comment.startLine, comment.endLine, comment.status),
    string.rep("─", 60),
  }
  for _, entry in ipairs(comment.thread or {}) do
    table.insert(lines, string.format("[%s] %s", entry.author, entry.createdAt))
    for line in (entry.body or ""):gmatch("[^\n]+") do
      table.insert(lines, "  " .. line)
    end
    table.insert(lines, "")
  end

  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
  vim.bo[buf].filetype = "markdown"
  vim.bo[buf].modifiable = false

  local width = math.floor(vim.o.columns * 0.6)
  local height = math.min(#lines + 2, math.floor(vim.o.lines * 0.6))
  vim.api.nvim_open_win(buf, true, {
    relative = "editor",
    width = width,
    height = height,
    row = math.floor((vim.o.lines - height) / 2),
    col = math.floor((vim.o.columns - width) / 2),
    border = "rounded",
    title = " AI Review Thread ",
    title_pos = "center",
  })

  vim.keymap.set("n", "q", "<cmd>close<cr>", { buffer = buf, nowait = true })
end

return M
