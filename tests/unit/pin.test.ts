import { describe, expect, it } from "vitest";
import { hashPin, verifyPin } from "@/lib/auth/pin";
import { changePinSchema } from "@/lib/validation/pin";

describe("PIN hashing", () => {
  it("hashes with a random salt and verifies", async () => {
    const a = await hashPin("135790");
    const b = await hashPin("135790");
    expect(a).toMatch(/^scrypt\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain("135790");
    expect(await verifyPin("135790", a)).toBe(true);
    expect(await verifyPin("135791", a)).toBe(false);
  });

  it("rejects non six-digit PINs", async () => {
    await expect(hashPin("12345")).rejects.toThrow();
    await expect(hashPin("12345a")).rejects.toThrow();
  });

  it("treats malformed hashes as a failed match", async () => {
    expect(await verifyPin("123456", "garbage")).toBe(false);
  });
});

describe("Change PIN validation", () => {
  const parse = (current: string, next: string, confirm: string) => changePinSchema.safeParse({ current, next, confirm });
  it("requires six digits, a match, and a different PIN", () => {
    expect(parse("111111", "222222", "222222").success).toBe(true);
    expect(parse("111111", "22222", "22222").success).toBe(false);
    expect(parse("111111", "222222", "222223").success).toBe(false);
    expect(parse("111111", "111111", "111111").success).toBe(false);
  });
});
