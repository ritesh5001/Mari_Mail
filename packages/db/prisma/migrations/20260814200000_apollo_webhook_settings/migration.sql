-- Apollo's phone-reveal callback settings move from environment variables into
-- the admin panel, next to the API key they belong with, so changing them no
-- longer needs a redeploy.

ALTER TABLE "ApolloSettings" ADD COLUMN "webhookBaseUrl" TEXT;
ALTER TABLE "ApolloSettings" ADD COLUMN "webhookSecret" JSONB;
