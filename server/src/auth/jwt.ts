import jwt from "jsonwebtoken";
import { randomToken, sha256 } from "@marimail/utils";
import { prisma } from "@marimail/db";
import { deleteToken, getToken, setToken } from "../services/token-store.js";

const accessTtlSeconds = 15 * 60;
const refreshTtlSeconds = 7 * 24 * 60 * 60;

export type AccessPayload = {
  sub: string;
  workspaceId: string;
  type: "access";
};

type RefreshState = {
  userId: string;
  workspaceId: string;
  sessionId: string;
};

function secret(name: "JWT_ACCESS_SECRET" | "JWT_REFRESH_SECRET") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, secret("JWT_ACCESS_SECRET")) as AccessPayload;
}

export async function issueTokenPair(userId: string, workspaceId: string) {
  const accessToken = jwt.sign(
    { sub: userId, workspaceId, type: "access" } satisfies AccessPayload,
    secret("JWT_ACCESS_SECRET"),
    { expiresIn: accessTtlSeconds },
  );

  const refreshToken = randomToken(48);
  const refreshTokenHash = sha256(refreshToken);
  const session = await prisma.session.create({
    data: {
      sessionToken: randomToken(32),
      refreshTokenHash,
      userId,
      workspaceId,
      expires: new Date(Date.now() + refreshTtlSeconds * 1000),
    },
  });

  await setToken(
    `refresh:${refreshTokenHash}`,
    JSON.stringify({ userId, workspaceId, sessionId: session.id } satisfies RefreshState),
    refreshTtlSeconds,
  );

  return { accessToken, refreshToken };
}

/**
 * Revoke every session for a user — used after a password reset and on
 * detected refresh-token reuse. Clears both the DB sessions and the Redis
 * lookup keys so no outstanding refresh token can be redeemed.
 */
export async function revokeAllUserRefreshTokens(userId: string) {
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null },
    select: { id: true, refreshTokenHash: true },
  });
  await Promise.all(
    sessions
      .map((session) => session.refreshTokenHash)
      .filter((hash): hash is string => Boolean(hash))
      .flatMap((hash) => [deleteToken(`refresh:${hash}`), deleteToken(`refresh-used:${hash}`)]),
  );
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function rotateRefreshToken(refreshToken: string) {
  const oldHash = sha256(refreshToken);
  const raw = await getToken(`refresh:${oldHash}`);
  if (!raw) {
    // The token isn't live. If we've seen it rotated before, this is a REPLAY:
    // either the user's token was stolen and the thief is using it, or the
    // thief rotated first and the legitimate client is now replaying. We can't
    // tell which, so we assume breach and kill every session for that user —
    // the standard response for refresh-token reuse. Previously this just
    // returned null, letting a thief keep a rotating token indefinitely.
    const usedBy = await getToken(`refresh-used:${oldHash}`);
    if (usedBy) {
      try {
        const { userId } = JSON.parse(usedBy) as { userId: string };
        console.warn(`[auth] refresh-token reuse detected for user ${userId} — revoking all sessions`);
        await revokeAllUserRefreshTokens(userId);
      } catch {
        // Malformed marker — nothing safe to revoke.
      }
    }
    return null;
  }

  const state = JSON.parse(raw) as RefreshState;
  await deleteToken(`refresh:${oldHash}`);
  // Remember that this exact token was already spent, so a later replay is
  // recognisable as reuse rather than just "unknown token".
  await setToken(
    `refresh-used:${oldHash}`,
    JSON.stringify({ userId: state.userId, sessionId: state.sessionId }),
    refreshTtlSeconds,
  );

  const nextRefreshToken = randomToken(48);
  const nextRefreshTokenHash = sha256(nextRefreshToken);
  await prisma.session.update({
    where: { id: state.sessionId },
    data: {
      refreshTokenHash: nextRefreshTokenHash,
      expires: new Date(Date.now() + refreshTtlSeconds * 1000),
    },
  });

  await setToken(`refresh:${nextRefreshTokenHash}`, JSON.stringify(state), refreshTtlSeconds);

  const accessToken = jwt.sign(
    { sub: state.userId, workspaceId: state.workspaceId, type: "access" } satisfies AccessPayload,
    secret("JWT_ACCESS_SECRET"),
    { expiresIn: accessTtlSeconds },
  );

  return { accessToken, refreshToken: nextRefreshToken, state };
}

export async function revokeRefreshToken(refreshToken: string) {
  const refreshTokenHash = sha256(refreshToken);
  await deleteToken(`refresh:${refreshTokenHash}`);
  await prisma.session.updateMany({
    where: { refreshTokenHash },
    data: { revokedAt: new Date() },
  });
}
