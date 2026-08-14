import { prisma, type ApolloSettings } from "@marimail/db";

const SETTINGS_ID = "singleton";

export async function getOrCreateApolloSettings(): Promise<ApolloSettings> {
  const existing = await prisma.apolloSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;
  return prisma.apolloSettings.create({ data: { id: SETTINGS_ID } });
}

export type SanitizedApolloSettings = Omit<ApolloSettings, "apiKey" | "webhookSecret"> & {
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
};

/**
 * Strips every secret before the settings leave the server. Both are reported
 * as a boolean instead: the admin UI needs to know whether one is SET (to show
 * "configured" and to leave the field blank rather than wiping it on save), and
 * never needs the value back.
 */
export function sanitizeApolloSettings(settings: ApolloSettings): SanitizedApolloSettings {
  const { apiKey, webhookSecret, ...rest } = settings;
  return { ...rest, hasApiKey: Boolean(apiKey), hasWebhookSecret: Boolean(webhookSecret) };
}

export { SETTINGS_ID as APOLLO_SETTINGS_ID };
