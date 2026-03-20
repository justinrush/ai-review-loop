import * as vscode from "vscode";
import { getChangedFiles, type ChangedFile } from "@ai-code-reviewer/shared";
import type { CommitItem } from "./commits-tree.js";

export interface FileItem {
  file: ChangedFile;
  commitSha: string;
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
      const changed = await getChangedFiles(this.repoRoot, commit.sha);
      this.files = changed.map((f) => ({ file: f, commitSha: commit.sha }));
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
      command: "aiCodeReview.openDiff",
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
