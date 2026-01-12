import { describe, test, expect } from "bun:test";
import { buildStoryBranchName } from "../src/entities/stories.js";

describe("buildStoryBranchName", () => {
  test("converts basic story name to branch format", () => {
    expect(buildStoryBranchName(123, "Add login feature")).toBe(
      "sc-123/add-login-feature",
    );
  });

  test("converts to lowercase", () => {
    expect(buildStoryBranchName(1, "UPPERCASE NAME")).toBe(
      "sc-1/uppercase-name",
    );
  });

  test("replaces multiple spaces with single dash", () => {
    expect(buildStoryBranchName(1, "hello    world")).toBe("sc-1/hello-world");
  });

  test("replaces multiple special characters with single dash", () => {
    expect(buildStoryBranchName(1, "hello---world")).toBe("sc-1/hello-world");
    expect(buildStoryBranchName(1, "hello...world")).toBe("sc-1/hello-world");
    expect(buildStoryBranchName(1, "hello@#$world")).toBe("sc-1/hello-world");
  });

  test("strips leading special characters", () => {
    expect(buildStoryBranchName(1, "---hello")).toBe("sc-1/hello");
    expect(buildStoryBranchName(1, "   hello")).toBe("sc-1/hello");
  });

  test("strips trailing special characters", () => {
    expect(buildStoryBranchName(1, "hello---")).toBe("sc-1/hello");
    expect(buildStoryBranchName(1, "hello   ")).toBe("sc-1/hello");
  });

  test("truncates to 50 characters", () => {
    const longName = "a".repeat(100);
    const result = buildStoryBranchName(1, longName);
    expect(result).toBe(`sc-1/${"a".repeat(50)}`);
  });

  test("strips trailing dash after truncation", () => {
    // Create a name that will have a dash at position 50 after processing
    // "word-" is 5 chars, so 10 repetitions = 50 chars ending in dash
    const name = "word ".repeat(10).trim(); // "word word word..."
    const result = buildStoryBranchName(1, name);
    expect(result.endsWith("-")).toBe(false);
  });

  test("handles name that truncates mid-word with trailing dash", () => {
    // 50 chars that end exactly on a dash boundary
    const name = "this-is-a-test-name-that-is-exactly-fifty-chars-xx";
    expect(name.length).toBe(50);
    const padded = name + "-extra";
    const result = buildStoryBranchName(1, padded);
    expect(result.endsWith("-")).toBe(false);
  });

  test("handles empty string", () => {
    expect(buildStoryBranchName(1, "")).toBe("sc-1/");
  });

  test("handles string with only special characters", () => {
    expect(buildStoryBranchName(1, "!@#$%")).toBe("sc-1/");
  });

  test("preserves numbers", () => {
    expect(buildStoryBranchName(1, "version 2.0 release")).toBe(
      "sc-1/version-2-0-release",
    );
  });
});
