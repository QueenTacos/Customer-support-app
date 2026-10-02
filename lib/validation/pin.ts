import { z } from "zod";

export const PIN_RE = /^\d{6}$/;

export const pinSchema = z.string().regex(PIN_RE, "PIN must be exactly six digits.");

export const changePinSchema = z
  .object({
    current: z.string().regex(PIN_RE, "Enter your current six-digit PIN."),
    next: pinSchema,
    confirm: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.next !== v.confirm) {
      ctx.addIssue({ code: "custom", path: ["confirm"], message: "New PIN and confirmation don't match." });
    }
    if (v.next === v.current) {
      ctx.addIssue({ code: "custom", path: ["next"], message: "New PIN must be different from the current PIN." });
    }
  });
