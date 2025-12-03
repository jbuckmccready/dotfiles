export interface Label {
  id: number;
  name: string;
}

export interface WorkflowState {
  id: number;
  name: string;
  type: string;
  position: number;
}

export interface FormattedMember {
  id: string;
  name: string;
  email?: string;
  mention_name?: string;
}

export interface FormattedStory {
  id: number;
  name: string;
  description: string;
  story_type: string;
  workflow_state_id: number;
  app_url: string;
  created_at: string;
  updated_at: string;
  completed: boolean;
  owner_ids: string[];
  requester_id?: string;
  iteration_id?: number;
  epic_id?: number;
  estimate?: number;
  labels: Label[];
  team_id?: string;
}

export interface FormattedEpic {
  id: number;
  name: string;
  description: string;
  state: string;
  app_url: string;
  created_at: string;
  updated_at: string;
  completed: boolean;
  owner_ids: string[];
  milestone_id?: number;
  labels: Label[];
}

export interface FormattedIteration {
  id: number;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  status: string;
  app_url: string;
  created_at: string;
  updated_at: string;
  team_ids: string[];
  stats?: Record<string, unknown>;
}

export interface FormattedTeam {
  id: string;
  name: string;
  mention_name?: string;
  description: string;
  app_url: string;
  num_members: number;
  workflow_ids: number[];
}

export interface FormattedWorkflow {
  id: number;
  name: string;
  description: string;
  team_id?: string;
  created_at: string;
  updated_at: string;
  states: WorkflowState[];
}

export interface FormattedObjective {
  id: string;
  name: string;
  description: string;
  state: string;
  app_url: string;
  created_at: string;
  updated_at: string;
  completed: boolean;
}

export interface FormattedDocument {
  id: string;
  name: string;
  app_url: string;
  created_at: string;
}

export interface FormattedComment {
  id: number;
  text: string;
  author_id: string;
  created_at: string;
  updated_at: string;
}

export interface BranchNameResult {
  story_id: number;
  branch_name: string;
  story_name: string;
}

export interface DeleteResult {
  success: boolean;
  message: string;
}

export interface ApiMember {
  id: string;
  name?: string;
  email?: string;
  mention_name?: string;
  profile?: {
    name?: string;
    email_address?: string;
    mention_name?: string;
  };
}

export interface ApiStory {
  id: number;
  name: string;
  description?: string;
  story_type: string;
  workflow_state_id: number;
  app_url: string;
  created_at: string;
  updated_at: string;
  completed?: boolean;
  owner_ids?: string[];
  requested_by_id?: string;
  iteration_id?: number;
  epic_id?: number;
  estimate?: number;
  labels?: Array<{ id: number; name: string }>;
  group_id?: string;
}

export interface ApiEpic {
  id: number;
  name: string;
  description?: string;
  state?: string;
  app_url: string;
  created_at: string;
  updated_at: string;
  completed?: boolean;
  owner_ids?: string[];
  milestone_id?: number;
  labels?: Array<{ id: number; name: string }>;
}

export interface ApiIteration {
  id: number;
  name: string;
  description?: string;
  start_date: string;
  end_date: string;
  status: string;
  app_url: string;
  created_at: string;
  updated_at: string;
  group_ids?: string[];
  stats?: Record<string, unknown>;
}

export interface ApiTeam {
  id: string;
  name: string;
  mention_name?: string;
  description?: string;
  app_url: string;
  member_ids?: string[];
  workflow_ids?: number[];
}

export interface ApiWorkflow {
  id: number;
  name: string;
  description?: string;
  team_id?: string;
  created_at: string;
  updated_at: string;
  states?: Array<{
    id: number;
    name: string;
    type: string;
    position?: number;
  }>;
}

export interface ApiObjective {
  id: string;
  name: string;
  description?: string;
  state?: string;
  app_url: string;
  created_at: string;
  updated_at: string;
  completed?: boolean;
}

export interface ApiDocument {
  id: string;
  name: string;
  app_url: string;
  created_at: string;
}

export interface ApiComment {
  id: number;
  text: string;
  author_id: string;
  created_at: string;
  updated_at: string;
}
