import type { Command } from "commander";
import type { ApiDocument, FormattedDocument } from "../types.js";
import { ShortcutClient, output, outputError } from "../client.js";

export async function createDocument(
  name: string,
  content: string,
): Promise<FormattedDocument> {
  const client = new ShortcutClient();

  const documentData = { name, content };
  const document = await client.post<ApiDocument>("docs", documentData);

  return {
    id: document.id,
    name: document.name,
    app_url: document.app_url,
    created_at: document.created_at,
  };
}

export function registerWriteCommands(program: Command): void {
  const documents = program
    .command("documents")
    .description("Document operations");

  documents
    .command("create <name> <content>")
    .description("Create a new document with HTML content")
    .action(async (name: string, content: string) => {
      try {
        const result = await createDocument(name, content);
        output(result);
      } catch (e) {
        outputError(e);
      }
    });
}
