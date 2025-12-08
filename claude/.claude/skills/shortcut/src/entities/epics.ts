import type { Command } from "commander";
import type { ApiEpic, FormattedEpic, DeleteResult } from "../types.js";
import { ShortcutClient, formatEpic, output, outputError } from "../client.js";

export async function getEpic(epicId: number): Promise<FormattedEpic> {
  const client = new ShortcutClient();
  const epic = await client.get<ApiEpic>(`epics/${epicId}`);
  return formatEpic(epic);
}

export async function listEpics(): Promise<FormattedEpic[]> {
  const client = new ShortcutClient();
  const epics = await client.get<ApiEpic[]>("epics");
  return epics.map(formatEpic);
}

export async function searchEpics(
  query?: string,
  state?: string,
): Promise<FormattedEpic[]> {
  const client = new ShortcutClient();
  const params: Record<string, string> = {};
  if (query) params.query = query;
  if (state) params.state = state;

  const epics = await client.get<ApiEpic[]>("epics", params);
  return epics.map(formatEpic);
}

export interface CreateEpicOptions {
  name: string;
  description?: string;
  state?: string;
  ownerIds?: string[];
  milestoneId?: number;
}

export async function createEpic(
  options: CreateEpicOptions,
): Promise<FormattedEpic> {
  const client = new ShortcutClient();
  const { name, description, state = "to do", ownerIds, milestoneId } = options;

  const epicData: Record<string, unknown> = { name, state };
  if (description) epicData.description = description;
  if (ownerIds) epicData.owner_ids = ownerIds;
  if (milestoneId) epicData.milestone_id = milestoneId;

  const epic = await client.post<ApiEpic>("epics", epicData);
  return formatEpic(epic);
}

export interface UpdateEpicOptions {
  epicId: number;
  name?: string;
  description?: string;
  state?: string;
  ownerIds?: string[];
  archived?: boolean;
}

export async function updateEpic(
  options: UpdateEpicOptions,
): Promise<FormattedEpic> {
  const client = new ShortcutClient();
  const { epicId, name, description, state, ownerIds, archived } = options;

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (state !== undefined) updateData.state = state;
  if (ownerIds !== undefined) updateData.owner_ids = ownerIds;
  if (archived !== undefined) updateData.archived = archived;

  const epic = await client.put<ApiEpic>(`epics/${epicId}`, updateData);
  return formatEpic(epic);
}

export async function deleteEpic(epicId: number): Promise<DeleteResult> {
  const client = new ShortcutClient();
  await client.delete(`epics/${epicId}`);
  return { success: true, message: `Epic ${epicId} deleted` };
}

export function registerReadCommands(program: Command): void {
  const epics = program.command("epics").description("Epic operations");

  epics
    .command("get <epic-id>")
    .description("Get an epic by ID")
    .action(async (epicId: string) => {
      try {
        const result = await getEpic(parseInt(epicId, 10));
        output(result);
      } catch (e) {
        outputError(e);
      }
    });

  epics
    .command("list")
    .description("List all epics")
    .action(async () => {
      try {
        const result = await listEpics();
        output(result);
      } catch (e) {
        outputError(e);
      }
    });

  epics
    .command("search")
    .description("Search epics")
    .option("--query <query>", "Search query")
    .option("--state <state>", "Epic state")
    .action(async (opts) => {
      try {
        const result = await searchEpics(opts.query, opts.state);
        output(result);
      } catch (e) {
        outputError(e);
      }
    });
}

export function registerWriteCommands(program: Command): void {
  const epics = program.command("epics").description("Epic operations");

  epics
    .command("create <name>")
    .description("Create a new epic")
    .option("--description <desc>", "Epic description")
    .option("--state <state>", "Epic state", "to do")
    .option("--owner-ids <ids...>", "Owner IDs")
    .option("--milestone-id <id>", "Milestone ID")
    .action(async (name: string, opts) => {
      try {
        const result = await createEpic({
          name,
          description: opts.description,
          state: opts.state,
          ownerIds: opts.ownerIds,
          milestoneId: opts.milestoneId
            ? parseInt(opts.milestoneId, 10)
            : undefined,
        });
        output(result);
      } catch (e) {
        outputError(e);
      }
    });

  epics
    .command("update <epic-id>")
    .description("Update an epic")
    .option("--name <name>", "Updated name")
    .option("--description <desc>", "Updated description")
    .option("--state <state>", "Updated state")
    .option("--owner-ids <ids...>", "Owner IDs")
    .option("--archived", "Archive the epic")
    .action(async (epicId: string, opts) => {
      try {
        const result = await updateEpic({
          epicId: parseInt(epicId, 10),
          name: opts.name,
          description: opts.description,
          state: opts.state,
          ownerIds: opts.ownerIds,
          archived: opts.archived,
        });
        output(result);
      } catch (e) {
        outputError(e);
      }
    });

  epics
    .command("delete <epic-id>")
    .description("Delete an epic")
    .action(async (epicId: string) => {
      try {
        const result = await deleteEpic(parseInt(epicId, 10));
        output(result);
      } catch (e) {
        outputError(e);
      }
    });
}
