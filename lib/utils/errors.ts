/**
 * Turn database / network errors into plain messages. Raw database errors are
 * logged on the server (visible in Vercel logs) and never sent to the browser.
 */
export interface DbErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

export function logServerError(context: string, err: unknown) {
  console.error(`[${context}]`, err);
}

export function isUniqueViolation(err: DbErrorLike | null | undefined, constraint?: string) {
  if (!err || err.code !== "23505") return false;
  if (!constraint) return true;
  return `${err.message ?? ""} ${err.details ?? ""}`.includes(constraint);
}

export function raisedCode(err: DbErrorLike | null | undefined): string | null {
  const m = err?.message ?? "";
  const match = m.match(/\b(TICKET_[A-Z_]+|NOTE_[A-Z_]+)\b/);
  return match ? match[1] : null;
}
