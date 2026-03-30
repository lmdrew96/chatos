import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Sweep expired guest rooms in small batches.
crons.interval("cleanup inactive guest rooms", { hours: 1 }, internal.rooms.cleanupInactiveGuestRooms, {});

export default crons;

