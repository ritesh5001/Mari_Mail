-- Phone reveals are priced at 20 credits: a phone number costs the provider
-- far more than an email and is worth more to the user. Existing deployments
-- are moved off the old 1-credit price, which was the email price by default
-- rather than a deliberate choice.

ALTER TABLE "ApolloSettings" ALTER COLUMN "creditsPerPhoneReveal" SET DEFAULT 20;

UPDATE "ApolloSettings" SET "creditsPerPhoneReveal" = 20 WHERE "creditsPerPhoneReveal" = 1;
