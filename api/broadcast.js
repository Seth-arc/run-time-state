import { allConfirmedSubscribers, subscriberCount } from "./_lib/store.js";
import { sendDispatch } from "./_lib/mail.js";

export const config = { maxDuration: 60 };

/*
 * POST /api/broadcast
 *
 * Headers
 *   Authorization: Bearer ${ADMIN_TOKEN}
 *
 * Body (JSON)
 *   {
 *     "title":       "Citizens, Infrastructure, and Knowledge...",
 *     "url":         "/posts/ai-policy-discourse-analysis",
 *     "description": "A selective adaptation layered onto...",
 *     "kicker":      "Discourse Analysis · April 2026",
 *     "dryRun":      false
 *   }
 *
 * Returns { sent, failed, total } or { total } if dryRun.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = req.headers.authorization || "";
  const expected = `Bearer ${process.env.ADMIN_TOKEN || ""}`;
  if (!process.env.ADMIN_TOKEN || auth !== expected) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const post = {
    title: body?.title?.trim(),
    url: body?.url?.trim(),
    description: body?.description?.trim() || "",
    kicker: body?.kicker?.trim() || "",
  };

  if (!post.title || !post.url) {
    return res.status(400).json({ error: "title and url are required." });
  }

  const subscribers = await allConfirmedSubscribers();

  if (body?.dryRun) {
    return res.status(200).json({
      dryRun: true,
      total: subscribers.length,
      sampleRecipients: subscribers.slice(0, 3).map((s) => s.email),
      post,
    });
  }

  let sent = 0;
  let failed = 0;
  const errors = [];

  // Sequential send keeps us well under Resend's default rate limit
  // (2 req/sec on the free tier) without extra plumbing.
  for (const sub of subscribers) {
    try {
      await sendDispatch({
        email: sub.email,
        unsubscribeToken: sub.unsubscribeToken,
        post,
      });
      sent += 1;
      await sleep(550);
    } catch (err) {
      failed += 1;
      errors.push({ email: sub.email, error: String(err?.message || err) });
      console.error("broadcast send failed:", sub.email, err);
    }
  }

  return res.status(200).json({
    total: subscribers.length,
    sent,
    failed,
    confirmedInList: await subscriberCount(),
    errors: errors.slice(0, 10),
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
