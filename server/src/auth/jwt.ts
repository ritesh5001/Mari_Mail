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

export async function rotateRefreshToken(refreshToken: string) {
  const oldHash = sha256(refreshToken);
  const raw = await getToken(`refresh:${oldHash}`);
  if (!raw) {
    return null;
  }

  const state = JSON.parse(raw) as RefreshState;
  await deleteToken(`refresh:${oldHash}`);

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
