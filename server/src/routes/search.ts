import { Router } from "express";
import { Prisma, prisma } from "@marimail/db";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { sendData } from "../lib/http.js";

export const searchRouter = Router();

type SearchHit = {
  id: string;
  type: "VESSEL" | "CONTACT" | "SHIP_OWNER" | "ISM_MANAGER" | "COMMERCIAL_MANAGER";
  title: string;
  subtitle: string | null;
  href: string;
  rank: number;
};

searchRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < 2) {
      return sendData(res, { hits: [] });
    }

    const { workspaceId } = (req as AuthedRequest).auth;
    const query = q
      .split(/\s+/)
      .map((part) => `${part}:*`)
      .join(" & ");

    const [vessels, contacts, shipOwners, ismManagers, commercialManagers] = await Promise.all([
      prisma.$queryRaw<SearchHit[]>`
        SELECT "id",
               'VESSEL'::text AS "type",
               "vesselName" AS "title",
               ('IMO ' || "imoNumber") AS "subtitle",
               ('/dashboard/vessels/' || "imoNumber") AS "href",
               ts_rank("searchVector", to_tsquery('simple', ${query})) AS "rank"
        FROM "Vessel"
        WHERE ("workspaceId" = ${workspaceId} OR "workspaceId" IS NULL)
          AND "searchVector" @@ to_tsquery('simple', ${query})
        ORDER BY "rank" DESC
        LIMIT 10
      `,
      prisma.$queryRaw<SearchHit[]>`
        SELECT "id",
               'CONTACT'::text AS "type",
               ("firstName" || ' ' || "lastName") AS "title",
               ("email" || ' · ' || "companyName") AS "subtitle",
               ('/dashboard/contacts/' || "id") AS "href",
               ts_rank("searchVector", to_tsquery('simple', ${query})) AS "rank"
        FROM "Contact"
        WHERE ("workspaceId" = ${workspaceId} OR "workspaceId" IS NULL)
          AND "searchVector" @@ to_tsquery('simple', ${query})
        ORDER BY "rank" DESC
        LIMIT 10
      `,
      prisma.$queryRaw<SearchHit[]>`
        SELECT "id",
               'SHIP_OWNER'::text AS "type",
               "companyName" AS "title",
               "country" AS "subtitle",
               ('/dashboard/companies/ship-owners/' || "id") AS "href",
               ts_rank("searchVector", to_tsquery('simple', ${query})) AS "rank"
        FROM "ShipOwnerCompany"
        WHERE ("workspaceId" = ${workspaceId} OR "workspaceId" IS NULL)
          AND "searchVector" @@ to_tsquery('simple', ${query})
        ORDER BY "rank" DESC
        LIMIT 10
      `,
      prisma.$queryRaw<SearchHit[]>`
        SELECT "id",
               'ISM_MANAGER'::text AS "type",
               "companyName" AS "title",
               "country" AS "subtitle",
               ('/dashboard/companies/ism-managers/' || "id") AS "href",
               ts_rank("searchVector", to_tsquery('simple', ${query})) AS "rank"
        FROM "ISMManagerCompany"
        WHERE ("workspaceId" = ${workspaceId} OR "workspaceId" IS NULL)
          AND "searchVector" @@ to_tsquery('simple', ${query})
        ORDER BY "rank" DESC
        LIMIT 10
      `,
      prisma.$queryRaw<SearchHit[]>`
        SELECT "id",
               'COMMERCIAL_MANAGER'::text AS "type",
               "companyName" AS "title",
               "country" AS "subtitle",
               ('/dashboard/companies/commercial-managers/' || "id") AS "href",
               ts_rank("searchVector", to_tsquery('simple', ${query})) AS "rank"
        FROM "CommercialManagerCompany"
        WHERE ("workspaceId" = ${workspaceId} OR "workspaceId" IS NULL)
          AND "searchVector" @@ to_tsquery('simple', ${query})
        ORDER BY "rank" DESC
        LIMIT 10
      `,
    ]);

    const hits = [...vessels, ...contacts, ...shipOwners, ...ismManagers, ...commercialManagers]
      .sort((left, right) => right.rank - left.rank)
      .slice(0, 20);

    return sendData(res, { hits });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return next(error);
    }
    return next(error);
  }
});
