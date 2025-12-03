import type {
  ApiMember,
  ApiStory,
  ApiEpic,
  ApiIteration,
  ApiTeam,
  ApiWorkflow,
  ApiObjective,
  FormattedMember,
  FormattedStory,
  FormattedEpic,
  FormattedIteration,
  FormattedTeam,
  FormattedWorkflow,
  FormattedObjective,
} from "./types.js";

const BASE_URL = "https://api.app.shortcut.com/api/v3";

export class ShortcutClient {
  private apiToken: string;
  private headers: Record<string, string>;

  constructor(apiToken?: string) {
    this.apiToken = apiToken || process.env.SHORTCUT_API_TOKEN || "";
    if (!this.apiToken) {
      throw new Error("SHORTCUT_API_TOKEN environment variable must be set");
    }
    this.headers = {
      "Content-Type": "application/json",
      "Shortcut-Token": this.apiToken,
    };
  }

  private async request<T>(
    method: string,
    endpoint: string,
    data?: Record<string, unknown>,
    params?: Record<string, string | number>,
  ): Promise<T> {
    let url = `${BASE_URL}/${endpoint}`;

    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        searchParams.append(key, String(value));
      }
      url = `${url}?${searchParams.toString()}`;
    }

    const options: RequestInit = {
      method,
      headers: this.headers,
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      let errorMsg = `API request failed: ${response.status} ${response.statusText}`;
      try {
        const errorBody = await response.text();
        try {
          const errorDetail = JSON.parse(errorBody);
          errorMsg = `${errorMsg}\nDetails: ${JSON.stringify(errorDetail, null, 2)}`;
        } catch {
          errorMsg = `${errorMsg}\nResponse: ${errorBody}`;
        }
      } catch {
        // Could not read error body
      }
      throw new Error(errorMsg);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  async get<T>(
    endpoint: string,
    params?: Record<string, string | number>,
  ): Promise<T> {
    return this.request<T>("GET", endpoint, undefined, params);
  }

  async post<T>(endpoint: string, data: Record<string, unknown>): Promise<T> {
    return this.request<T>("POST", endpoint, data);
  }

  async put<T>(endpoint: string, data: Record<string, unknown>): Promise<T> {
    return this.request<T>("PUT", endpoint, data);
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>("DELETE", endpoint);
  }
}

let cachedCurrentUserId: string | undefined;

export async function getCurrentUser(
  client?: ShortcutClient,
): Promise<FormattedMember> {
  const c = client || new ShortcutClient();

  const envUserId = process.env.SHORTCUT_CURRENT_USER_ID;
  if (envUserId || cachedCurrentUserId) {
    const userId = envUserId || cachedCurrentUserId;
    const user = await c.get<ApiMember>(`members/${userId}`);
    return formatMember(user);
  }

  const user = await c.get<ApiMember>("member");
  cachedCurrentUserId = user.id;

  return formatMember(user);
}

export function formatMember(member: ApiMember): FormattedMember {
  if (member.name !== undefined) {
    return {
      id: member.id,
      name: member.name || "Unknown",
      email: member.email,
      mention_name: member.mention_name,
    };
  }

  return {
    id: member.id,
    name: member.profile?.name || "Unknown",
    email: member.profile?.email_address,
    mention_name: member.profile?.mention_name,
  };
}

export function formatStory(story: ApiStory): FormattedStory {
  return {
    id: story.id,
    name: story.name,
    description: story.description || "",
    story_type: story.story_type,
    workflow_state_id: story.workflow_state_id,
    app_url: story.app_url,
    created_at: story.created_at,
    updated_at: story.updated_at,
    completed: story.completed || false,
    owner_ids: story.owner_ids || [],
    requester_id: story.requested_by_id,
    iteration_id: story.iteration_id,
    epic_id: story.epic_id,
    estimate: story.estimate,
    labels: (story.labels || []).map((l) => ({ id: l.id, name: l.name })),
    team_id: story.group_id,
  };
}

export function formatEpic(epic: ApiEpic): FormattedEpic {
  return {
    id: epic.id,
    name: epic.name,
    description: epic.description || "",
    state: epic.state || "",
    app_url: epic.app_url,
    created_at: epic.created_at,
    updated_at: epic.updated_at,
    completed: epic.completed || false,
    owner_ids: epic.owner_ids || [],
    milestone_id: epic.milestone_id,
    labels: (epic.labels || []).map((l) => ({ id: l.id, name: l.name })),
  };
}

export function formatIteration(
  iteration: ApiIteration,
  includeStats = true,
): FormattedIteration {
  const formatted: FormattedIteration = {
    id: iteration.id,
    name: iteration.name,
    description: iteration.description || "",
    start_date: iteration.start_date,
    end_date: iteration.end_date,
    status: iteration.status,
    app_url: iteration.app_url,
    created_at: iteration.created_at,
    updated_at: iteration.updated_at,
    team_ids: iteration.group_ids || [],
  };

  if (includeStats) {
    formatted.stats = iteration.stats || {};
  }

  return formatted;
}

export function formatTeam(team: ApiTeam): FormattedTeam {
  return {
    id: team.id,
    name: team.name,
    mention_name: team.mention_name,
    description: team.description || "",
    app_url: team.app_url,
    num_members: (team.member_ids || []).length,
    workflow_ids: team.workflow_ids || [],
  };
}

export function formatWorkflow(workflow: ApiWorkflow): FormattedWorkflow {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description || "",
    team_id: workflow.team_id,
    created_at: workflow.created_at,
    updated_at: workflow.updated_at,
    states: (workflow.states || []).map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      position: s.position || 0,
    })),
  };
}

export function formatObjective(objective: ApiObjective): FormattedObjective {
  return {
    id: objective.id,
    name: objective.name,
    description: objective.description || "",
    state: objective.state || "",
    app_url: objective.app_url,
    created_at: objective.created_at,
    updated_at: objective.updated_at,
    completed: objective.completed || false,
  };
}

export function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function outputError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ error: message }, null, 2));
  process.exit(1);
}
