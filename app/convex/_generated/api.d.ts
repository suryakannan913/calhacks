/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as children from "../children.js";
import type * as diagnostics from "../diagnostics.js";
import type * as intake from "../intake.js";
import type * as intakeAgent from "../intakeAgent.js";
import type * as intakeTypes from "../intakeTypes.js";
import type * as matches from "../matches.js";
import type * as messages from "../messages.js";
import type * as providers from "../providers.js";
import type * as rateLimit from "../rateLimit.js";
import type * as rooms from "../rooms.js";
import type * as seed from "../seed.js";
import type * as symbols from "../symbols.js";
import type * as vocabulary from "../vocabulary.js";
import type * as voice from "../voice.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  children: typeof children;
  diagnostics: typeof diagnostics;
  intake: typeof intake;
  intakeAgent: typeof intakeAgent;
  intakeTypes: typeof intakeTypes;
  matches: typeof matches;
  messages: typeof messages;
  providers: typeof providers;
  rateLimit: typeof rateLimit;
  rooms: typeof rooms;
  seed: typeof seed;
  symbols: typeof symbols;
  vocabulary: typeof vocabulary;
  voice: typeof voice;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
};
