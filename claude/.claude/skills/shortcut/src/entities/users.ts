import type { Command } from "commander";
import type {
  ApiMember,
  ApiTeam,
  FormattedMember,
  FormattedTeam,
} from "../types.js";
import {
  ShortcutClient,
  formatMember,
  formatTeam,
  getCurrentUser,
  output,
  outputError,
} from "../client.js";

export async function getMember(memberId: string): Promise<FormattedMember> {
  const client = new ShortcutClient();
  const member = await client.get<ApiMember>(`members/${memberId}`);
  return formatMember(member);
}

export async function listMembers(): Promise<FormattedMember[]> {
  const client = new ShortcutClient();
  const members = await client.get<ApiMember[]>("members");
  return members.map(formatMember);
}

export async function getCurrentMember(): Promise<FormattedMember> {
  return getCurrentUser();
}

export async function getCurrentTeams(): Promise<FormattedTeam[]> {
  const currentUser = await getCurrentUser();
  const currentUserId = currentUser.id;

  const client = new ShortcutClient();
  const allTeams = await client.get<ApiTeam[]>("groups");

  const userTeams = allTeams.filter((team) =>
    (team.member_ids || []).includes(currentUserId),
  );

  return userTeams.map(formatTeam);
}

export function registerReadCommands(program: Command): void {
  const users = program.command("users").description("User/member operations");

  users
    .command("get <member-id>")
    .description("Get a member by ID")
    .action(async (memberId: string) => {
      try {
        const result = await getMember(memberId);
        output(result);
      } catch (e) {
        outputError(e);
      }
    });

  users
    .command("list")
    .description("List all members")
    .action(async () => {
      try {
        const result = await listMembers();
        output(result);
      } catch (e) {
        outputError(e);
      }
    });

  users
    .command("current")
    .description("Get current authenticated user")
    .action(async () => {
      try {
        const result = await getCurrentMember();
        output(result);
      } catch (e) {
        outputError(e);
      }
    });

  users
    .command("current-teams")
    .description("Get teams for current user")
    .action(async () => {
      try {
        const result = await getCurrentTeams();
        output(result);
      } catch (e) {
        outputError(e);
      }
    });
}
