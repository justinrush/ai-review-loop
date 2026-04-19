-- Port of packages/extension/src/review-session.ts (the minimal slice the
-- nvim plugin needs: start / find-active / update).
local git = require("ai_review_loop.git")
local util = require("ai_review_loop.util")

local M = {}

local ACTIVE_STATUSES = {
  in_progress = true,
  submitted = true,
  changes_requested = true,
}

-- Find active session for the given branch (or any, if branch is nil).
function M.find_active(cwd, merge_base_sha, branch_name)
  local data = git.read_sessions(cwd, merge_base_sha)
  for _, s in ipairs(data.sessions) do
    if ACTIVE_STATUSES[s.status] then
      if not branch_name or s.branchName == branch_name then
        return s
      end
    end
  end
  return nil
end

-- Start a new session on the current branch. Returns (session, err).
function M.start(cwd, base_branch)
  base_branch = base_branch or "main"
  local branch, err = git.current_branch(cwd)
  if err then return nil, err end
  if branch == base_branch or branch == "HEAD" then
    return nil, "switch to a feature branch before starting a review"
  end

  local mb
  mb, err = git.merge_base(cwd, branch, base_branch)
  if err then return nil, ("no merge base between %s and %s"):format(branch, base_branch) end

  local existing = M.find_active(cwd, mb, branch)
  if existing then return existing end

  local head_sha = git.head_sha(cwd)
  local commits = git.commits_between(cwd, mb, head_sha or "HEAD")
  local shas = {}
  for _, c in ipairs(commits) do table.insert(shas, c.sha) end

  local now = util.now_iso()
  local session = {
    id = util.uuid(),
    branchName = branch,
    baseBranch = base_branch,
    baseCommit = mb,
    status = "in_progress",
    revision = 1,
    createdAt = now,
    updatedAt = now,
    commitShas = shas,
  }

  local data = git.read_sessions(cwd, mb)
  table.insert(data.sessions, session)
  local write_err = git.write_sessions(cwd, mb, data)
  if write_err then return nil, write_err end

  return session
end

function M.update(cwd, merge_base_sha, session_id, updates)
  local data = git.read_sessions(cwd, merge_base_sha)
  for i, s in ipairs(data.sessions) do
    if s.id == session_id then
      for k, v in pairs(updates) do s[k] = v end
      s.updatedAt = util.now_iso()
      data.sessions[i] = s
      git.write_sessions(cwd, merge_base_sha, data)
      return s
    end
  end
  return nil, ("session %s not found"):format(session_id)
end

return M
