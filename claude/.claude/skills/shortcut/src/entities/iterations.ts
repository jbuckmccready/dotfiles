import type { Command } from "commander";
import type {
  ApiIteration,
  FormattedIteration,
  DeleteResult,
} from "../types.js";
import {
  ShortcutClient,
  formatIteration,
  output,
  outputError,
} from "../client.js";

export async function getIteration(
  iterationId: number,
): Promise<FormattedIteration> {
  const client = new ShortcutClient();
  const iteration = await client.get<ApiIteration>(`iterations/${iterationId}`);
  return formatIteration(iteration);
}

export async function listIterations(
  includeStats = false,
  status?: string,
): Promise<FormattedIteration[]> {
  const client = new ShortcutClient();
  let iterations = await client.get<ApiIteration[]>("iterations");

  if (status) {
    iterations = iterations.filter((it) => it.status === status);
  }

  return iterations.map((it) => formatIteration(it, includeStats));
}

export interface CreateIterationOptions {
  name: string;
  startDate: string;
  endDate: string;
  description?: string;
  teamIds?: string[];
}

export async function createIteration(
  options: CreateIterationOptions,
): Promise<FormattedIteration> {
  const client = new ShortcutClient();
  const { name, startDate, endDate, description, teamIds } = options;

  const iterationData: Record<string, unknown> = {
    name,
    start_date: startDate,
    end_date: endDate,
  };
  if (description) iterationData.description = description;
  if (teamIds) iterationData.group_ids = teamIds;

  const iteration = await client.post<ApiIteration>(
    "iterations",
    iterationData,
  );
  return formatIteration(iteration);
}

export interface UpdateIterationOptions {
  iterationId: number;
  name?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  teamIds?: string[];
}

export async function updateIteration(
  options: UpdateIterationOptions,
): Promise<FormattedIteration> {
  const client = new ShortcutClient();
  const { iterationId, name, startDate, endDate, description, teamIds } =
    options;

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (startDate !== undefined) updateData.start_date = startDate;
  if (endDate !== undefined) updateData.end_date = endDate;
  if (description !== undefined) updateData.description = description;
  if (teamIds !== undefined) updateData.group_ids = teamIds;

  const iteration = await client.put<ApiIteration>(
    `iterations/${iterationId}`,
    updateData,
  );
  return formatIteration(iteration);
}

export async function deleteIteration(
  iterationId: number,
): Promise<DeleteResult> {
  const client = new ShortcutClient();
  await client.delete(`iterations/${iterationId}`);
  return { success: true, message: `Iteration ${iterationId} deleted` };
}

export function registerReadCommands(program: Command): void {
  const iterations = program
    .command("iterations")
    .description("Iteration operations");

  iterations
    .command("get <iteration-id>")
    .description("Get an iteration by ID")
    .action(async (iterationId: string) => {
      try {
        const result = await getIteration(parseInt(iterationId, 10));
        output(result);
      } catch (e) {
        outputError(e);
      }
    });

  iterations
    .command("list")
    .description("List all iterations")
    .option("--with-stats", "Include statistics")
    .option("--status <status>", "Filter by status (started, unstarted, done)")
    .action(async (opts) => {
      try {
        const result = await listIterations(opts.withStats, opts.status);
        output(result);
      } catch (e) {
        outputError(e);
      }
    });
}

export function registerWriteCommands(program: Command): void {
  const iterations = program
    .command("iterations")
    .description("Iteration operations");

  iterations
    .command("create <name> <start-date> <end-date>")
    .description("Create a new iteration")
    .option("--description <desc>", "Iteration description")
    .option("--team-ids <ids...>", "Team IDs")
    .action(async (name: string, startDate: string, endDate: string, opts) => {
      try {
        const result = await createIteration({
          name,
          startDate,
          endDate,
          description: opts.description,
          teamIds: opts.teamIds,
        });
        output(result);
      } catch (e) {
        outputError(e);
      }
    });

  iterations
    .command("update <iteration-id>")
    .description("Update an iteration")
    .option("--name <name>", "Updated name")
    .option("--start-date <date>", "Updated start date")
    .option("--end-date <date>", "Updated end date")
    .option("--description <desc>", "Updated description")
    .action(async (iterationId: string, opts) => {
      try {
        const result = await updateIteration({
          iterationId: parseInt(iterationId, 10),
          name: opts.name,
          startDate: opts.startDate,
          endDate: opts.endDate,
          description: opts.description,
        });
        output(result);
      } catch (e) {
        outputError(e);
      }
    });

  iterations
    .command("delete <iteration-id>")
    .description("Delete an iteration")
    .action(async (iterationId: string) => {
      try {
        const result = await deleteIteration(parseInt(iterationId, 10));
        output(result);
      } catch (e) {
        outputError(e);
      }
    });
}
