import { Command } from "commander";
import { registerReadCommands as registerStoriesRead } from "./entities/stories.js";
import { registerReadCommands as registerEpicsRead } from "./entities/epics.js";
import { registerReadCommands as registerIterationsRead } from "./entities/iterations.js";
import { registerReadCommands as registerTeamsRead } from "./entities/teams.js";
import { registerReadCommands as registerWorkflowsRead } from "./entities/workflows.js";
import { registerReadCommands as registerUsersRead } from "./entities/users.js";
import { registerReadCommands as registerObjectivesRead } from "./entities/objectives.js";

const program = new Command();

program
  .name("shortcut-api-read")
  .description("Read-only operations for Shortcut API")
  .version("1.0.0");

registerStoriesRead(program);
registerEpicsRead(program);
registerIterationsRead(program);
registerTeamsRead(program);
registerWorkflowsRead(program);
registerUsersRead(program);
registerObjectivesRead(program);

program.parse();
