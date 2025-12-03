import type { Command } from "commander";
import type { ApiTeam, FormattedTeam } from "../types.js";
import { ShortcutClient, formatTeam, output, outputError } from "../client.js";

export async function getTeam(teamId: string): Promise<FormattedTeam> {
  const client = new ShortcutClient();
  const team = await client.get<ApiTeam>(`groups/${teamId}`);
  return formatTeam(team);
}

export async function listTeams(): Promise<FormattedTeam[]> {
  const client = new ShortcutClient();
  const teams = await client.get<ApiTeam[]>("groups");
  return teams.map(formatTeam);
}

export function registerReadCommands(program: Command): void {
  const teams = program.command("teams").description("Team operations");

  teams
    .command("get <team-id>")
    .description("Get a team by ID")
    .action(async (teamId: string) => {
      try {
        const result = await getTeam(teamId);
        output(result);
      } catch (e) {
        outputError(e);
      }
    });

  teams
    .command("list")
    .description("List all teams")
    .action(async () => {
      try {
        const result = await listTeams();
        output(result);
      } catch (e) {
        outputError(e);
      }
    });
}
