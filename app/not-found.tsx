import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-medium text-primary-bright">404</p>
      <h1 className="text-2xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="text-sm text-muted">The ticket may have a different link, or the page doesn&apos;t exist.</p>
      <Link href="/dashboard" className="mt-2 text-sm text-primary-bright hover:underline">
        Go to Dashboard
      </Link>
    </main>
  );
}
