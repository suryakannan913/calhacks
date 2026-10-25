import { defineApp } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import { v } from "convex/values";
import agent from "@convex-dev/agent/convex.config";

const app = defineApp({ env: {
  ANTHROPIC_API_KEY: v.optional(v.string()),
  CARTESIA_API_KEY: v.optional(v.string()),
  ANTHROPIC_FAST_MODEL: v.optional(v.string()),
  ANTHROPIC_MATCH_MODEL: v.optional(v.string()),
  CARTESIA_MODEL_ID: v.optional(v.string()),
  CARTESIA_VERSION: v.optional(v.string()),
} });
app.use(rateLimiter);
app.use(agent);
export default app;
