import { requireSession } from "@/lib/auth/session";
import { getSettings } from "@/lib/data/settings";
import { AppShell } from "@/components/layout/app-shell";

/** Every page inside (app) requires a verified session. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireSession();
  const settings = await getSettings();
  return (
    <AppShell appName={settings.app_name} displayName={settings.display_name}>
      {children}
    </AppShell>
  );
}
