import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.FROM_EMAIL || "Runtime State <dispatch@runtimestate.org>";
const SITE_URL = (process.env.SITE_URL || "https://runtimestate.org").replace(/\/$/, "");

/* ────────────── Templates ──────────────
 * All email HTML is inlined. Runtime State aesthetic: charcoal + warm accent,
 * Inter, restrained typography. No em dashes in copy (per house style).
 */

function layout({ preheader, content }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Runtime State</title>
</head>
<body style="margin:0;padding:0;background:#0c0c0c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#e0e0e0;-webkit-font-smoothing:antialiased;">
  <span style="display:none!important;opacity:0;visibility:hidden;max-height:0;max-width:0;font-size:1px;line-height:1px;overflow:hidden;mso-hide:all;">${preheader}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0c0c0c;">
    <tr>
      <td align="center" style="padding:48px 24px;">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;">
          <tr>
            <td style="padding-bottom:40px;">
              <div style="font-size:20px;font-weight:600;letter-spacing:-0.02em;color:#fafafa;">
                Runtime <span style="color:#e86a4a;">State</span>
              </div>
              <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#777;margin-top:6px;">
                Dispatch
              </div>
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid #1a1a1a;padding-top:36px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding-top:56px;border-top:1px solid #1a1a1a;margin-top:40px;font-size:12px;color:#666;line-height:1.7;">
              <div style="padding-top:28px;">Runtime State &middot; ${new Date().getFullYear()}</div>
              <div><a href="${SITE_URL}" style="color:#888;text-decoration:none;border-bottom:1px solid #2a2a2a;">runtimestate.org</a></div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendConfirmation({ email, confirmToken }) {
  const url = `${SITE_URL}/api/confirm?token=${confirmToken}`;
  const html = layout({
    preheader: "Confirm your subscription to Runtime State.",
    content: `
      <h1 style="font-size:26px;font-weight:500;letter-spacing:-0.02em;line-height:1.25;color:#fafafa;margin:0 0 20px;">
        One click to confirm.
      </h1>
      <p style="font-size:15px;line-height:1.7;color:#b3b3b3;margin:0 0 32px;">
        You asked to subscribe to Runtime State. Confirm below and you will start receiving new
        dispatches as they are published. Nothing else.
      </p>
      <p style="margin:0 0 32px;">
        <a href="${url}" style="display:inline-block;background:#fafafa;color:#0c0c0c;text-decoration:none;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;padding:14px 22px;border-radius:2px;font-weight:500;">
          Confirm Subscription
        </a>
      </p>
      <p style="font-size:12px;line-height:1.65;color:#666;margin:0;">
        If the button does not work, paste this into your browser:<br>
        <span style="color:#888;word-break:break-all;">${url}</span>
      </p>
      <p style="font-size:12px;line-height:1.65;color:#666;margin:24px 0 0;">
        This link is valid for 24 hours. If you did not request it, ignore this email and your
        address will not be added.
      </p>
    `,
  });

  return resend.emails.send({
    from: FROM,
    to: email,
    subject: "Confirm your Runtime State subscription",
    html,
  });
}

export async function sendDispatch({ email, unsubscribeToken, post }) {
  const unsubUrl = `${SITE_URL}/api/unsubscribe?token=${unsubscribeToken}`;
  const postUrl = post.url.startsWith("http") ? post.url : `${SITE_URL}${post.url}`;

  const html = layout({
    preheader: post.description || post.title,
    content: `
      <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#e86a4a;margin:0 0 14px;">
        ${escapeHtml(post.kicker || "New dispatch")}
      </div>
      <h1 style="font-size:28px;font-weight:500;letter-spacing:-0.02em;line-height:1.2;color:#fafafa;margin:0 0 18px;">
        ${escapeHtml(post.title)}
      </h1>
      ${post.description ? `<p style="font-size:15px;line-height:1.7;color:#b3b3b3;margin:0 0 32px;">${escapeHtml(post.description)}</p>` : ""}
      <p style="margin:0 0 40px;">
        <a href="${postUrl}" style="display:inline-block;background:#fafafa;color:#0c0c0c;text-decoration:none;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;padding:14px 22px;border-radius:2px;font-weight:500;">
          Read the Dispatch
        </a>
      </p>
      <p style="font-size:11px;line-height:1.6;color:#555;margin:0;">
        Sent to ${escapeHtml(email)} because you subscribed to Runtime State.
        <a href="${unsubUrl}" style="color:#888;text-decoration:underline;">Unsubscribe in one click</a>.
      </p>
    `,
  });

  return resend.emails.send({
    from: FROM,
    to: email,
    subject: post.title,
    html,
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
