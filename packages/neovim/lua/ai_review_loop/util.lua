local M = {}

-- RFC-4122 v4 UUID. Collision-resistant enough for review comments; not
-- cryptographic. Uses math.random which Lua seeds from os.time() — we
-- re-seed on first call with a better entropy source if available.
local seeded = false
local function ensure_seeded()
  if seeded then return end
  seeded = true
  local f = io.open("/dev/urandom", "rb")
  if f then
    local bytes = f:read(4)
    f:close()
    if bytes and #bytes == 4 then
      local a, b, c, d = bytes:byte(1, 4)
      math.randomseed(a * 0x1000000 + b * 0x10000 + c * 0x100 + d)
      return
    end
  end
  math.randomseed(os.time())
end

function M.uuid()
  ensure_seeded()
  local template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
  return (
    template:gsub("[xy]", function(c)
      local v = (c == "x") and math.random(0, 0xf) or math.random(8, 0xb)
      return string.format("%x", v)
    end)
  )
end

function M.now_iso()
  return os.date("!%Y-%m-%dT%H:%M:%SZ")
end

function M.json_encode(data)
  return vim.json.encode(data)
end

function M.json_decode(raw)
  local ok, value = pcall(vim.json.decode, raw)
  if not ok then return nil, value end
  return value
end

-- Pretty-print JSON with 2-space indentation to match the TS side
-- (JSON.stringify(data, null, 2)).
function M.json_pretty(data)
  local raw = vim.json.encode(data)
  -- vim.json.encode has no indent option; shell to jq if available.
  if vim.fn.executable("jq") == 1 then
    local out = vim.fn.system({ "jq", "--indent", "2", "." }, raw)
    if vim.v.shell_error == 0 then
      return (out:gsub("\n$", ""))
    end
  end
  return raw
end

function M.notify(msg, level)
  vim.schedule(function()
    vim.notify("[ai-review-loop] " .. msg, level or vim.log.levels.INFO)
  end)
end

return M
