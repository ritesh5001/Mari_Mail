import { prisma } from "@marimail/db";

const SETTINGS_ID = "singleton";

export async function getOrCreateMaribizSettings() {
  const existing = await prisma.maribizSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;
  return prisma.maribizSettings.create({ data: { id: SETTINGS_ID } });
}

export { SETTINGS_ID as MARIBIZ_SETTINGS_ID };
