-- Port of packages/shared/src/{git-notes,git-utils}.ts.
-- Keep operations, ref names, and JSON shape identical to the TS side.
-- If you change a ref name or JSON key here, update the TS port too or
-- the editor and MCP server will read different data.

local util = require("ai_review_loop.util")

local M = {}

M.REVIEW_REF = "refs/notes/code-review"
M.SESSIONS_REF = "refs/notes/code-review-sessions"

-- Run git; return (stdout, err). stdout is trimmed. err is nil on success.
local function git(args, cwd)
  local cmd = { "git" }
  vim.list_extend(cmd, args)
  local res = vim.system(cmd, { cwd = cwd, text = true }):wait()
  if res.code ~= 0 then
    return nil, (res.stderr or ""):gsub("%s+$", "")
  end
  return (res.stdout or ""):gsub("%s+$", ""), nil
end

-- Read a git note on the given ref for the given object SHA.
-- Returns nil if no note exists (not an error).
function M.read_note(cwd, ref, sha)
  local out, err = git({ "notes", "--ref", ref, "show", sha }, cwd)
  if err then return nil end
  return out
end

-- Write/overwrite a git note on the given ref for the given object SHA.
function M.write_note(cwd, ref, sha, content)
  -- -f/-force lets us overwrite existing; matches TS behavior.
  local _, err = git({ "notes", "--ref", ref, "add", "-f", "-m", content, sha }, cwd)
  return err
end

-- --- CommitReviewData (per-commit comments) ---

function M.read_commit_review(cwd, sha)
  local raw = M.read_note(cwd, M.REVIEW_REF, sha)
  if not raw or raw == "" then return nil end
  local data, parse_err = util.json_decode(raw)
  if parse_err then return nil end
  return data
end

function M.write_commit_review(cwd, sha, data)
  return M.write_note(cwd, M.REVIEW_REF, sha, util.json_pretty(data))
end

-- --- SessionNote (on merge-base commit) ---

function M.read_sessions(cwd, merge_base_sha)
  local raw = M.read_note(cwd, M.SESSIONS_REF, merge_base_sha)
  if not raw or raw == "" then return { sessions = {} } end
  local data, parse_err = util.json_decode(raw)
  if parse_err or not data then return { sessions = {} } end
  data.sessions = data.sessions or {}
  return data
end

function M.write_sessions(cwd, merge_base_sha, data)
  return M.write_note(cwd, M.SESSIONS_REF, merge_base_sha, util.json_pretty(data))
end

function M.delete_comment_from_commit(cwd, sha, comment_id)
  local data = M.read_commit_review(cwd, sha)
  if not data then return false end
  for i, c in ipairs(data.comments or {}) do
    if c.id == comment_id then
      table.remove(data.comments, i)
      M.write_commit_review(cwd, sha, data)
      return true
    end
  end
  return false
end

function M.all_session_comments(cwd, commit_shas)
  local all = {}
  for _, sha in ipairs(commit_shas or {}) do
    local data = M.read_commit_review(cwd, sha)
    if data and data.comments then
      for _, c in ipairs(data.comments) do
        table.insert(all, c)
      end
    end
  end
  return all
end

-- --- git plumbing helpers (port of git-utils.ts) ---

function M.current_branch(cwd)
  return git({ "rev-parse", "--abbrev-ref", "HEAD" }, cwd)
end

function M.merge_base(cwd, a, b)
  return git({ "merge-base", a, b }, cwd)
end

function M.head_sha(cwd)
  return git({ "rev-parse", "HEAD" }, cwd)
end

function M.repo_root(cwd)
  return git({ "rev-parse", "--show-toplevel" }, cwd or vim.fn.getcwd())
end

function M.commits_between(cwd, base, head)
  local out, err = git(
    { "log", "--format=%H%x00%s%x00%aI", "--reverse", base .. ".." .. head },
    cwd
  )
  if err or not out or out == "" then return {} end
  local result = {}
  for line in out:gmatch("[^\n]+") do
    local sha, subject, date = line:match("^([^%z]*)%z([^%z]*)%z(.*)$")
    if sha then
      table.insert(result, { sha = sha, subject = subject, date = date })
    end
  end
  return result
end

return M
