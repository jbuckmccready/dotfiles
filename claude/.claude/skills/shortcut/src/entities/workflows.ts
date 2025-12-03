import type { Command } from "commander";
import type { ApiWorkflow, FormattedWorkflow } from "../types.js";
import {
  ShortcutClient,
  formatWorkflow,
  output,
  outputError,
} from "../client.js";

export async function getWorkflow(
  workflowId: number,
): Promise<FormattedWorkflow> {
  const client = new ShortcutClient();
  const workflow = await client.get<ApiWorkflow>(`workflows/${workflowId}`);
  return formatWorkflow(workflow);
}

export async function listWorkflows(): Promise<FormattedWorkflow[]> {
  const client = new ShortcutClient();
  const workflows = await client.get<ApiWorkflow[]>("workflows");
  return workflows.map(formatWorkflow);
}

export function registerReadCommands(program: Command): void {
  const workflows = program
    .command("workflows")
    .description("Workflow operations");

  workflows
    .command("get <workflow-id>")
    .description("Get a workflow by ID")
    .action(async (workflowId: string) => {
      try {
        const result = await getWorkflow(parseInt(workflowId, 10));
        output(result);
      } catch (e) {
        outputError(e);
      }
    });

  workflows
    .command("list")
    .description("List all workflows")
    .action(async () => {
      try {
        const result = await listWorkflows();
        output(result);
      } catch (e) {
        outputError(e);
      }
    });
}
