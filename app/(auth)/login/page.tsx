import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getSettings } from "@/lib/data/settings";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  if (await getSession()) redirect("/dashboard");
  const { display_name } = await getSettings();
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Subtle purple abstract glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[38%] size-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute -right-40 -top-40 size-[420px] rounded-full bg-fuchsia-600/10 blur-[110px]" />
        <div className="absolute -bottom-48 -left-32 size-[460px] rounded-full bg-indigo-600/15 blur-[120px]" />
        <svg className="absolute inset-0 size-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M48 0H0V48" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="relative w-full max-w-md rounded-3xl border border-line bg-surface/80 p-8 shadow-2xl backdrop-blur-xl sm:p-10">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-ink">Welcome {display_name}</h1>
          <p className="mt-3 text-base text-muted">Please enter your PIN</p>
        </div>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
