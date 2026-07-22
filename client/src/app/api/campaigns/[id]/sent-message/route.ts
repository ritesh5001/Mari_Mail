import { NextResponse } from "next/server";
import { prisma } from "@marimail/db";
import { getServerSession } from "@/lib/api";

export const dynamic = "force-dynamic";

export type SentMessagePayload = {
  id: string;
  subject: string;
  fromAddress: string;
  toAddress: string;
  replyTo: string | null;
  bodyHtml: string;
  bodyText: string;
  variant: string;
  sentAt: string;
  messageId: string | null;
  stepOrder: number;
  inbox: { id: string; email: string; fromEmail: string | null } | null;
};

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession();
  if (!session?.activeWorkspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const contactId = url.searchParams.get("contactId");
  const stepOrderRaw = url.searchParams.get("stepOrder");
  const stepOrder = stepOrderRaw ? Number(stepOrderRaw) : NaN;
  if (!contactId || !Number.isFinite(stepOrder)) {
    return NextResponse.json(
      { error: "contactId and stepOrder are required" },
      { status: 400 },
    );
  }

  // Scope by workspace via the campaign row so a workspace can only read its
  // own sent mail. The (campaignContactId, stepOrder) unique lets us find the
  // row by (campaignId, contactId, stepOrder) with a single scoped query.
  const message = await prisma.sentMessage.findFirst({
    where: {
      campaignId: params.id,
      contactId,
      stepOrder,
      campaign: { workspaceId: session.activeWorkspace.id },
    },
    orderBy: { sentAt: "desc" },
  });
  if (!message) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const inbox = message.inboxId
    ? await prisma.emailAccount.findUnique({
        where: { id: message.inboxId },
        select: { id: true, email: true, fromEmail: true },
      })
    : null;

  const payload: SentMessagePayload = {
    id: message.id,
    subject: message.subject,
    fromAddress: message.fromAddress,
    toAddress: message.toAddress,
    replyTo: message.replyTo,
    bodyHtml: message.bodyHtml,
    bodyText: message.bodyText,
    variant: message.variant,
    sentAt: message.sentAt.toISOString(),
    messageId: message.messageId,
    stepOrder: message.stepOrder,
    inbox,
  };
  return NextResponse.json(payload);
}
