import { Queue, Job } from "bullmq";
import { Redis } from "ioredis";

export type CsvImportType =
  | "MARINE_DATA_ROWS"
  | "VESSELS"
  | "SHIP_OWNER_COMPANIES"
  | "ISM_MANAGER_COMPANIES"
  | "COMMERCIAL_MANAGER_COMPANIES"
  | "CONTACTS"
  | "VESSEL_ETAS";

export type CsvImportJobData = {
  importType: CsvImportType;
  csv: string;
  mapping?: Record<string, string>;
  workspaceId: string;
  userId: string;
};

export type CsvImportJobResult = {
  created: number;
  updated?: number;
  errors: Array<{ row: number; message: string }>;
};

const QUEUE_NAME = "csv-import";
let connection: Redis | null | undefined;
let queue: Queue<CsvImportJobData, CsvImportJobResult> | null | undefined;

function getConnection() {
  if (connection !== undefined) return connection;
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    connection = null;
    return null;
  }
  connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  connection.on("error", (error) => {
    console.error(`CSV import Redis connection error: ${error.message}`);
  });
  return connection;
}

export function getCsvImportQueue() {
  if (queue !== undefined) return queue;
  const redis = getConnection();
  if (!redis) {
    queue = null;
    return null;
  }
  queue = new Queue<CsvImportJobData, CsvImportJobResult>(QUEUE_NAME, { connection: redis });
  return queue;
}

export async function enqueueCsvImport(data: CsvImportJobData) {
  const csvQueue = getCsvImportQueue();
  if (!csvQueue) return null;
  return csvQueue.add("csv-import", data, {
    attempts: 1,
    removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 },
    removeOnFail: { age: 60 * 60 * 24 * 14, count: 1000 },
  });
}

export async function getCsvImportJob(jobId: string) {
  const csvQueue = getCsvImportQueue();
  if (!csvQueue) return null;
  return Job.fromId<CsvImportJobData, CsvImportJobResult>(csvQueue, jobId);
}

