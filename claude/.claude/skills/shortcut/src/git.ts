export interface CommandOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCommand(
  command: string,
  args: string[],
): Promise<CommandOutput> {
  const proc = Bun.spawn([command, ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;

  return {
    stdout: stdout.trimEnd(),
    stderr: stderr.trimEnd(),
    exitCode,
  };
}

export async function assertInGitRepo(): Promise<void> {
  const result = await runCommand("git", ["rev-parse", "--is-inside-work-tree"]);
  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr || "git rev-parse failed (are you in a git repo?)",
    );
  }

  if (result.stdout !== "true") {
    throw new Error("Not inside a git work tree");
  }
}

export async function gitSwitchCreate(branchName: string): Promise<void> {
  const result = await runCommand("git", ["switch", "-c", branchName]);
  if (result.exitCode !== 0) {
    const message = result.stderr || result.stdout || "git switch failed";
    throw new Error(message);
  }
}
