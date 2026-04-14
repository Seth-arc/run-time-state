import { isValidToken } from "./_lib/validation.js";
import { confirmSubscriber } from "./_lib/store.js";

export default async function handler(req, res) {
  const token = req.query?.token;

  if (!isValidToken(token)) {
    return redirectToState(res, "invalid");
  }

  try {
    const result = await confirmSubscriber(token);
    if (!result) {
      return redirectToState(res, "expired");
    }
    return redirectToState(res, "ok");
  } catch (err) {
    console.error("confirm error:", err);
    return redirectToState(res, "error");
  }
}

function redirectToState(res, state) {
  res.statusCode = 302;
  res.setHeader("Location", `/confirmed.html?state=${state}`);
  res.end();
}
