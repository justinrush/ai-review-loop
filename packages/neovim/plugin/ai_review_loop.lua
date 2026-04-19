-- User commands. Loaded once at startup; actual work is lazy-required
-- through ai_review_loop.init.
if vim.g.loaded_ai_review_loop == 1 then return end
vim.g.loaded_ai_review_loop = 1

local function main()
  return require("ai_review_loop")
end

vim.api.nvim_create_user_command("AIReviewList",     function() main().list() end,           { desc = "AI Review: list comments" })
vim.api.nvim_create_user_command("AIReviewAdd",      function() main().add() end,            { desc = "AI Review: add comment", range = true })
vim.api.nvim_create_user_command("AIReviewDone",     function() main().mark_addressed() end, { desc = "AI Review: mark comment addressed" })
vim.api.nvim_create_user_command("AIReviewResolve",  function() main().mark_resolved() end,  { desc = "AI Review: mark comment resolved" })
vim.api.nvim_create_user_command("AIReviewDelete",   function() main().delete() end,         { desc = "AI Review: delete comment" })
vim.api.nvim_create_user_command("AIReviewThread",   function() main().open_thread() end,    { desc = "AI Review: open comment thread" })
vim.api.nvim_create_user_command("AIReviewReReview", function() main().rereview() end,       { desc = "AI Review: re-review after rebase" })
