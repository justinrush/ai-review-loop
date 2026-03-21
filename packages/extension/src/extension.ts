import * as vscode from "vscode";
import { getRepoRoot } from "@ai-code-reviewer/shared";
import { CommitsTreeProvider, type CommitItem } from "./commits-tree.js";
import { FilesTreeProvider, type FileItem } from "./files-tree.js";
import {
  DiffContentProvider,
  SCHEME,
  makeUri,
} from "./diff-provider.js";
import { ReviewCommentController } from "./review-comments.js";
import { ReviewSessionManager } from "./review-session.js";
import { getParentCommit } from "@ai-code-reviewer/shared";

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
  const commentController = new ReviewCommentController(repoRoot);
  const sessionManager = new ReviewSessionManager(repoRoot);

  // Register tree views
  const commitsView = vscode.window.createTreeView("aiCodeReview.commits", {
    treeDataProvider: commitsTree,
  });
  const filesView = vscode.window.createTreeView("aiCodeReview.files", {
    treeDataProvider: filesTree,
  });

  // Register diff content provider
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, diffProvider)
  );

  // Watch for git notes changes to auto-refresh
  const gitNotesWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(repoRoot, ".git/refs/notes/**")
  );
  gitNotesWatcher.onDidChange(() => {
    commitsTree.refresh();
  });
  gitNotesWatcher.onDidCreate(() => {
    commitsTree.refresh();
  });

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

        let parentRef: string;
        try {
          parentRef = await getParentCommit(repoRoot, commitSha);
        } catch {
          parentRef = "4b825dc642cb6eb9a060e54bf899d69f7cb46719"; // empty tree
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

        // Load existing comments for this file
        const doc = await vscode.workspace.openTextDocument(rightUri);
        await commentController.loadCommentsForFile(commitSha, filePath, doc);
      }
    ),

    vscode.commands.registerCommand(
      "aiCodeReview.refreshCommits",
      () => commitsTree.refresh()
    ),

    vscode.commands.registerCommand(
      "aiCodeReview.startSession",
      async () => {
        const session = await sessionManager.startSession();
        if (session) {
          commentController.setActiveSessionId(session.id);
          vscode.commands.executeCommand("setContext", "aiCodeReview.hasActiveSession", true);
          await commitsTree.refresh();
        }
      }
    ),

    vscode.commands.registerCommand(
      "aiCodeReview.submitReview",
      async () => {
        await sessionManager.submitReview();
        vscode.commands.executeCommand("setContext", "aiCodeReview.hasActiveSession", false);
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
    )
  );

  // Initialize: refresh commits and check for active session
  await commitsTree.refresh();
  const activeSession = await sessionManager.getActiveSession();
  if (activeSession) {
    commentController.setActiveSessionId(activeSession.id);
    vscode.commands.executeCommand("setContext", "aiCodeReview.hasActiveSession", true);
  }

  context.subscriptions.push(
    commitsView,
    filesView,
    commentController,
    gitNotesWatcher
  );
}

export function deactivate(): void {
  // Cleanup handled by disposables
}
