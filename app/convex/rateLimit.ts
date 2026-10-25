import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  sendSymbols: { kind: "token bucket", rate: 20, period: MINUTE, capacity: 8 },
  confirm: { kind: "token bucket", rate: 20, period: MINUTE, capacity: 8 },
  intakeTurn: { kind: "token bucket", rate: 6, period: MINUTE, capacity: 4 },
});
