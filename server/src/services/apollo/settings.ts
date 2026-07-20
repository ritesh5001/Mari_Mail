import { prisma, type ApolloSettings } from "@marimail/db";

const SETTINGS_ID = "singleton";

export async function getOrCreateApolloSettings(): Promise<ApolloSettings> {
  const existing = await prisma.apolloSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;
  return prisma.apolloSettings.create({ data: { id: SETTINGS_ID } });
}

export type SanitizedApolloSettings = Omit<ApolloSettings, "apiKey"> & { hasApiKey: boolean };

export function sanitizeApolloSettings(settings: ApolloSettings): SanitizedApolloSettings {
  const { apiKey, ...rest } = settings;
  return { ...rest, hasApiKey: Boolean(apiKey) };
}

export { SETTINGS_ID as APOLLO_SETTINGS_ID };
