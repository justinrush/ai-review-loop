local git = require("ai_review_loop.git")
local util = require("ai_review_loop.util")
local session_mod = require("ai_review_loop.session")

local M = {}

-- Ensure an active session exists; create one if not. Returns (session, err).
local function ensure_session(cwd, base_branch)
  local branch, err = git.current_branch(cwd)
  if err then return nil, err end

  local mb
  mb, err = git.merge_base(cwd, branch, base_branch)
  if err then return nil, err end

  local active = session_mod.find_active(cwd, mb, branch)
  if active then return active, nil, mb end
  local s, start_err = session_mod.start(cwd, base_branch)
  return s, start_err, mb
end

-- Add a comment on the current HEAD commit for the given file + line range.
-- body is a string, selection is { file, start_line, end_line }.
function M.add(cwd, base_branch, selection, body)
  local s, err = ensure_session(cwd, base_branch)
  if err then return nil, err end

  local head_sha, head_err = git.head_sha(cwd)
  if head_err then return nil, head_err end

  local data = git.read_commit_review(cwd, head_sha) or { sessionId = s.id, comments = {} }
  data.sessionId = data.sessionId or s.id

  local now = util.now_iso()
  local comment = {
    id = util.uuid(),
    sessionId = s.id,
    commitSha = head_sha,
    filePath = selection.file,
    startLine = selection.start_line,
    endLine = selection.end_line,
    body = body,
    status = "open",
    createdAt = now,
    thread = {
      { body = body, author = "human", createdAt = now },
    },
  }
  table.insert(data.comments, comment)
  local w = git.write_commit_review(cwd, head_sha, data)
  if w then return nil, w end
  return comment
end

-- Gather all comments across the active session.
function M.list(cwd, base_branch)
  local branch, err = git.current_branch(cwd)
  if err then return {} end
  local mb = git.merge_base(cwd, branch, base_branch)
  if not mb then return {} end
  local active = session_mod.find_active(cwd, mb, branch)
  if not active then return {} end
  return git.all_session_comments(cwd, active.commitShas)
end

-- Update a comment's status. Caller provides the comment's commitSha
-- (from the list view) so we don't have to scan every commit.
function M.update_status(cwd, commit_sha, comment_id, new_status)
  local data = git.read_commit_review(cwd, commit_sha)
  if not data then return nil, "no comments on that commit" end
  for _, c in ipairs(data.comments or {}) do
    if c.id == comment_id then
      c.status = new_status
      git.write_commit_review(cwd, commit_sha, data)
      return c
    end
  end
  return nil, "comment not found"
end

function M.reply(cwd, commit_sha, comment_id, body, author)
  author = author or "human"
  local data = git.read_commit_review(cwd, commit_sha)
  if not data then return nil, "no comments on that commit" end
  for _, c in ipairs(data.comments or {}) do
    if c.id == comment_id then
      c.thread = c.thread or {}
      table.insert(c.thread, { body = body, author = author, createdAt = util.now_iso() })
      git.write_commit_review(cwd, commit_sha, data)
      return c
    end
  end
  return nil, "comment not found"
end

function M.delete(cwd, commit_sha, comment_id)
  return git.delete_comment_from_commit(cwd, commit_sha, comment_id)
end

return M
