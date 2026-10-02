/** Shared by proxy.ts (edge-safe) and server code. No secrets here. */
export const SESSION_COOKIE = "cs_session";

/** 32 random bytes, base64url = 43 characters. */
export const SESSION_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
