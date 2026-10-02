"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Friendly error screen. Details go to the server logs, never to the page. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">Something went wrong loading this page.</h1>
      <p className="max-w-md text-sm text-muted">
        Your saved data is safe. Please try again. If this keeps happening, note the time
        {error.digest ? ` and reference ${error.digest}` : ""}.
      </p>
      <Button variant="primary" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
