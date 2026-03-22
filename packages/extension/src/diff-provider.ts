import * as vscode from "vscode";
import { getFileAtRef } from "@ai-code-reviewer/shared";

export const SCHEME = "ai-review";

/**
 * Provides file content at specific git refs for the diff viewer.
 * URI format: ai-review://repo/<ref>/<filepath>
 */
export class DiffContentProvider implements vscode.TextDocumentContentProvider {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    // URI path: /<ref>/<filepath>
    const path = uri.path;
    const firstSlash = path.indexOf("/", 1);
    const ref = path.slice(1, firstSlash);
    const filePath = path.slice(firstSlash + 1);
    try {
      return await getFileAtRef(this.repoRoot, ref, filePath);
    } catch {
      // File doesn't exist at this ref (e.g., newly added or deleted)
      return "";
    }
  }
}

export function makeUri(ref: string, filePath: string): vscode.Uri {
  return vscode.Uri.parse(`${SCHEME}://repo/${ref}/${filePath}`);
}
