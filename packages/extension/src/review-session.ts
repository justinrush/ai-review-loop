import * as vscode from "vscode";
import {
  getCurrentBranch,
  getMergeBase,
  getCommitsBetween,
  readSessions,
  writeSessions,
  findActiveSession,
  updateSession,
  getAllSessionComments,
  readCommitReview,
  writeCommitReview,
  type ReviewSession,
  type ReviewComment,
  type CommitReviewData,
} from "@ai-review-loop/shared";
import { v4 as uuidv4 } from "uuid";

export class ReviewSessionManager {
  private repoRoot: string;
  private statusBarItem: vscode.StatusBarItem;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
  }

  async getBaseBranch(): Promise<string> {
    return (
      vscode.workspace
        .getConfiguration("aiReviewLoop")
        .get<string>("baseBranch") ?? "main"
    );
  }

  async startSession(): Promise<ReviewSession | null> {
    const baseBranch = await this.getBaseBranch();
    const branch = await getCurrentBranch(this.repoRoot);

    if (branch === baseBranch || branch === "HEAD") {
      vscode.window.showWarningMessage(
        "Switch to a feature branch to start a review session."
      );
      return null;
    }

    let mergeBase: string;
    try {
      mergeBase = await getMergeBase(this.repoRoot, branch, baseBranch);
    } catch {
      vscode.window.showErrorMessage(
        `Could not find merge base between ${branch} and ${baseBranch}.`
      );
      return null;
    }

    // Check for existing active session
    const existing = await findActiveSession(this.repoRoot, mergeBase, branch);
    if (existing) {
      vscode.window.showInformationMessage(
        `Active session already exists (${existing.status}).`
      );
      this.updateStatusBar(existing);
      return existing;
    }

    const commits = await getCommitsBetween(
      this.repoRoot,
      mergeBase,
      "HEAD"
    );

    const session: ReviewSession = {
      id: uuidv4(),
      branchName: branch,
      baseBranch,
      baseCommit: mergeBase,
      status: "in_progress",
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      commitShas: commits.map((c) => c.sha),
    };

    const data = await readSessions(this.repoRoot, mergeBase);
    data.sessions.push(session);
    await writeSessions(this.repoRoot, mergeBase, data);

    this.updateStatusBar(session);
    vscode.window.showInformationMessage(
      `Review session started for ${branch} (${commits.length} commits).`
    );

    return session;
  }

  async reReview(): Promise<ReviewSession | null> {
    const baseBranch = await this.getBaseBranch();
    const branch = await getCurrentBranch(this.repoRoot);
    const mergeBase = await getMergeBase(this.repoRoot, branch, baseBranch);
    const session = await findActiveSession(this.repoRoot, mergeBase, branch);

    if (!session) {
      vscode.window.showWarningMessage("No active review session to re-review.");
      return null;
    }

    const oldShas = session.commitShas;
    const newCommits = await getCommitsBetween(this.repoRoot, mergeBase, "HEAD");
    const newShas = newCommits.map((c) => c.sha);

    // Collect old comments
    const oldComments = await getAllSessionComments(this.repoRoot, oldShas);

    // Map comments to new commits
    await this.mapCommentsToNewCommits(oldComments, newShas, session.id);

    // Update session
    const updated = await updateSession(this.repoRoot, mergeBase, session.id, {
      commitShas: newShas,
      revision: session.revision + 1,
      status: "in_progress",
    });

    this.updateStatusBar(updated);
    vscode.window.showInformationMessage(
      `Re-review started (revision ${updated.revision}). ${oldComments.length} comments remapped.`
    );

    return updated;
  }

  async getActiveSession(): Promise<ReviewSession | null> {
    const baseBranch = await this.getBaseBranch();
    const branch = await getCurrentBranch(this.repoRoot);
    if (branch === baseBranch || branch === "HEAD") return null;
    try {
      const mergeBase = await getMergeBase(this.repoRoot, branch, baseBranch);
      const session = await findActiveSession(this.repoRoot, mergeBase, branch);
      if (session) this.updateStatusBar(session);
      return session;
    } catch {
      return null;
    }
  }

  updateStatusBar(session: ReviewSession | null): void {
    if (!session) {
      this.statusBarItem.hide();
      return;
    }
    const icon =
      session.status === "approved"
        ? "$(check)"
        : session.status === "changes_requested"
          ? "$(comment-discussion)"
          : "$(eye)";
    this.statusBarItem.text = `${icon} Review: ${session.branchName}`;
    this.statusBarItem.tooltip = `Status: ${session.status} | Revision: ${session.revision}`;
    this.statusBarItem.show();
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }

  private async mapCommentsToNewCommits(
    oldComments: ReviewComment[],
    newShas: string[],
    sessionId: string
  ): Promise<void> {
    // Group old comments by file
    const byFile = new Map<string, ReviewComment[]>();
    for (const c of oldComments) {
      const list = byFile.get(c.filePath) ?? [];
      list.push(c);
      byFile.set(c.filePath, list);
    }

    // For each new commit, check which files it touches and carry forward comments
    const { getChangedFiles, getFileAtRef } = await import(
      "@ai-review-loop/shared"
    );

    for (const newSha of newShas) {
      const changedFiles = await getChangedFiles(this.repoRoot, newSha);
      const newData: CommitReviewData = { sessionId, comments: [] };

      for (const cf of changedFiles) {
        const comments = byFile.get(cf.path);
        if (!comments) continue;

        // Try to get the file at this commit to check if lines still exist
        let fileContent: string;
        try {
          fileContent = await getFileAtRef(this.repoRoot, newSha, cf.path);
        } catch {
          // File deleted in this commit — mark comments as outdated
          for (const c of comments) {
            newData.comments.push({ ...c, commitSha: newSha, status: "outdated" });
          }
          continue;
        }

        const lineCount = fileContent.split("\n").length;
        for (const c of comments) {
          if (c.startLine <= lineCount) {
            // Lines still within range — carry forward
            newData.comments.push({ ...c, commitSha: newSha });
          } else {
            // Lines beyond file length — mark outdated
            newData.comments.push({ ...c, commitSha: newSha, status: "outdated" });
          }
        }

        // Remove from byFile so we don't double-assign
        byFile.delete(cf.path);
      }

      if (newData.comments.length > 0) {
        await writeCommitReview(this.repoRoot, newSha, newData);
      }
    }

    // Any remaining comments (file not in new commits) — mark outdated on last commit
    if (byFile.size > 0 && newShas.length > 0) {
      const lastSha = newShas[newShas.length - 1];
      let existing = await readCommitReview(this.repoRoot, lastSha);
      if (!existing) existing = { sessionId, comments: [] };
      for (const comments of byFile.values()) {
        for (const c of comments) {
          existing.comments.push({ ...c, commitSha: lastSha, status: "outdated" });
        }
      }
      await writeCommitReview(this.repoRoot, lastSha, existing);
    }
  }
}
