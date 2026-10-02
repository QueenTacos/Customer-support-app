"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { changePin, type ChangePinState } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

export function ChangePinForm() {
  const [state, action, pending] = useActionState<ChangePinState, FormData>(changePin, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      toast.success("PIN changed successfully.");
    } else if (state.error && !state.fieldErrors) {
      toast.error(state.error);
    }
  }, [state]);

  const pinProps = {
    type: "password" as const,
    inputMode: "numeric" as const,
    pattern: "\\d{6}",
    maxLength: 6,
    required: true,
    className: "max-w-48 font-mono tracking-[0.5em]",
    onInput: (e: React.FormEvent<HTMLInputElement>) => {
      e.currentTarget.value = e.currentTarget.value.replace(/\D/g, "").slice(0, 6);
    },
  };

  return (
    <form ref={formRef} action={action} className="space-y-4" noValidate>
      <Field label="Current PIN" htmlFor="current" error={state.fieldErrors?.current} required>
        <Input id="current" name="current" autoComplete="current-password" invalid={!!state.fieldErrors?.current} {...pinProps} />
      </Field>
      <Field label="New PIN" htmlFor="next" error={state.fieldErrors?.next} hint="Exactly six digits." required>
        <Input id="next" name="next" autoComplete="new-password" invalid={!!state.fieldErrors?.next} {...pinProps} />
      </Field>
      <Field label="Confirm New PIN" htmlFor="confirm" error={state.fieldErrors?.confirm} required>
        <Input id="confirm" name="confirm" autoComplete="new-password" invalid={!!state.fieldErrors?.confirm} {...pinProps} />
      </Field>

      {state.ok && (
        <p role="status" className="flex items-center gap-2 text-sm font-medium text-emerald-300">
          <CheckCircle2 className="size-4" /> {state.message}
        </p>
      )}
      {state.error && state.fieldErrors && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}

      <Button type="submit" variant="primary" loading={pending} className="uppercase tracking-wider">
        Change PIN
      </Button>
    </form>
  );
}
