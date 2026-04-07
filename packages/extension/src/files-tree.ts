import * as vscode from "vscode";
import {
  getChangedFiles,
  getChangedFilesBetween,
  type ChangedFile,
} from "@ai-review-loop/shared";
import type { CommitItem } from "./commits-tree.js";

export interface FileItem {
  file: ChangedFile;
  commitSha: string;
  /** When set, use this as the left side of the diff instead of the commit's parent */
  parentRef?: string;
}

export class FilesTreeProvider implements vscode.TreeDataProvider<FileItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private files: FileItem[] = [];
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  async showCommit(commit: CommitItem): Promise<void> {
    try {
      if (commit.isBranchOverview && commit.mergeBase) {
        const changed = await getChangedFilesBetween(
          this.repoRoot,
          commit.mergeBase,
          "HEAD"
        );
        this.files = changed.map((f) => ({
          file: f,
          commitSha: commit.sha,
          parentRef: commit.mergeBase,
        }));
      } else {
        const changed = await getChangedFiles(this.repoRoot, commit.sha);
        this.files = changed.map((f) => ({ file: f, commitSha: commit.sha }));
      }
    } catch {
      this.files = [];
    }
    this._onDidChangeTreeData.fire();
  }

  clear(): void {
    this.files = [];
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: FileItem): vscode.TreeItem {
    const statusIcon = this.getStatusIcon(element.file.status);
    const label = element.file.path;
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(statusIcon);
    item.description =
      element.file.oldPath && element.file.status === "R"
        ? `(from ${element.file.oldPath})`
        : undefined;
    item.command = {
      command: "aiReviewLoop.openDiff",
      title: "Open Diff",
      arguments: [element],
    };
    item.contextValue = "file";
    return item;
  }

  getChildren(): FileItem[] {
    return this.files;
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case "A":
        return "diff-added";
      case "D":
        return "diff-removed";
      case "M":
        return "diff-modified";
      case "R":
        return "diff-renamed";
      default:
        return "file";
    }
  }
}
