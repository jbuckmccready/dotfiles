import type { Command } from "commander";
import type {
  ApiObjective,
  FormattedObjective,
  DeleteResult,
} from "../types.js";
import {
  ShortcutClient,
  formatObjective,
  output,
  outputError,
} from "../client.js";

export async function getObjective(
  objectiveId: string,
): Promise<FormattedObjective> {
  const client = new ShortcutClient();
  const objective = await client.get<ApiObjective>(`objectives/${objectiveId}`);
  return formatObjective(objective);
}

export async function listObjectives(): Promise<FormattedObjective[]> {
  const client = new ShortcutClient();
  const objectives = await client.get<ApiObjective[]>("objectives");
  return objectives.map(formatObjective);
}

export async function createObjective(
  name: string,
  description?: string,
): Promise<FormattedObjective> {
  const client = new ShortcutClient();

  const objectiveData: Record<string, unknown> = { name };
  if (description) objectiveData.description = description;

  const objective = await client.post<ApiObjective>(
    "objectives",
    objectiveData,
  );
  return formatObjective(objective);
}

export interface UpdateObjectiveOptions {
  objectiveId: string;
  name?: string;
  description?: string;
  state?: string;
}

export async function updateObjective(
  options: UpdateObjectiveOptions,
): Promise<FormattedObjective> {
  const client = new ShortcutClient();
  const { objectiveId, name, description, state } = options;

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (state !== undefined) updateData.state = state;

  const objective = await client.put<ApiObjective>(
    `objectives/${objectiveId}`,
    updateData,
  );
  return formatObjective(objective);
}

export async function deleteObjective(
  objectiveId: string,
): Promise<DeleteResult> {
  const client = new ShortcutClient();
  await client.delete(`objectives/${objectiveId}`);
  return { success: true, message: `Objective ${objectiveId} deleted` };
}

export function registerReadCommands(program: Command): void {
  const objectives = program
    .command("objectives")
    .description("Objective operations");

  objectives
    .command("get <objective-id>")
    .description("Get an objective by ID")
    .action(async (objectiveId: string) => {
      try {
        const result = await getObjective(objectiveId);
        output(result);
      } catch (e) {
        outputError(e);
      }
    });

  objectives
    .command("list")
    .description("List all objectives")
    .action(async () => {
      try {
        const result = await listObjectives();
        output(result);
      } catch (e) {
        outputError(e);
      }
    });
}

export function registerWriteCommands(program: Command): void {
  const objectives = program
    .command("objectives")
    .description("Objective operations");

  objectives
    .command("create <name>")
    .description("Create a new objective")
    .option("--description <desc>", "Objective description")
    .action(async (name: string, opts) => {
      try {
        const result = await createObjective(name, opts.description);
        output(result);
      } catch (e) {
        outputError(e);
      }
    });

  objectives
    .command("update <objective-id>")
    .description("Update an objective")
    .option("--name <name>", "Updated name")
    .option("--description <desc>", "Updated description")
    .option("--state <state>", "Updated state")
    .action(async (objectiveId: string, opts) => {
      try {
        const result = await updateObjective({
          objectiveId,
          name: opts.name,
          description: opts.description,
          state: opts.state,
        });
        output(result);
      } catch (e) {
        outputError(e);
      }
    });

  objectives
    .command("delete <objective-id>")
    .description("Delete an objective")
    .action(async (objectiveId: string) => {
      try {
        const result = await deleteObjective(objectiveId);
        output(result);
      } catch (e) {
        outputError(e);
      }
    });
}
