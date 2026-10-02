"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { login, type LoginState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const [pin, setPin] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // After a failed attempt, clear the entry so Jessica can retype.
  useEffect(() => {
    if (state.error) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset after server response
      setPin("");
      inputRef.current?.focus();
    }
  }, [state]);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="pin" className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted">
          PIN
        </label>
        <div
          className={cn(
            "relative flex h-16 items-center justify-center gap-3 rounded-xl border bg-surface-2 transition-all",
            focused ? "border-primary ring-4 ring-primary/25" : "border-line-strong",
            state.error && !focused && "border-red-500/60",
          )}
          onClick={() => inputRef.current?.focus()}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              aria-hidden
              className={cn(
                "size-3.5 rounded-full transition-all duration-150",
                i < pin.length
                  ? "scale-110 bg-primary-bright shadow-[0_0_12px_rgb(167_139_250/0.8)]"
                  : "bg-surface-3 ring-1 ring-line-strong",
                focused && i === pin.length && "ring-2 ring-primary",
              )}
            />
          ))}
          <input
            ref={inputRef}
            id="pin"
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            pattern="\d{6}"
            maxLength={6}
            required
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            aria-describedby={state.error ? "pin-error" : undefined}
            aria-invalid={state.error ? true : undefined}
          />
        </div>
        <div className="mt-3 min-h-5 text-center">
          {state.error && (
            <p id="pin-error" role="alert" className="text-sm text-red-400">
              {state.error}
            </p>
          )}
        </div>
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={pending}
        disabled={pin.length !== 6}
        className="h-14 w-full rounded-xl bg-gradient-to-r from-violet-600 via-violet-500 to-fuchsia-500 text-base font-semibold uppercase tracking-[0.2em] hover:from-violet-500 hover:via-violet-400 hover:to-fuchsia-400"
      >
        {!pending && <Lock className="size-4" aria-hidden />}
        Unlock
      </Button>
    </form>
  );
}
