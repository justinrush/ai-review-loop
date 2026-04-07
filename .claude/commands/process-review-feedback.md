Process review feedback from the AI Review Loop VS Code extension.

## Steps

1. Call `get_active_review` to check for an active review session and see the comment summary.

2. If there are no open or addressed-but-unresolved comments, inform the user that all feedback has been resolved.

3. If there are open comments, call `get_review_comments` with `status_filter: "open"` to get full details.

4. For each open comment:
   a. Read the comment body and thread history to understand the feedback.
   b. If the comment is on a file (not `(general)`), call `get_diff_context` to see the surrounding code.
   c. Make the requested changes. Create NEW commits for fixes — do NOT amend or rebase existing commits.
   d. Reply to the comment explaining what you did using `reply_to_comment`.
   e. Mark the comment as addressed using `mark_comment_addressed`.

5. For general comments (`filePath: "(general)"`), address them as standalone tasks and reply with what was done.

6. After addressing all comments, summarize what was changed and tell the user to review in VS Code.

## Important Rules

- **Never rewrite history** (no rebase, amend, or force push) unless the user explicitly asks for it after all comments are resolved.
- **Always create new commits** for fixes so the human can review what changed.
- **Always reply to comments** before marking them addressed so the human can see your reasoning.
- **Build after changes** — run `npm run build` to verify the code compiles.
- If a comment is unclear, reply asking for clarification rather than guessing.

## Final Cleanup (only when user requests)

When the human confirms all comments are resolved and asks to clean up history:
1. Use interactive rebase to squash fix commits into their logical parents.
2. Run `npm run build` to verify the squashed result still compiles.
3. Do NOT force push — let the human push when ready.
