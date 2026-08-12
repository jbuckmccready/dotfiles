import { constants } from "node:fs";
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { SandboxEditOperations } from "./sandbox-shared.ts";

export interface Workspace {
	readText: (absolutePath: string) => Promise<string>;
	writeText: (absolutePath: string, content: string) => Promise<void>;
	deleteFile: (absolutePath: string) => Promise<void>;
	exists: (absolutePath: string) => Promise<boolean>;
	checkWriteAccess: (absolutePath: string) => Promise<void>;
	checkDeleteAccess: (absolutePath: string) => Promise<void>;
}

export function createRealWorkspace(ops?: SandboxEditOperations): Workspace {
	if (ops) {
		return {
			readText: async (absolutePath) =>
				(await ops.readFile(absolutePath)).toString("utf-8"),
			async writeText(absolutePath, content) {
				await ops.mkdir(dirname(absolutePath));
				await ops.writeFile(absolutePath, content);
			},
			deleteFile: ops.deleteFile,
			exists: ops.exists,
			checkWriteAccess: ops.checkWriteAccess,
			checkDeleteAccess: ops.checkDeleteAccess,
		};
	}

	const exists = async (absolutePath: string) => {
		try {
			await access(absolutePath, constants.F_OK);
			return true;
		} catch {
			return false;
		}
	};

	return {
		readText: (absolutePath) => readFile(absolutePath, "utf-8"),
		async writeText(absolutePath, content) {
			await mkdir(dirname(absolutePath), { recursive: true });
			await writeFile(absolutePath, content, "utf-8");
		},
		deleteFile: (absolutePath) => unlink(absolutePath),
		exists,
		async checkWriteAccess(absolutePath) {
			if (await exists(absolutePath)) {
				await access(absolutePath, constants.W_OK);
				return;
			}

			let parent = dirname(absolutePath);
			while (!(await exists(parent))) {
				const next = dirname(parent);
				if (next === parent) break;
				parent = next;
			}
			await access(parent, constants.W_OK);
		},
		async checkDeleteAccess(absolutePath) {
			let parent = dirname(absolutePath);
			while (!(await exists(parent))) {
				const next = dirname(parent);
				if (next === parent) break;
				parent = next;
			}
			await access(parent, constants.W_OK);
		},
	};
}
