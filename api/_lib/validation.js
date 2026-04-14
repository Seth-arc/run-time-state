// Minimal RFC-5322-ish email validation. Deliberately permissive: we bounce the
// real edge cases at send time via Resend, not with a 600-char regex here.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normaliseEmail(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.length > 254) return null;
  if (!EMAIL_RE.test(trimmed)) return null;
  return trimmed;
}

export function isValidToken(raw) {
  if (typeof raw !== "string") return false;
  return /^[a-f0-9]{48}$/.test(raw);
}
