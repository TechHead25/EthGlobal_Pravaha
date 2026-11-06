/**
 * @file config.ts
 * @notice Centralized configuration for World ID verification in OpenAid Protocol.
 *         Maintains clear boundaries: public client app IDs can be shared, but server-side
 *         endpoints and options remain strictly managed.
 */

import { WorldIdVerificationLevel } from "./types";

export interface WorldIdConfig {
  appId: `app_${string}` | string;
  action: string;
  apiBaseUrl: string;
  timeoutMs: number;
  minimumLevel: WorldIdVerificationLevel;
}

export function getWorldIdConfig(overrides?: Partial<WorldIdConfig>): WorldIdConfig {
  const appId = (
    overrides?.appId ??
    process.env.WORLD_ID_APP_ID ??
    process.env.NEXT_PUBLIC_WORLD_ID_APP_ID ??
    ""
  ).trim();

  const action = (
    overrides?.action ??
    process.env.WORLD_ID_ACTION ??
    process.env.NEXT_PUBLIC_WORLD_ID_ACTION ??
    "verify-human-reviewer"
  ).trim();

  const apiBaseUrl = (
    overrides?.apiBaseUrl ??
    process.env.WORLD_ID_API_URL ??
    "https://developer.worldcoin.org/api/v2/verify"
  ).trim();

  const envTimeout = process.env.WORLD_ID_REQUEST_TIMEOUT_MS;
  const parsedTimeout = envTimeout ? parseInt(envTimeout, 10) : 8000;
  const timeoutMs =
    overrides?.timeoutMs ??
    (isNaN(parsedTimeout) || parsedTimeout <= 0 ? 8000 : parsedTimeout);

  const envLevel = process.env.WORLD_ID_MINIMUM_LEVEL;
  const minimumLevel = (
    overrides?.minimumLevel ??
    (envLevel === "device" ? "device" : "orb")
  ) as WorldIdVerificationLevel;

  return {
    appId,
    action,
    apiBaseUrl,
    timeoutMs,
    minimumLevel,
  };
}

/**
 * Checks whether the World ID App ID is configured with a live or testnet credential,
 * rather than an unconfigured empty string or placeholder.
 */
export function isWorldIdConfigured(config: WorldIdConfig): boolean {
  if (!config.appId) return false;
  if (config.appId === "app_staging_placeholder") return false;
  return config.appId.startsWith("app_");
}
