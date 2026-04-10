/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apiKeys from "../apiKeys.js";
import type * as changelog from "../changelog.js";
import type * as claudiuConfig from "../claudiuConfig.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as friends from "../friends.js";
import type * as gifs from "../gifs.js";
import type * as invites from "../invites.js";
import type * as messages from "../messages.js";
import type * as pushNotifications from "../pushNotifications.js";
import type * as pushNotificationsHelpers from "../pushNotificationsHelpers.js";
import type * as pushSubscriptions from "../pushSubscriptions.js";
import type * as reactions from "../reactions.js";
import type * as rooms from "../rooms.js";
import type * as typing from "../typing.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apiKeys: typeof apiKeys;
  changelog: typeof changelog;
  claudiuConfig: typeof claudiuConfig;
  crons: typeof crons;
  dashboard: typeof dashboard;
  friends: typeof friends;
  gifs: typeof gifs;
  invites: typeof invites;
  messages: typeof messages;
  pushNotifications: typeof pushNotifications;
  pushNotificationsHelpers: typeof pushNotificationsHelpers;
  pushSubscriptions: typeof pushSubscriptions;
  reactions: typeof reactions;
  rooms: typeof rooms;
  typing: typeof typing;
  users: typeof users;
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

export declare const components: {};
