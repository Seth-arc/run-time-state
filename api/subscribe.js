import { normaliseEmail } from "./_lib/validation.js";
import {
  createPendingSubscriber,
  getSubscriber,
  resendConfirmation,
} from "./_lib/store.js";
import { sendConfirmation } from "./_lib/mail.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const email = normaliseEmail(body?.email);
  if (!email) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  try {
    const existing = await getSubscriber(email);

    if (existing && existing.status === "confirmed") {
      return res.status(200).json({
        message: "You are already subscribed. Thank you.",
      });
    }

    let confirmToken;
    if (existing && existing.status === "pending") {
      // Resend a fresh confirmation link instead of creating a duplicate record.
      confirmToken = await resendConfirmation(email);
    } else {
      // New subscriber or previously unsubscribed -> fresh pending record.
      confirmToken = await createPendingSubscriber(email);
    }

    await sendConfirmation({ email, confirmToken });

    return res.status(200).json({
      message: "Check your email. A confirmation link is on its way.",
    });
  } catch (err) {
    console.error("subscribe error:", err);
    return res.status(500).json({
      error: "Something went wrong on our side. Try again in a moment.",
    });
  }
}
