import * as vscode from "vscode";
import { getRepoRoot, getParentCommit, getRefSha } from "@ai-code-reviewer/shared";
import { CommitsTreeProvider, type CommitItem } from "./commits-tree.js";
import { FilesTreeProvider, type FileItem } from "./files-tree.js";
import { CommentsTreeProvider } from "./comments-tree.js";
import {
  DiffContentProvider,
  SCHEME,
  makeUri,
} from "./diff-provider.js";
import { ReviewCommentController } from "./review-comments.js";
import { ReviewSessionManager } from "./review-session.js";
import type { ReviewComment } from "@ai-code-reviewer/shared";

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return;

  let repoRoot: string;
  try {
    repoRoot = await getRepoRoot(workspaceFolder.uri.fsPath);
  } catch {
    return; // Not a git repo
  }

  const baseBranch =
    vscode.workspace
      .getConfiguration("aiCodeReview")
      .get<string>("baseBranch") ?? "main";

  // Providers
  const commitsTree = new CommitsTreeProvider(repoRoot, baseBranch);
  const filesTree = new FilesTreeProvider(repoRoot);
  const diffProvider = new DiffContentProvider(repoRoot);
  const commentsTree = new CommentsTreeProvider(repoRoot, baseBranch);
  const commentController = new ReviewCommentController(repoRoot);
  const sessionManager = new ReviewSessionManager(repoRoot);

  // Register tree views
  const commitsView = vscode.window.createTreeView("aiCodeReview.commits", {
    treeDataProvider: commitsTree,
  });
  const filesView = vscode.window.createTreeView("aiCodeReview.files", {
    treeDataProvider: filesTree,
  });
  const commentsView = vscode.window.createTreeView("aiCodeReview.comments", {
    treeDataProvider: commentsTree,
  });

  // Register diff content provider
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, diffProvider)
  );

  // Wire up auto-start: when the user creates a comment with no active session,
  // automatically start one instead of requiring a manual "Start Session" click.
  commentController.setSessionProvider(async () => {
    const session = await sessionManager.startSession();
    if (session) {
      vscode.commands.executeCommand("setContext", "aiCodeReview.hasActiveSession", true);
      await commitsTree.refresh();
      await commentsTree.refresh();
    }
    return session;
  });

  // Watch for git notes changes to auto-refresh.
  // Watch both loose refs and packed-refs (git may update either).
  const refreshAll = () => {
    commitsTree.refresh();
    commentsTree.refresh();
    commentController.refreshThreads();
  };
  const gitNotesWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(repoRoot, ".git/refs/notes/**")
  );
  const packedRefsWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(repoRoot, ".git/packed-refs")
  );
  gitNotesWatcher.onDidChange(refreshAll);
  gitNotesWatcher.onDidCreate(refreshAll);
  gitNotesWatcher.onDidDelete(refreshAll);
  packedRefsWatcher.onDidChange(refreshAll);

  // Polling fallback: VS Code file watchers are unreliable for .git/ internals.
  // Poll git notes ref SHAs every 3 seconds to catch changes the watchers miss.
  let lastReviewRef: string | null = null;
  let lastSessionsRef: string | null = null;
  const pollTimer = setInterval(async () => {
    try {
      const reviewRef = await getRefSha(repoRoot, "refs/notes/code-review");
      const sessionsRef = await getRefSha(repoRoot, "refs/notes/code-review-sessions");
      if (reviewRef !== lastReviewRef || sessionsRef !== lastSessionsRef) {
        lastReviewRef = reviewRef;
        lastSessionsRef = sessionsRef;
        refreshAll();
      }
    } catch {
      // Ignore polling errors
    }
  }, 3000);

  // Track selected commit for file tree
  let selectedCommit: CommitItem | null = null;

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "aiCodeReview.selectCommit",
      async (commit: CommitItem) => {
        selectedCommit = commit;
        await filesTree.showCommit(commit);
      }
    ),

    vscode.commands.registerCommand(
      "aiCodeReview.openDiff",
      async (fileItem: FileItem) => {
        const commitSha = fileItem.commitSha;
        const filePath = fileItem.file.path;

        let leftRef: string;
        if (fileItem.parentRef) {
          leftRef = fileItem.parentRef;
        } else {
          try {
            leftRef = await getParentCommit(repoRoot, commitSha);
          } catch {
            leftRef = "4b825dc642cb6eb9a060e54bf899d69f7cb46719"; // empty tree
          }
        }

        const leftUri = makeUri(leftRef, filePath);
        const rightUri = makeUri(commitSha, filePath);
        const title = `${filePath} (${commitSha.slice(0, 7)})`;

        await vscode.commands.executeCommand(
          "vscode.diff",
          leftUri,
          rightUri,
          title
        );

        // Load existing comments for this file
        const doc = await vscode.workspace.openTextDocument(rightUri);
        await commentController.loadCommentsForFile(commitSha, filePath, doc);
      }
    ),

    vscode.commands.registerCommand(
      "aiCodeReview.refreshCommits",
      () => {
        commitsTree.refresh();
        commentsTree.refresh();
      }
    ),

    vscode.commands.registerCommand(
      "aiCodeReview.refreshComments",
      () => commentsTree.refresh()
    ),

    vscode.commands.registerCommand(
      "aiCodeReview.openCommentInDiff",
      async (comment: ReviewComment) => {
        const commitSha = comment.commitSha;
        const filePath = comment.filePath;

        let parentRef: string;
        try {
          parentRef = await getParentCommit(repoRoot, commitSha);
        } catch {
          parentRef = "4b825dc642cb6eb9a060e54bf899d69f7cb46719";
        }

        const leftUri = makeUri(parentRef, filePath);
        const rightUri = makeUri(commitSha, filePath);
        const title = `${filePath} (${commitSha.slice(0, 7)})`;

        await vscode.commands.executeCommand(
          "vscode.diff",
          leftUri,
          rightUri,
          title
        );

        const doc = await vscode.workspace.openTextDocument(rightUri);
        await commentController.loadCommentsForFile(commitSha, filePath, doc);
      }
    ),

    vscode.commands.registerCommand(
      "aiCodeReview.startSession",
      async () => {
        const session = await sessionManager.startSession();
        if (session) {
          commentController.setActiveSessionId(session.id);
          vscode.commands.executeCommand("setContext", "aiCodeReview.hasActiveSession", true);
          await commitsTree.refresh();
          await commentsTree.refresh();
        }
      }
    ),

    vscode.commands.registerCommand(
      "aiCodeReview.submitReview",
      async () => {
        await sessionManager.submitReview();
        vscode.commands.executeCommand("setContext", "aiCodeReview.hasActiveSession", false);
        await commentsTree.refresh();
      }
    ),

    vscode.commands.registerCommand(
      "aiCodeReview.reReview",
      async () => {
        const session = await sessionManager.reReview();
        if (session) {
          commentController.clearThreads();
          commentController.setActiveSessionId(session.id);
          vscode.commands.executeCommand("setContext", "aiCodeReview.hasActiveSession", true);
          await commitsTree.refresh();
          await commentsTree.refresh();
        }
      }
    ),

    vscode.commands.registerCommand(
      "aiCodeReview.addComment",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== SCHEME) {
          vscode.window.showWarningMessage(
            "Open a diff from the AI Code Review panel to add comments."
          );
          return;
        }
        // The native Comments API "+" button handles this; this command
        // is for the context menu. Trigger the comment input.
        await vscode.commands.executeCommand(
          "editor.action.addCommentLine"
        );
      }
    ),

    vscode.commands.registerCommand(
      "aiCodeReview.addGeneralComment",
      () => commentController.addGeneralComment(baseBranch)
    ),

    vscode.commands.registerCommand(
      "aiCodeReview.setBaseBranch",
      async () => {
        const input = await vscode.window.showInputBox({
          prompt: "Enter the base branch name",
          value: baseBranch,
        });
        if (input) {
          await vscode.workspace
            .getConfiguration("aiCodeReview")
            .update("baseBranch", input, vscode.ConfigurationTarget.Workspace);
          commitsTree.setBaseBranch(input);
          await commitsTree.refresh();
        }
      }
    ),

    // Handle comment creation from native Comments API
    vscode.commands.registerCommand(
      "aiCodeReview.createComment",
      (reply: vscode.CommentReply) => commentController.createComment(reply)
    ),

    vscode.commands.registerCommand(
      "aiCodeReview.resolveComment",
      (thread: vscode.CommentThread) => commentController.resolveComment(thread)
    ),

    vscode.commands.registerCommand(
      "aiCodeReview.refreshAll",
      () => refreshAll()
    )
  );

  // Initialize: refresh commits and check for active session
  await commitsTree.refresh();
  const activeSession = await sessionManager.getActiveSession();
  if (activeSession) {
    commentController.setActiveSessionId(activeSession.id);
    vscode.commands.executeCommand("setContext", "aiCodeReview.hasActiveSession", true);
  }
  await commentsTree.refresh();

  context.subscriptions.push(
    commitsView,
    filesView,
    commentsView,
    commentController,
    gitNotesWatcher,
    packedRefsWatcher,
    { dispose: () => clearInterval(pollTimer) }
  );
}

export function deactivate(): void {
  // Cleanup handled by disposables
}
