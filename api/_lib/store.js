import { kv } from "@vercel/kv";
import { randomBytes } from "node:crypto";

/*
 * Keyspace
 *
 *   subscriber:{email}     → hash  { email, status, createdAt, confirmedAt, unsubscribeToken, unsubscribedAt }
 *   token:confirm:{token}  → string email  (TTL: 24h)
 *   token:unsub:{token}    → string email  (no TTL — unsubscribe links must work forever)
 *   list:confirmed         → set of emails  (fast iteration for broadcasts)
 *
 * status ∈ { "pending" | "confirmed" | "unsubscribed" }
 */

export function newToken() {
  return randomBytes(24).toString("hex"); // 48-char hex
}

export async function getSubscriber(email) {
  return kv.hgetall(`subscriber:${email}`);
}

export async function createPendingSubscriber(email) {
  const confirmToken = newToken();
  const now = Date.now();

  await kv.hset(`subscriber:${email}`, {
    email,
    status: "pending",
    createdAt: now,
  });

  // Confirm tokens expire in 24h.
  await kv.set(`token:confirm:${confirmToken}`, email, { ex: 60 * 60 * 24 });

  return confirmToken;
}

export async function resendConfirmation(email) {
  // Overwrite any prior confirm token so old links invalidate.
  const confirmToken = newToken();
  await kv.set(`token:confirm:${confirmToken}`, email, { ex: 60 * 60 * 24 });
  return confirmToken;
}

export async function confirmSubscriber(token) {
  const email = await kv.get(`token:confirm:${token}`);
  if (!email) return null;

  const existing = await kv.hgetall(`subscriber:${email}`);
  if (!existing || !existing.email) return null;

  // Idempotent: if already confirmed, return existing unsub token.
  if (existing.status === "confirmed" && existing.unsubscribeToken) {
    await kv.del(`token:confirm:${token}`);
    return { email, unsubscribeToken: existing.unsubscribeToken };
  }

  const unsubToken = newToken();
  const now = Date.now();

  await kv.hset(`subscriber:${email}`, {
    email,
    status: "confirmed",
    confirmedAt: now,
    unsubscribeToken: unsubToken,
  });
  await kv.set(`token:unsub:${unsubToken}`, email); // no TTL
  await kv.sadd("list:confirmed", email);
  await kv.del(`token:confirm:${token}`);

  return { email, unsubscribeToken: unsubToken };
}

export async function unsubscribeByToken(token) {
  const email = await kv.get(`token:unsub:${token}`);
  if (!email) return null;

  const now = Date.now();
  await kv.hset(`subscriber:${email}`, {
    status: "unsubscribed",
    unsubscribedAt: now,
  });
  await kv.srem("list:confirmed", email);
  // Intentionally keep the unsubscribe token valid — clicking the link again
  // is a no-op, and some mail clients pre-fetch links which would otherwise
  // race with the real click.
  return { email };
}

export async function allConfirmedSubscribers() {
  const emails = await kv.smembers("list:confirmed");
  if (!emails || emails.length === 0) return [];

  // Fetch each record's unsubscribe token (pipelined).
  const pipeline = kv.pipeline();
  for (const email of emails) pipeline.hgetall(`subscriber:${email}`);
  const rows = await pipeline.exec();

  return rows
    .map((row) => row && row.email && row.unsubscribeToken ? row : null)
    .filter(Boolean);
}

export async function subscriberCount() {
  return await kv.scard("list:confirmed");
}
