#!/bin/bash
set -e

echo "=== Testing git-notes library ==="

# Create temp repo
TMPDIR=$(mktemp -d)
echo "Temp repo: $TMPDIR"
cd "$TMPDIR"
git init
git commit --allow-empty -m "initial"
MERGE_BASE=$(git rev-parse HEAD)

# Create feature branch with commits
git checkout -b feat/test
echo "hello" > file1.txt
git add file1.txt
git commit -m "add file1"
COMMIT1=$(git rev-parse HEAD)

echo "world" > file2.txt
git add file2.txt
git commit -m "add file2"
COMMIT2=$(git rev-parse HEAD)

echo ""
echo "Merge base: $MERGE_BASE"
echo "Commit 1:   $COMMIT1"
echo "Commit 2:   $COMMIT2"

# Write a review note using git notes directly (simulating shared lib)
REVIEW_DATA='{
  "sessionId": "test-session-1",
  "comments": [
    {
      "id": "comment-1",
      "sessionId": "test-session-1",
      "commitSha": "'$COMMIT1'",
      "filePath": "file1.txt",
      "startLine": 1,
      "endLine": 1,
      "body": "This should be more descriptive",
      "status": "open",
      "createdAt": "2024-01-01T00:00:00Z",
      "thread": [
        { "body": "This should be more descriptive", "author": "human", "createdAt": "2024-01-01T00:00:00Z" }
      ]
    }
  ]
}'

git notes --ref refs/notes/code-review add -m "$REVIEW_DATA" "$COMMIT1"

# Read it back
echo ""
echo "=== Reading back review note ==="
git notes --ref refs/notes/code-review show "$COMMIT1" | python3 -m json.tool

# Write session note
SESSION_DATA='{
  "sessions": [
    {
      "id": "test-session-1",
      "branchName": "feat/test",
      "baseBranch": "main",
      "baseCommit": "'$MERGE_BASE'",
      "status": "in_progress",
      "revision": 1,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z",
      "commitShas": ["'$COMMIT1'", "'$COMMIT2'"]
    }
  ]
}'

git notes --ref refs/notes/code-review-sessions add -m "$SESSION_DATA" "$MERGE_BASE"

echo ""
echo "=== Reading back session note ==="
git notes --ref refs/notes/code-review-sessions show "$MERGE_BASE" | python3 -m json.tool

echo ""
echo "=== All tests passed ==="

# Cleanup
rm -rf "$TMPDIR"
