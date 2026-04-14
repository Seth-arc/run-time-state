import { isValidToken } from "./_lib/validation.js";
import { unsubscribeByToken } from "./_lib/store.js";

/*
 * Accepts both GET (link in email) and POST (RFC 8058 one-click).
 * Both flows redirect to /unsubscribed.html on success.
 */
export default async function handler(req, res) {
  const token = req.query?.token;

  if (!isValidToken(token)) {
    if (req.method === "POST") return res.status(400).json({ error: "Invalid token" });
    return redirectToState(res, "invalid");
  }

  try {
    const result = await unsubscribeByToken(token);
    if (!result) {
      if (req.method === "POST") return res.status(404).json({ error: "Not found" });
      return redirectToState(res, "notfound");
    }
    if (req.method === "POST") return res.status(200).json({ message: "Unsubscribed" });
    return redirectToState(res, "ok");
  } catch (err) {
    console.error("unsubscribe error:", err);
    if (req.method === "POST") return res.status(500).json({ error: "Server error" });
    return redirectToState(res, "error");
  }
}

function redirectToState(res, state) {
  res.statusCode = 302;
  res.setHeader("Location", `/unsubscribed.html?state=${state}`);
  res.end();
}
