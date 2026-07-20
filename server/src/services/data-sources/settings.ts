import { prisma, type DataSourceSettings } from "@marimail/db";

const SETTINGS_ID = "singleton";

export async function getOrCreateDataSourceSettings(): Promise<DataSourceSettings> {
  const existing = await prisma.dataSourceSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;
  return prisma.dataSourceSettings.create({ data: { id: SETTINGS_ID } });
}

export { SETTINGS_ID as DATA_SOURCE_SETTINGS_ID };
