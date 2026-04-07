import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  findActiveSession,
  getAllSessionComments,
  getMergeBase,
  getCurrentBranch,
  getCommitsBetween,
  readCommitReview,
  writeCommitReview,
  updateSession,
  getFileAtRef,
  getRepoRoot,
} from "@ai-review-loop/shared";
import type { ReviewComment, CommitReviewData } from "@ai-review-loop/shared";

function getCwd(): string {
  return process.env.AI_REVIEW_LOOP_CWD || process.cwd();
}

export function registerTools(server: McpServer): void {
  server.tool(
    "get_active_review",
    "Get the active review session and a summary of open comments",
    {},
    async () => {
      const cwd = getCwd();
      const branch = await getCurrentBranch(cwd);
      const baseBranch = process.env.AI_REVIEW_LOOP_BASE_BRANCH || "main";
      let mergeBase: string;
      try {
        mergeBase = await getMergeBase(cwd, branch, baseBranch);
      } catch {
        return { content: [{ type: "text" as const, text: "No merge base found. Are you on a feature branch?" }] };
      }

      let session = await findActiveSession(cwd, mergeBase);
      if (!session) {
        return { content: [{ type: "text" as const, text: "No active review session found." }] };
      }

      const comments = await getAllSessionComments(cwd, session.commitShas);
      const open = comments.filter((c) => c.status === "open");
      const addressed = comments.filter((c) => c.status === "addressed");
      const resolved = comments.filter((c) => c.status === "resolved");

      // Auto-submit: when the AI agent reads the review and there are open
      // comments, transition from in_progress → changes_requested so the
      // human doesn't need to explicitly click "Submit Review".
      if (session.status === "in_progress" && open.length > 0) {
        session = await updateSession(cwd, mergeBase, session.id, {
          status: "changes_requested",
        });
      }

      const summary = {
        session: {
          id: session.id,
          branchName: session.branchName,
          baseBranch: session.baseBranch,
          status: session.status,
          revision: session.revision,
        },
        commentSummary: {
          total: comments.length,
          open: open.length,
          addressed: addressed.length,
          resolved: resolved.length,
        },
        openComments: open.map((c) => ({
          id: c.id,
          file: c.filePath,
          lines: `${c.startLine}-${c.endLine}`,
          body: c.body,
          commitSha: c.commitSha,
        })),
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }] };
    }
  );

  server.tool(
    "get_review_comments",
    "Get all comments for the active review session with file and line context",
    {
      status_filter: z
        .enum(["open", "addressed", "resolved", "outdated", "all"])
        .optional()
        .describe("Filter comments by status. Defaults to 'all'."),
    },
    async ({ status_filter }) => {
      const cwd = getCwd();
      const branch = await getCurrentBranch(cwd);
      const baseBranch = process.env.AI_REVIEW_LOOP_BASE_BRANCH || "main";
      const mergeBase = await getMergeBase(cwd, branch, baseBranch);
      const session = await findActiveSession(cwd, mergeBase);

      if (!session) {
        return { content: [{ type: "text" as const, text: "No active review session found." }] };
      }

      let comments = await getAllSessionComments(cwd, session.commitShas);
      const filter = status_filter || "all";
      if (filter !== "all") {
        comments = comments.filter((c) => c.status === filter);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              comments.map((c) => ({
                id: c.id,
                file: c.filePath,
                lines: `${c.startLine}-${c.endLine}`,
                body: c.body,
                status: c.status,
                commitSha: c.commitSha,
                thread: c.thread,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "mark_comment_addressed",
    "Mark a review comment as addressed after fixing the issue",
    {
      comment_id: z.string().describe("The ID of the comment to mark as addressed"),
    },
    async ({ comment_id }) => {
      const cwd = getCwd();
      const branch = await getCurrentBranch(cwd);
      const baseBranch = process.env.AI_REVIEW_LOOP_BASE_BRANCH || "main";
      const mergeBase = await getMergeBase(cwd, branch, baseBranch);
      const session = await findActiveSession(cwd, mergeBase);

      if (!session) {
        return { content: [{ type: "text" as const, text: "No active review session found." }] };
      }

      for (const sha of session.commitShas) {
        const data = await readCommitReview(cwd, sha);
        if (!data) continue;
        const comment = data.comments.find((c) => c.id === comment_id);
        if (comment) {
          comment.status = "addressed";
          await writeCommitReview(cwd, sha, data);
          return {
            content: [
              {
                type: "text" as const,
                text: `Comment ${comment_id} marked as addressed (${comment.filePath}:${comment.startLine}).`,
              },
            ],
          };
        }
      }

      return { content: [{ type: "text" as const, text: `Comment ${comment_id} not found.` }] };
    }
  );

  server.tool(
    "reply_to_comment",
    "Add a reply to a review comment thread",
    {
      comment_id: z.string().describe("The ID of the comment to reply to"),
      body: z.string().describe("The reply message (markdown supported)"),
    },
    async ({ comment_id, body }) => {
      const cwd = getCwd();
      const branch = await getCurrentBranch(cwd);
      const baseBranch = process.env.AI_REVIEW_LOOP_BASE_BRANCH || "main";
      const mergeBase = await getMergeBase(cwd, branch, baseBranch);
      const session = await findActiveSession(cwd, mergeBase);

      if (!session) {
        return { content: [{ type: "text" as const, text: "No active review session found." }] };
      }

      for (const sha of session.commitShas) {
        const data = await readCommitReview(cwd, sha);
        if (!data) continue;
        const comment = data.comments.find((c) => c.id === comment_id);
        if (comment) {
          comment.thread.push({
            body,
            author: "agent",
            createdAt: new Date().toISOString(),
          });
          await writeCommitReview(cwd, sha, data);
          return {
            content: [
              {
                type: "text" as const,
                text: `Reply added to comment ${comment_id}.`,
              },
            ],
          };
        }
      }

      return { content: [{ type: "text" as const, text: `Comment ${comment_id} not found.` }] };
    }
  );

  server.tool(
    "get_diff_context",
    "Get the code snippet around a comment's line range for context",
    {
      comment_id: z.string().describe("The ID of the comment to get context for"),
      context_lines: z
        .number()
        .optional()
        .describe("Number of extra lines above/below to include. Defaults to 5."),
    },
    async ({ comment_id, context_lines }) => {
      const cwd = getCwd();
      const branch = await getCurrentBranch(cwd);
      const baseBranch = process.env.AI_REVIEW_LOOP_BASE_BRANCH || "main";
      const mergeBase = await getMergeBase(cwd, branch, baseBranch);
      const session = await findActiveSession(cwd, mergeBase);

      if (!session) {
        return { content: [{ type: "text" as const, text: "No active review session found." }] };
      }

      let targetComment: ReviewComment | undefined;
      let targetSha: string | undefined;
      for (const sha of session.commitShas) {
        const data = await readCommitReview(cwd, sha);
        if (!data) continue;
        const comment = data.comments.find((c) => c.id === comment_id);
        if (comment) {
          targetComment = comment;
          targetSha = sha;
          break;
        }
      }

      if (!targetComment || !targetSha) {
        return { content: [{ type: "text" as const, text: `Comment ${comment_id} not found.` }] };
      }

      const extra = context_lines ?? 5;
      let fileContent: string;
      try {
        fileContent = await getFileAtRef(cwd, targetSha, targetComment.filePath);
      } catch {
        return {
          content: [
            { type: "text" as const, text: `File ${targetComment.filePath} not found at commit ${targetSha}.` },
          ],
        };
      }

      const lines = fileContent.split("\n");
      const start = Math.max(0, targetComment.startLine - 1 - extra);
      const end = Math.min(lines.length, targetComment.endLine + extra);
      const snippet = lines
        .slice(start, end)
        .map((line, i) => {
          const lineNum = start + i + 1;
          const marker =
            lineNum >= targetComment!.startLine && lineNum <= targetComment!.endLine
              ? ">>>"
              : "   ";
          return `${marker} ${String(lineNum).padStart(4)} | ${line}`;
        })
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `File: ${targetComment.filePath}\nCommit: ${targetSha}\nLines ${targetComment.startLine}-${targetComment.endLine}:\n\n${snippet}`,
          },
        ],
      };
    }
  );
}
