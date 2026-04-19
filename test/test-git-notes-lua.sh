#!/bin/bash
# Round-trip test for the neovim plugin's git-notes port.
# Creates a temp git repo, writes the shared fixture (test/fixtures/sample-note.json)
# as a git note via the Lua plugin, reads it back, and verifies structure
# and key fields are preserved.
set -e

if ! command -v nvim >/dev/null 2>&1; then
    echo "SKIP: nvim not installed; skipping lua git-notes test"
    exit 0
fi

script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(dirname "${script_dir}")
fixture="${script_dir}/fixtures/sample-note.json"
plugin_dir="${repo_root}/packages/neovim"

echo "=== Testing lua git-notes round-trip ==="

tmpdir=$(mktemp -d)
trap 'rm -rf "${tmpdir}"' EXIT

cd "${tmpdir}"
git init -q
git config user.email "test@example.com"
git config user.name "Test"
git commit -q --allow-empty -m "initial"
commit_sha=$(git rev-parse HEAD)

# Drive the plugin via nvim headless.
nvim --headless --noplugin \
    --cmd "set rtp+=${plugin_dir}" \
    -c "lua
        local git = require('ai_review_loop.git')
        local util = require('ai_review_loop.util')
        local f = io.open('${fixture}', 'r')
        local raw = f:read('*a'); f:close()
        local data = util.json_decode(raw)
        if not data then error('failed to decode fixture') end
        local err = git.write_commit_review('${tmpdir}', '${commit_sha}', data)
        if err then error('write failed: ' .. err) end
        local got = git.read_commit_review('${tmpdir}', '${commit_sha}')
        if not got then error('read returned nil') end
        local ok = got.sessionId == data.sessionId
            and #got.comments == #data.comments
            and got.comments[1].id == data.comments[1].id
            and got.comments[1].filePath == data.comments[1].filePath
            and got.comments[1].startLine == data.comments[1].startLine
            and got.comments[1].status == data.comments[1].status
            and got.comments[2].status == data.comments[2].status
            and #got.comments[2].thread == 2
            and got.comments[2].thread[2].author == 'agent'
        if not ok then
            io.stderr:write(vim.inspect(got) .. '\n')
            error('round-trip data mismatch')
        end
        io.stdout:write('round-trip ok\n')
    " \
    -c "qa!" 2>&1

echo "=== Reading raw note via git to confirm presence ==="
git notes --ref refs/notes/code-review show "${commit_sha}" | head -5

echo "=== All tests passed ==="
