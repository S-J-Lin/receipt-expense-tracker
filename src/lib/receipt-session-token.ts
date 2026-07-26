import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

function cookieName(sessionId: string) {
  return `receipt_session_${sessionId}`;
}

export function createReceiptSessionToken() {
  return randomBytes(32).toString("hex");
}

export function hashReceiptSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function setReceiptSessionCookie(sessionId: string, token: string) {
  (await cookies()).set(cookieName(sessionId), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/receipts",
    maxAge: 60 * 60 * 24,
  });
}

export async function getReceiptSessionToken(sessionId: string) {
  const token = (await cookies()).get(cookieName(sessionId))?.value;
  return token && TOKEN_PATTERN.test(token) ? token : null;
}

export async function clearReceiptSessionCookie(sessionId: string) {
  (await cookies()).delete(cookieName(sessionId));
}
