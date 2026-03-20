import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CommitReviewData, ReviewSession, SessionNote } from "./types.js";

const execFileAsync = promisify(execFile);

const REVIEW_REF = "refs/notes/code-review";
const SESSIONS_REF = "refs/notes/code-review-sessions";

async function gitNotes(
  args: string[],
  cwd: string
): Promise<string> {
  const { stdout } = await execFileAsync("git", ["notes", ...args], { cwd });
  return stdout.trimEnd();
}

async function readNote(
  cwd: string,
  ref: string,
  objectSha: string
): Promise<string | null> {
  try {
    return await gitNotes(["--ref", ref, "show", objectSha], cwd);
  } catch {
    return null;
  }
}

async function writeNote(
  cwd: string,
  ref: string,
  objectSha: string,
  content: string
): Promise<void> {
  try {
    // Try add first
    await gitNotes(["--ref", ref, "add", "-f", "-m", content, objectSha], cwd);
  } catch {
    // If add fails, use overwrite
    await gitNotes(
      ["--ref", ref, "add", "--force", "-m", content, objectSha],
      cwd
    );
  }
}

// --- Commit review data (per-commit comments) ---

export async function readCommitReview(
  cwd: string,
  commitSha: string
): Promise<CommitReviewData | null> {
  const raw = await readNote(cwd, REVIEW_REF, commitSha);
  if (!raw) return null;
  return JSON.parse(raw) as CommitReviewData;
}

export async function writeCommitReview(
  cwd: string,
  commitSha: string,
  data: CommitReviewData
): Promise<void> {
  await writeNote(cwd, REVIEW_REF, commitSha, JSON.stringify(data, null, 2));
}

// --- Session data (stored on merge-base commit) ---

export async function readSessions(
  cwd: string,
  mergeBaseSha: string
): Promise<SessionNote> {
  const raw = await readNote(cwd, SESSIONS_REF, mergeBaseSha);
  if (!raw) return { sessions: [] };
  return JSON.parse(raw) as SessionNote;
}

export async function writeSessions(
  cwd: string,
  mergeBaseSha: string,
  data: SessionNote
): Promise<void> {
  await writeNote(
    cwd,
    SESSIONS_REF,
    mergeBaseSha,
    JSON.stringify(data, null, 2)
  );
}

export async function findActiveSession(
  cwd: string,
  mergeBaseSha: string
): Promise<ReviewSession | null> {
  const { sessions } = await readSessions(cwd, mergeBaseSha);
  return (
    sessions.find(
      (s) =>
        s.status === "in_progress" ||
        s.status === "submitted" ||
        s.status === "changes_requested"
    ) ?? null
  );
}

export async function updateSession(
  cwd: string,
  mergeBaseSha: string,
  sessionId: string,
  updates: Partial<ReviewSession>
): Promise<ReviewSession> {
  const data = await readSessions(cwd, mergeBaseSha);
  const idx = data.sessions.findIndex((s) => s.id === sessionId);
  if (idx === -1) throw new Error(`Session ${sessionId} not found`);
  data.sessions[idx] = {
    ...data.sessions[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await writeSessions(cwd, mergeBaseSha, data);
  return data.sessions[idx];
}

/** Collect all comments across all commits in a session */
export async function getAllSessionComments(
  cwd: string,
  commitShas: string[]
): Promise<import("./types.js").ReviewComment[]> {
  const all: import("./types.js").ReviewComment[] = [];
  for (const sha of commitShas) {
    const data = await readCommitReview(cwd, sha);
    if (data) all.push(...data.comments);
  }
  return all;
}
