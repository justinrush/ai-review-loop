export interface ReviewSession {
  id: string;
  branchName: string;
  baseBranch: string;
  baseCommit: string;
  status: "in_progress" | "submitted" | "changes_requested" | "approved";
  revision: number;
  createdAt: string;
  updatedAt: string;
  /** Ordered list of commit SHAs in this review (for re-review mapping) */
  commitShas: string[];
}

export interface ThreadEntry {
  body: string;
  author: "human" | "agent";
  createdAt: string;
}

export interface ReviewComment {
  id: string;
  sessionId: string;
  commitSha: string;
  filePath: string;
  startLine: number;
  endLine: number;
  body: string;
  status: "open" | "addressed" | "resolved" | "outdated";
  createdAt: string;
  thread: ThreadEntry[];
}

/** Stored as git note on each reviewed commit (refs/notes/code-review) */
export interface CommitReviewData {
  sessionId: string;
  comments: ReviewComment[];
}

/** Stored on merge-base commit (refs/notes/code-review-sessions) */
export interface SessionNote {
  sessions: ReviewSession[];
}
