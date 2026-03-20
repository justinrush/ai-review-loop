import * as vscode from "vscode";
import {
  readCommitReview,
  writeCommitReview,
  type ReviewComment,
} from "@ai-code-reviewer/shared";
import { v4 as uuidv4 } from "uuid";
import { SCHEME } from "./diff-provider.js";

export class ReviewCommentController implements vscode.Disposable {
  private controller: vscode.CommentController;
  private repoRoot: string;
  private activeSessionId: string | null = null;
  private threads = new Map<string, vscode.CommentThread>();

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.controller = vscode.comments.createCommentController(
      "aiReview",
      "AI Code Review"
    );

    this.controller.commentingRangeProvider = {
      provideCommentingRanges(document: vscode.TextDocument) {
        if (document.uri.scheme !== SCHEME) return [];
        return [new vscode.Range(0, 0, document.lineCount - 1, 0)];
      },
    };
  }

  setActiveSessionId(sessionId: string | null): void {
    this.activeSessionId = sessionId;
  }

  async createComment(reply: vscode.CommentReply): Promise<void> {
    if (!this.activeSessionId) {
      vscode.window.showWarningMessage(
        "Start a review session before adding comments."
      );
      return;
    }

    const thread = reply.thread;
    const uri = thread.uri;

    // Parse URI to get ref and filepath
    const path = uri.path;
    const firstSlash = path.indexOf("/", 1);
    const commitSha = path.slice(1, firstSlash);
    const filePath = path.slice(firstSlash + 1);

    const range = thread.range;
    const startLine = range ? range.start.line + 1 : 1;
    const endLine = range ? range.end.line + 1 : 1;

    // Check if this is a reply to an existing thread or a new comment
    if (thread.comments.length === 0) {
      // New comment
      const comment: ReviewComment = {
        id: uuidv4(),
        sessionId: this.activeSessionId,
        commitSha,
        filePath,
        startLine,
        endLine,
        body: reply.text,
        status: "open",
        createdAt: new Date().toISOString(),
        thread: [
          {
            body: reply.text,
            author: "human",
            createdAt: new Date().toISOString(),
          },
        ],
      };

      await this.persistComment(commitSha, comment);

      const vsComment = this.makeVsComment(reply.text, "human");
      thread.comments = [vsComment];
      thread.label = comment.id;
      this.threads.set(comment.id, thread);
    } else {
      // Reply to existing thread
      const commentId = thread.label;
      if (!commentId) return;

      await this.persistReply(commitSha, commentId, reply.text, "human");

      const vsComment = this.makeVsComment(reply.text, "human");
      thread.comments = [...thread.comments, vsComment];
    }
  }

  async loadCommentsForFile(
    commitSha: string,
    filePath: string,
    document: vscode.TextDocument
  ): Promise<void> {
    const data = await readCommitReview(this.repoRoot, commitSha);
    if (!data) return;

    const fileComments = data.comments.filter((c) => c.filePath === filePath);
    for (const comment of fileComments) {
      const range = new vscode.Range(
        comment.startLine - 1,
        0,
        comment.endLine - 1,
        0
      );

      const vsComments = comment.thread.map((entry) =>
        this.makeVsComment(entry.body, entry.author)
      );

      const thread = this.controller.createCommentThread(
        document.uri,
        range,
        vsComments
      );
      thread.label = comment.id;
      thread.contextValue = comment.status;
      thread.canReply = true;

      if (
        comment.status === "addressed" ||
        comment.status === "resolved"
      ) {
        thread.state = vscode.CommentThreadState.Resolved;
      }

      this.threads.set(comment.id, thread);
    }
  }

  async resolveComment(thread: vscode.CommentThread): Promise<void> {
    const commentId = thread.label;
    if (!commentId) return;

    const uri = thread.uri;
    const path = uri.path;
    const firstSlash = path.indexOf("/", 1);
    const commitSha = path.slice(1, firstSlash);

    const data = await readCommitReview(this.repoRoot, commitSha);
    if (!data) return;

    const comment = data.comments.find((c) => c.id === commentId);
    if (comment) {
      comment.status = "resolved";
      await writeCommitReview(this.repoRoot, commitSha, data);
      thread.state = vscode.CommentThreadState.Resolved;
      thread.contextValue = "resolved";
    }
  }

  clearThreads(): void {
    for (const thread of this.threads.values()) {
      thread.dispose();
    }
    this.threads.clear();
  }

  dispose(): void {
    this.clearThreads();
    this.controller.dispose();
  }

  private makeVsComment(
    body: string,
    author: "human" | "agent"
  ): vscode.Comment {
    return {
      body: new vscode.MarkdownString(body),
      mode: vscode.CommentMode.Preview,
      author: {
        name: author === "human" ? "You" : "AI Agent",
      },
    };
  }

  private async persistComment(
    commitSha: string,
    comment: ReviewComment
  ): Promise<void> {
    let data = await readCommitReview(this.repoRoot, commitSha);
    if (!data) {
      data = { sessionId: comment.sessionId, comments: [] };
    }
    data.comments.push(comment);
    await writeCommitReview(this.repoRoot, commitSha, data);
  }

  private async persistReply(
    commitSha: string,
    commentId: string,
    body: string,
    author: "human" | "agent"
  ): Promise<void> {
    const data = await readCommitReview(this.repoRoot, commitSha);
    if (!data) return;

    const comment = data.comments.find((c) => c.id === commentId);
    if (comment) {
      comment.thread.push({
        body,
        author,
        createdAt: new Date().toISOString(),
      });
      await writeCommitReview(this.repoRoot, commitSha, data);
    }
  }
}
