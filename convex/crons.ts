import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Sweep expired guest rooms in small batches.
crons.interval("cleanup inactive guest rooms", { hours: 1 }, internal.rooms.cleanupInactiveGuestRooms, {});

// Purge Claude memories not accessed in 30 days (daily at 03:00 UTC).
crons.cron("audit stale claude memories", "0 3 * * *", internal.rooms.auditClaudeMemories, {});

// Sync changelog from GitHub every 2 minutes.
crons.interval("sync changelog from github", { minutes: 2 }, internal.changelog.syncFromGitHub, {});

export default crons;

