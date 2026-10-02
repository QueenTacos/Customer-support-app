/**
 * Set (or reset) Jessica's PIN.
 *
 *   npm run set-pin                 → prompts for the PIN, writes the hash to Supabase
 *   npm run set-pin -- --print-sql  → prompts for the PIN, prints SQL to paste into
 *                                     the Supabase SQL editor instead (no keys needed)
 *
 * The PIN is typed at a hidden prompt. It is never written to disk, logged,
 * or committed. Only the scrypt hash is stored. Resetting the PIN here also
 * signs out every existing session.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { hashPin } from "../lib/auth/pin";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    if (!stdin.isTTY) {
      // Non-interactive (e.g. piped) input.
      let buf = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (d) => (buf += d));
      stdin.on("end", () => resolve(buf.split(/\r?\n/)[0] ?? ""));
      stdin.on("error", reject);
      return;
    }
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (c === "\u0003") process.exit(130); // Ctrl+C
        if (c === "\u007f" || c === "\b") {
          if (value.length) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        value += c;
        process.stdout.write("•");
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const printSql = process.argv.includes("--print-sql");
  const pin = await promptHidden("New six-digit PIN: ");
  if (!/^\d{6}$/.test(pin)) {
    console.error("PIN must be exactly six digits. Nothing was changed.");
    process.exit(1);
  }
  if (process.stdin.isTTY) {
    const again = await promptHidden("Confirm PIN:        ");
    if (again !== pin) {
      console.error("PINs did not match. Nothing was changed.");
      process.exit(1);
    }
  }

  const hash = await hashPin(pin);

  if (printSql) {
    console.log("\n-- Paste into Supabase → SQL Editor and run:\n");
    console.log(
      `insert into public.auth_credentials (id, pin_hash, pin_updated_at) values (1, '${hash}', now())\n` +
        `  on conflict (id) do update set pin_hash = excluded.pin_hash, pin_updated_at = now();\n` +
        `update public.auth_sessions set revoked_at = now(), revoked_reason = 'pin_changed' where revoked_at is null;\n`,
    );
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local (or use --print-sql).");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await sb
    .from("auth_credentials")
    .upsert({ id: 1, pin_hash: hash, pin_updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) {
    console.error("Could not save the PIN:", error.message);
    process.exit(1);
  }
  await sb
    .from("auth_sessions")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: "pin_changed" })
    .is("revoked_at", null);
  console.log("PIN saved. Only the hash was stored. All existing sessions were signed out.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
