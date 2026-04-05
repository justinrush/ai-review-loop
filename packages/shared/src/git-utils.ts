import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function git(
  args: string[],
  cwd: string
): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trimEnd();
}

export async function getCurrentBranch(cwd: string): Promise<string> {
  return git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
}

export async function getMergeBase(
  cwd: string,
  branch: string,
  base: string
): Promise<string> {
  return git(["merge-base", branch, base], cwd);
}

export async function getCommitsBetween(
  cwd: string,
  base: string,
  head: string
): Promise<Array<{ sha: string; subject: string; date: string }>> {
  const output = await git(
    ["log", "--format=%H%x00%s%x00%aI", "--reverse", `${base}..${head}`],
    cwd
  );
  if (!output) return [];
  return output.split("\n").map((line) => {
    const [sha, subject, date] = line.split("\0");
    return { sha, subject, date };
  });
}

export interface ChangedFile {
  status: string;
  path: string;
  oldPath?: string;
}

export async function getChangedFiles(
  cwd: string,
  commitSha: string
): Promise<ChangedFile[]> {
  const output = await git(
    ["diff-tree", "--no-commit-id", "-r", "--name-status", commitSha],
    cwd
  );
  if (!output) return [];
  return output.split("\n").map((line) => {
    const parts = line.split("\t");
    const status = parts[0];
    if (status.startsWith("R") || status.startsWith("C")) {
      return { status: status[0], oldPath: parts[1], path: parts[2] };
    }
    return { status, path: parts[1] };
  });
}

export async function getChangedFilesBetween(
  cwd: string,
  base: string,
  head: string
): Promise<ChangedFile[]> {
  const output = await git(
    ["diff", "--name-status", `${base}...${head}`],
    cwd
  );
  if (!output) return [];
  return output.split("\n").map((line) => {
    const parts = line.split("\t");
    const status = parts[0];
    if (status.startsWith("R") || status.startsWith("C")) {
      return { status: status[0], oldPath: parts[1], path: parts[2] };
    }
    return { status, path: parts[1] };
  });
}

export async function getFileAtRef(
  cwd: string,
  ref: string,
  filePath: string
): Promise<string> {
  return git(["show", `${ref}:${filePath}`], cwd);
}

export async function getRepoRoot(cwd: string): Promise<string> {
  return git(["rev-parse", "--show-toplevel"], cwd);
}

export async function getParentCommit(
  cwd: string,
  sha: string
): Promise<string> {
  return git(["rev-parse", `${sha}^`], cwd);
}

/** Return the current SHA of a git ref, or null if it doesn't exist. */
export async function getRefSha(
  cwd: string,
  ref: string
): Promise<string | null> {
  try {
    return await git(["rev-parse", ref], cwd);
  } catch {
    return null;
  }
}
