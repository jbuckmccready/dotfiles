import type { Plugin } from "@opencode-ai/plugin";
import type { EventSessionStatus } from "@opencode-ai/sdk";

const NOTIFY_SCRIPT = "~/.claude/hooks/notify.sh";
const DELAY_MS = 15_000; // 15 seconds

export const NotificationPlugin: Plugin = async ({ $ }) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const clearPendingTimeout = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  const scheduleNotification = (message: string) => {
    clearPendingTimeout();
    timeout = setTimeout(async () => {
      await $`echo '{"message": "${message}"}' | ${NOTIFY_SCRIPT}`
        .quiet()
        .nothrow();
      timeout = null;
    }, DELAY_MS);
  };

  return {
    event: async ({ event }) => {
      // Cancel when session becomes busy (user sent a message)
      if (
        event.type === "session.status" &&
        (event as EventSessionStatus).properties.status.type === "busy"
      ) {
        clearPendingTimeout();
        return;
      }

      // Schedule delayed notification on idle or permission request
      if (event.type === "session.idle") {
        scheduleNotification("OpenCode finished");
      } else if (event.type === "permission.updated") {
        scheduleNotification("OpenCode awaiting permission");
      }
    },
  };
};
