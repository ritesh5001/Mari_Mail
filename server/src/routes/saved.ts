import { Router } from "express";
import { z } from "zod";
import { prisma } from "@marimail/db";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { sendData, sendError } from "../lib/http.js";
import { workspaceScope } from "../services/workspace-scope.js";
import { serializeContact } from "../services/serializers.js";

export const savedRouter = Router();

// Full saved contacts for the current user (private to them).
savedRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const saved = await prisma.savedContact.findMany({
      where: { userId, workspaceId },
      include: { contact: true },
      orderBy: { createdAt: "desc" },
    });
    return sendData(res, { contacts: saved.map((s) => serializeContact(s.contact)) });
  } catch (error) {
    return next(error);
  }
});

// Lightweight id list for hydrating the star/bookmark state in tables.
savedRouter.get("/ids", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const saved = await prisma.savedContact.findMany({
      where: { userId, workspaceId },
      select: { contactId: true },
    });
    return sendData(res, { contactIds: saved.map((s) => s.contactId) });
  } catch (error) {
    return next(error);
  }
});

savedRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const input = z.object({ contactId: z.string().min(1) }).safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }
    const { workspaceId, userId } = (req as AuthedRequest).auth;

    const contact = await prisma.contact.findFirst({
      where: { id: input.data.contactId, ...workspaceScope(workspaceId) },
      select: { id: true },
    });
    if (!contact) {
      return sendError(res, 404, "CONTACT_NOT_FOUND", "Contact not found");
    }

    const saved = await prisma.savedContact.upsert({
      where: { userId_contactId: { userId, contactId: contact.id } },
      update: {},
      create: { userId, workspaceId, contactId: contact.id },
    });
    return sendData(res, { saved: true, id: saved.id }, 201);
  } catch (error) {
    return next(error);
  }
});

savedRouter.delete("/:contactId", requireAuth, async (req, res, next) => {
  try {
    const { userId } = (req as AuthedRequest).auth;
    await prisma.savedContact.deleteMany({
      where: { userId, contactId: req.params.contactId },
    });
    return sendData(res, { removed: true });
  } catch (error) {
    return next(error);
  }
});
