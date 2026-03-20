import * as vscode from "vscode";
import {
  getCommitsBetween,
  getCurrentBranch,
  getMergeBase,
} from "@ai-code-reviewer/shared";

export interface CommitItem {
  sha: string;
  subject: string;
  date: string;
}

export class CommitsTreeProvider
  implements vscode.TreeDataProvider<CommitItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private commits: CommitItem[] = [];
  private repoRoot: string;
  private baseBranch: string;

  constructor(repoRoot: string, baseBranch: string) {
    this.repoRoot = repoRoot;
    this.baseBranch = baseBranch;
  }

  setBaseBranch(branch: string): void {
    this.baseBranch = branch;
  }

  async refresh(): Promise<void> {
    try {
      const branch = await getCurrentBranch(this.repoRoot);
      if (branch === this.baseBranch || branch === "HEAD") {
        this.commits = [];
        this._onDidChangeTreeData.fire();
        return;
      }
      const mergeBase = await getMergeBase(
        this.repoRoot,
        branch,
        this.baseBranch
      );
      this.commits = await getCommitsBetween(
        this.repoRoot,
        mergeBase,
        "HEAD"
      );
      // Reverse to show newest first
      this.commits.reverse();
    } catch {
      this.commits = [];
    }
    this._onDidChangeTreeData.fire();
  }

  getCommits(): CommitItem[] {
    return this.commits;
  }

  getTreeItem(element: CommitItem): vscode.TreeItem {
    const shortSha = element.sha.slice(0, 7);
    const item = new vscode.TreeItem(
      `${shortSha} ${element.subject}`,
      vscode.TreeItemCollapsibleState.None
    );
    item.tooltip = `${element.sha}\n${element.date}\n${element.subject}`;
    item.iconPath = new vscode.ThemeIcon("git-commit");
    item.command = {
      command: "aiCodeReview.selectCommit",
      title: "Select Commit",
      arguments: [element],
    };
    item.contextValue = "commit";
    return item;
  }

  getChildren(): CommitItem[] {
    return this.commits;
  }
}
