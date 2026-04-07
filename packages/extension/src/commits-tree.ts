import * as vscode from "vscode";
import {
  getCommitsBetween,
  getCurrentBranch,
  getMergeBase,
} from "@ai-review-loop/shared";

export interface CommitItem {
  sha: string;
  subject: string;
  date: string;
  /** Set on the synthetic "Branch Overview" entry */
  isBranchOverview?: boolean;
  /** Merge-base SHA, set on the branch overview entry */
  mergeBase?: string;
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
      const commits = await getCommitsBetween(
        this.repoRoot,
        mergeBase,
        "HEAD"
      );
      // Reverse to show newest first
      commits.reverse();

      // Add synthetic "Branch Overview" entry at the top
      const headSha = commits.length > 0 ? commits[0].sha : mergeBase;
      const overview: CommitItem = {
        sha: headSha,
        subject: `All changes (${commits.length} commits)`,
        date: "",
        isBranchOverview: true,
        mergeBase,
      };

      this.commits = [overview, ...commits];
    } catch {
      this.commits = [];
    }
    this._onDidChangeTreeData.fire();
  }

  getCommits(): CommitItem[] {
    return this.commits;
  }

  getTreeItem(element: CommitItem): vscode.TreeItem {
    if (element.isBranchOverview) {
      const item = new vscode.TreeItem(
        element.subject,
        vscode.TreeItemCollapsibleState.None
      );
      item.tooltip = "View all files changed across the entire branch";
      item.iconPath = new vscode.ThemeIcon("git-merge");
      item.command = {
        command: "aiReviewLoop.selectCommit",
        title: "Select Branch Overview",
        arguments: [element],
      };
      item.contextValue = "branchOverview";
      return item;
    }

    const shortSha = element.sha.slice(0, 7);
    const item = new vscode.TreeItem(
      `${shortSha} ${element.subject}`,
      vscode.TreeItemCollapsibleState.None
    );
    item.tooltip = `${element.sha}\n${element.date}\n${element.subject}`;
    item.iconPath = new vscode.ThemeIcon("git-commit");
    item.command = {
      command: "aiReviewLoop.selectCommit",
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
