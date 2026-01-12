import type { Command } from "commander";
import type {
  ApiStory,
  FormattedStory,
  FormattedComment,
  BranchNameResult,
  DeleteResult,
  Label,
} from "../types.js";
import {
  ShortcutClient,
  formatStory,
  getCurrentUser,
  output,
  outputError,
} from "../client.js";
import { assertInGitRepo, gitSwitchCreate } from "../git.js";

export async function getStory(storyId: number): Promise<FormattedStory> {
  const client = new ShortcutClient();
  const story = await client.get<ApiStory>(`stories/${storyId}`);
  return formatStory(story);
}

export interface SearchStoriesOptions {
  query?: string;
  ownerIds?: string[];
  teamId?: string;
  iterationId?: number;
  epicId?: number;
  workflowStateId?: number;
  storyType?: string;
  limit?: number;
}

export async function searchStories(
  options: SearchStoriesOptions = {},
): Promise<FormattedStory[]> {
  const client = new ShortcutClient();
  const {
    query,
    ownerIds,
    teamId,
    iterationId,
    epicId,
    workflowStateId,
    storyType,
    limit = 25,
  } = options;

  if (iterationId) {
    let stories = await client.get<ApiStory[]>(
      `iterations/${iterationId}/stories`,
    );

    if (teamId) {
      stories = stories.filter((s) => s.group_id === teamId);
    }
    if (ownerIds) {
      stories = stories.filter((s) =>
        ownerIds.some((oid) => (s.owner_ids || []).includes(oid)),
      );
    }
    if (epicId) {
      stories = stories.filter((s) => s.epic_id === epicId);
    }
    if (workflowStateId) {
      stories = stories.filter((s) => s.workflow_state_id === workflowStateId);
    }
    if (storyType) {
      stories = stories.filter((s) => s.story_type === storyType);
    }
    if (query) {
      const queryLower = query.toLowerCase();
      stories = stories.filter(
        (s) =>
          s.name.toLowerCase().includes(queryLower) ||
          (s.description || "").toLowerCase().includes(queryLower),
      );
    }

    return stories.map(formatStory);
  }

  const searchParams: Record<string, string | number> = {
    page_size: Math.min(limit, 1000),
  };

  const filters: string[] = [];
  if (query) {
    filters.push(query);
  }
  if (ownerIds) {
    filters.push(`owner_ids:${ownerIds.join(",")}`);
  }
  if (teamId) {
    filters.push(`group_id:${teamId}`);
  }
  if (epicId) {
    filters.push(`epic_id:${epicId}`);
  }
  if (workflowStateId) {
    filters.push(`workflow_state_id:${workflowStateId}`);
  }
  if (storyType) {
    filters.push(`story_type:${storyType}`);
  }

  if (filters.length > 0) {
    searchParams.query = filters.join(" ");
  }

  const result = await client.get<{ data: ApiStory[] }>(
    "search/stories",
    searchParams,
  );
  return (result.data || []).map(formatStory);
}

export interface CreateStoryOptions {
  name: string;
  storyType?: string;
  description?: string;
  teamId?: string;
  ownerIds?: string[];
  requesterId?: string;
  iterationId?: number;
  epicId?: number;
  workflowStateId?: number;
  estimate?: number;
  labels?: Label[];
}

export async function createStory(
  options: CreateStoryOptions,
): Promise<FormattedStory> {
  const client = new ShortcutClient();
  const {
    name,
    storyType = "feature",
    description,
    teamId,
    ownerIds,
    requesterId,
    iterationId,
    epicId,
    workflowStateId,
    estimate,
    labels,
  } = options;

  let actualRequesterId = requesterId;
  if (!actualRequesterId) {
    const currentUser = await getCurrentUser(client);
    actualRequesterId = currentUser.id;
  }

  const storyData: Record<string, unknown> = {
    name,
    story_type: storyType,
    requested_by_id: actualRequesterId,
  };

  if (description) storyData.description = description;
  if (teamId) storyData.group_id = teamId;
  if (ownerIds) storyData.owner_ids = ownerIds;
  if (iterationId) storyData.iteration_id = iterationId;
  if (epicId) storyData.epic_id = epicId;
  if (workflowStateId) storyData.workflow_state_id = workflowStateId;
  if (estimate !== undefined) storyData.estimate = estimate;
  if (labels) storyData.labels = labels;

  const story = await client.post<ApiStory>("stories", storyData);
  return formatStory(story);
}

export interface UpdateStoryOptions {
  storyId: number;
  name?: string;
  description?: string;
  storyType?: string;
  teamId?: string;
  ownerIds?: string[];
  iterationId?: number;
  epicId?: number;
  workflowStateId?: number;
  estimate?: number;
  labels?: Label[];
  archived?: boolean;
}

export async function updateStory(
  options: UpdateStoryOptions,
): Promise<FormattedStory> {
  const client = new ShortcutClient();
  const {
    storyId,
    name,
    description,
    storyType,
    teamId,
    ownerIds,
    iterationId,
    epicId,
    workflowStateId,
    estimate,
    labels,
    archived,
  } = options;

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (storyType !== undefined) updateData.story_type = storyType;
  if (teamId !== undefined) updateData.group_id = teamId;
  if (ownerIds !== undefined) updateData.owner_ids = ownerIds;
  if (iterationId !== undefined) updateData.iteration_id = iterationId;
  if (epicId !== undefined) updateData.epic_id = epicId;
  if (workflowStateId !== undefined)
    updateData.workflow_state_id = workflowStateId;
  if (estimate !== undefined) updateData.estimate = estimate;
  if (labels !== undefined) updateData.labels = labels;
  if (archived !== undefined) updateData.archived = archived;

  const story = await client.put<ApiStory>(`stories/${storyId}`, updateData);
  return formatStory(story);
}

export async function deleteStory(storyId: number): Promise<DeleteResult> {
  const client = new ShortcutClient();
  await client.delete(`stories/${storyId}`);
  return { success: true, message: `Story ${storyId} deleted` };
}

export function buildStoryBranchName(
  storyId: number,
  storyName: string,
): string {
  const sanitizedName = storyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 50)
    .replace(/-+$/, "");

  return `sc-${storyId}/${sanitizedName}`;
}

export async function getStoryBranchName(
  storyId: number,
): Promise<BranchNameResult> {
  const story = await getStory(storyId);

  const branchName = buildStoryBranchName(storyId, story.name);

  return {
    story_id: storyId,
    branch_name: branchName,
    story_name: story.name,
  };
}

export async function createStoryComment(
  storyId: number,
  text: string,
): Promise<FormattedComment> {
  const client = new ShortcutClient();
  const comment = await client.post<{
    id: number;
    text: string;
    author_id: string;
    created_at: string;
    updated_at: string;
  }>(`stories/${storyId}/comments`, { text });

  return {
    id: comment.id,
    text: comment.text,
    author_id: comment.author_id,
    created_at: comment.created_at,
    updated_at: comment.updated_at,
  };
}

export function registerReadCommands(program: Command): void {
  const stories = program.command("stories").description("Story operations");

  stories
    .command("get <story-id>")
    .description("Get a story by ID")
    .action(async (storyId: string) => {
      try {
        const result = await getStory(parseInt(storyId, 10));
        output(result);
      } catch (e) {
        outputError(e);
      }
    });

  stories
    .command("search")
    .description("Search stories")
    .option("--query <query>", "Search query")
    .option("--owner-ids <ids...>", "Owner IDs")
    .option("--team-id <id>", "Team ID")
    .option("--iteration-id <id>", "Iteration ID")
    .option("--epic-id <id>", "Epic ID")
    .option("--workflow-state-id <id>", "Workflow state ID")
    .option("--story-type <type>", "Story type (feature, bug, chore)")
    .option("--limit <n>", "Result limit", "50")
    .action(async (opts) => {
      try {
        const result = await searchStories({
          query: opts.query,
          ownerIds: opts.ownerIds,
          teamId: opts.teamId,
          iterationId: opts.iterationId
            ? parseInt(opts.iterationId, 10)
            : undefined,
          epicId: opts.epicId ? parseInt(opts.epicId, 10) : undefined,
          workflowStateId: opts.workflowStateId
            ? parseInt(opts.workflowStateId, 10)
            : undefined,
          storyType: opts.storyType,
          limit: parseInt(opts.limit, 10),
        });
        output(result);
      } catch (e) {
        outputError(e);
      }
    });

  stories
    .command("branch-name <story-id>")
    .description("Get recommended branch name for a story")
    .action(async (storyId: string) => {
      try {
        const result = await getStoryBranchName(parseInt(storyId, 10));
        output(result);
      } catch (e) {
        outputError(e);
      }
    });
}

export function registerWriteCommands(program: Command): void {
  const stories = program.command("stories").description("Story operations");

  stories
    .command("create <name>")
    .description("Create a new story")
    .option("--type <type>", "Story type (feature, bug, chore)", "feature")
    .option("--description <desc>", "Story description")
    .option("--team-id <id>", "Team ID")
    .option("--owner-ids <ids...>", "Owner IDs")
    .option("--requester-id <id>", "Requester ID (defaults to current user)")
    .option("--iteration-id <id>", "Iteration ID")
    .option("--epic-id <id>", "Epic ID")
    .option("--workflow-state-id <id>", "Workflow state ID", "500004783")
    .option("--estimate <n>", "Story point estimate")
    .action(async (name: string, opts) => {
      try {
        const result = await createStory({
          name,
          storyType: opts.type,
          description: opts.description,
          teamId: opts.teamId,
          ownerIds: opts.ownerIds,
          requesterId: opts.requesterId,
          iterationId: opts.iterationId
            ? parseInt(opts.iterationId, 10)
            : undefined,
          epicId: opts.epicId ? parseInt(opts.epicId, 10) : undefined,
          workflowStateId: opts.workflowStateId
            ? parseInt(opts.workflowStateId, 10)
            : undefined,
          estimate: opts.estimate ? parseInt(opts.estimate, 10) : undefined,
        });
        output(result);
      } catch (e) {
        outputError(e);
      }
    });

  stories
    .command("create-and-checkout <name>")
    .description("Create story and checkout new git branch")
    .option("--type <type>", "Story type (feature, bug, chore)", "feature")
    .option("--description <desc>", "Story description")
    .option("--team-id <id>", "Team ID")
    .option("--owner-ids <ids...>", "Owner IDs")
    .option("--requester-id <id>", "Requester ID (defaults to current user)")
    .option("--iteration-id <id>", "Iteration ID")
    .option("--epic-id <id>", "Epic ID")
    .option("--workflow-state-id <id>", "Workflow state ID", "500004783")
    .option("--estimate <n>", "Story point estimate")
    .action(async (name: string, opts) => {
      try {
        await assertInGitRepo();

        const story = await createStory({
          name,
          storyType: opts.type,
          description: opts.description,
          teamId: opts.teamId,
          ownerIds: opts.ownerIds,
          requesterId: opts.requesterId,
          iterationId: opts.iterationId
            ? parseInt(opts.iterationId, 10)
            : undefined,
          epicId: opts.epicId ? parseInt(opts.epicId, 10) : undefined,
          workflowStateId: opts.workflowStateId
            ? parseInt(opts.workflowStateId, 10)
            : undefined,
          estimate: opts.estimate ? parseInt(opts.estimate, 10) : undefined,
        });

        const branchName = buildStoryBranchName(story.id, story.name);

        try {
          await gitSwitchCreate(branchName);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error(
            JSON.stringify(
              {
                error: message,
                story,
                branch_name: branchName,
              },
              null,
              2,
            ),
          );
          process.exit(1);
        }

        output({ story, branch_name: branchName });
      } catch (e) {
        outputError(e);
      }
    });

  stories
    .command("update <story-id>")
    .description("Update a story")
    .option("--name <name>", "Updated title")
    .option("--description <desc>", "Updated description")
    .option("--type <type>", "Story type (feature, bug, chore)")
    .option("--team-id <id>", "Team ID")
    .option("--owner-ids <ids...>", "Owner IDs")
    .option("--iteration-id <id>", "Iteration ID")
    .option("--workflow-state-id <id>", "Workflow state ID")
    .option("--archived", "Archive the story")
    .action(async (storyId: string, opts) => {
      try {
        const result = await updateStory({
          storyId: parseInt(storyId, 10),
          name: opts.name,
          description: opts.description,
          storyType: opts.type,
          teamId: opts.teamId,
          ownerIds: opts.ownerIds,
          iterationId: opts.iterationId
            ? parseInt(opts.iterationId, 10)
            : undefined,
          workflowStateId: opts.workflowStateId
            ? parseInt(opts.workflowStateId, 10)
            : undefined,
          archived: opts.archived,
        });
        output(result);
      } catch (e) {
        outputError(e);
      }
    });

  stories
    .command("delete <story-id>")
    .description("Delete a story")
    .action(async (storyId: string) => {
      try {
        const result = await deleteStory(parseInt(storyId, 10));
        output(result);
      } catch (e) {
        outputError(e);
      }
    });

  stories
    .command("comment <story-id> <text>")
    .description("Add a comment to a story")
    .action(async (storyId: string, text: string) => {
      try {
        const result = await createStoryComment(parseInt(storyId, 10), text);
        output(result);
      } catch (e) {
        outputError(e);
      }
    });
}
