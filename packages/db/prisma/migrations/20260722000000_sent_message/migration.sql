-- Persist the exact rendered mail per (campaignContact, step) so the campaign
-- detail page can show the message that actually went out, byte-for-byte.

CREATE TABLE IF NOT EXISTS "SentMessage" (
  "id"                TEXT PRIMARY KEY,
  "workspaceId"       TEXT NOT NULL,
  "campaignId"        TEXT NOT NULL,
  "campaignContactId" TEXT NOT NULL,
  "sequenceId"        TEXT,
  "stepOrder"         INTEGER NOT NULL,
  "contactId"         TEXT NOT NULL,
  "inboxId"           TEXT,
  "messageId"         TEXT,
  "fromAddress"       TEXT NOT NULL,
  "toAddress"         TEXT NOT NULL,
  "replyTo"           TEXT,
  "subject"           TEXT NOT NULL,
  "bodyHtml"          TEXT NOT NULL,
  "bodyText"          TEXT NOT NULL,
  "variant"           TEXT NOT NULL DEFAULT 'A',
  "sentAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SentMessage_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SentMessage_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SentMessage_campaignContactId_fkey"
    FOREIGN KEY ("campaignContactId") REFERENCES "CampaignContact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SentMessage_sequenceId_fkey"
    FOREIGN KEY ("sequenceId") REFERENCES "CampaignSequence"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "SentMessage_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SentMessage_campaignContactId_stepOrder_key"
  ON "SentMessage" ("campaignContactId", "stepOrder");

CREATE INDEX IF NOT EXISTS "SentMessage_workspaceId_idx"      ON "SentMessage" ("workspaceId");
CREATE INDEX IF NOT EXISTS "SentMessage_campaignId_idx"       ON "SentMessage" ("campaignId");
CREATE INDEX IF NOT EXISTS "SentMessage_contactId_idx"        ON "SentMessage" ("contactId");
CREATE INDEX IF NOT EXISTS "SentMessage_sentAt_idx"           ON "SentMessage" ("sentAt");
CREATE INDEX IF NOT EXISTS "SentMessage_campaignId_sentAt_idx" ON "SentMessage" ("campaignId", "sentAt");
