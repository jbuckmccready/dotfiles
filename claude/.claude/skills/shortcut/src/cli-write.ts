import { Command } from "commander";
import { registerWriteCommands as registerStoriesWrite } from "./entities/stories.js";
import { registerWriteCommands as registerEpicsWrite } from "./entities/epics.js";
import { registerWriteCommands as registerIterationsWrite } from "./entities/iterations.js";
import { registerWriteCommands as registerObjectivesWrite } from "./entities/objectives.js";
import { registerWriteCommands as registerDocumentsWrite } from "./entities/documents.js";

const program = new Command();

program
  .name("shortcut-api-write")
  .description("Write operations for Shortcut API")
  .version("1.0.0");

registerStoriesWrite(program);
registerEpicsWrite(program);
registerIterationsWrite(program);
registerObjectivesWrite(program);
registerDocumentsWrite(program);

program.parse();
