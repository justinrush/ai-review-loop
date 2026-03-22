import * as vscode from "vscode";
import {
  getCurrentBranch,
  getMergeBase,
  getCommitsBetween,
  findActiveSession,
  getAllSessionComments,
  type ReviewComment,
} from "@ai-code-reviewer/shared";

export type CommentTreeItem = CommentGroupItem | CommentEntryItem;

export interface CommentGroupItem {
  kind: "group";
  label: string;
  status: string;
  count: number;
}

export interface CommentEntryItem {
  kind: "entry";
  comment: ReviewComment;
}

export class CommentsTreeProvider
  implements vscode.TreeDataProvider<CommentTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    void | CommentTreeItem
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private comments: ReviewComment[] = [];
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
        this.comments = [];
        this._onDidChangeTreeData.fire();
        return;
      }
      const mergeBase = await getMergeBase(
        this.repoRoot,
        branch,
        this.baseBranch
      );
      const session = await findActiveSession(this.repoRoot, mergeBase);
      if (!session) {
        this.comments = [];
        this._onDidChangeTreeData.fire();
        return;
      }
      this.comments = await getAllSessionComments(
        this.repoRoot,
        session.commitShas
      );
    } catch {
      this.comments = [];
    }
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CommentTreeItem): vscode.TreeItem {
    if (element.kind === "group") {
      const item = new vscode.TreeItem(
        `${element.label} (${element.count})`,
        element.count > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed
      );
      item.iconPath = new vscode.ThemeIcon(this.getGroupIcon(element.status));
      item.contextValue = "commentGroup";
      return item;
    }

    const c = element.comment;
    const isGeneral = c.filePath === "(general)";
    const location = isGeneral
      ? "(general)"
      : `${c.filePath}:${c.startLine}`;
    const preview =
      c.body.length > 60 ? c.body.slice(0, 57) + "..." : c.body;

    const item = new vscode.TreeItem(
      preview,
      vscode.TreeItemCollapsibleState.None
    );
    item.description = location;
    item.tooltip = this.buildTooltip(c);
    item.iconPath = new vscode.ThemeIcon(this.getStatusIcon(c.status));

    if (!isGeneral) {
      item.command = {
        command: "aiCodeReview.openCommentInDiff",
        title: "Open in Diff",
        arguments: [element.comment],
      };
    }

    item.contextValue = "commentEntry";
    return item;
  }

  getChildren(element?: CommentTreeItem): CommentTreeItem[] {
    if (!element) {
      // Root level — show status groups
      const groups: CommentGroupItem[] = [
        {
          kind: "group",
          label: "Open",
          status: "open",
          count: this.comments.filter((c) => c.status === "open").length,
        },
        {
          kind: "group",
          label: "Addressed",
          status: "addressed",
          count: this.comments.filter((c) => c.status === "addressed").length,
        },
        {
          kind: "group",
          label: "Resolved",
          status: "resolved",
          count: this.comments.filter((c) => c.status === "resolved").length,
        },
      ];
      // Only show groups that have comments, or always show Open
      return groups.filter((g) => g.count > 0 || g.status === "open");
    }

    if (element.kind === "group") {
      return this.comments
        .filter((c) => c.status === element.status)
        .map((c) => ({ kind: "entry" as const, comment: c }));
    }

    return [];
  }

  private getGroupIcon(status: string): string {
    switch (status) {
      case "open":
        return "comment-unresolved";
      case "addressed":
        return "comment-discussion";
      case "resolved":
        return "pass";
      default:
        return "comment";
    }
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case "open":
        return "circle-outline";
      case "addressed":
        return "check";
      case "resolved":
        return "pass-filled";
      case "outdated":
        return "history";
      default:
        return "circle-outline";
    }
  }

  private buildTooltip(c: ReviewComment): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**Status:** ${c.status}\n\n`);
    if (c.filePath !== "(general)") {
      md.appendMarkdown(
        `**File:** ${c.filePath}:${c.startLine}-${c.endLine}\n\n`
      );
    }
    md.appendMarkdown("---\n\n");
    for (const entry of c.thread) {
      const who = entry.author === "human" ? "You" : "AI Agent";
      md.appendMarkdown(`**${who}:**\n\n${entry.body}\n\n`);
    }
    return md;
  }
}
