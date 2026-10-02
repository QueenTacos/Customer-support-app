import type { Metadata } from "next";
import { KeyRound, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { getSettings } from "@/lib/data/settings";
import { db } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { DetailList } from "@/components/tickets/detail-list";
import { formatDateTime } from "@/lib/utils/dates";
import { ChangePinForm } from "./change-pin-form";

export const metadata: Metadata = { title: "My Account" };

export default async function AccountPage() {
  const session = await requireSession();
  const settings = await getSettings();
  const { data: cred } = await db().from("auth_credentials").select("pin_updated_at").eq("id", 1).maybeSingle();

  return (
    <>
      <PageHeader title="My Account" subtitle="Single-user workspace" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><UserRound className="size-4 text-primary-bright" /> Profile</span>} />
          <div className="p-5">
            <DetailList
              className="lg:grid-cols-2"
              items={[
                { label: "Name", value: settings.display_name },
                { label: "Timezone", value: settings.timezone },
                { label: "Signed in", value: formatDateTime(session.created_at) },
                { label: "Session expires", value: formatDateTime(session.expires_at) },
              ]}
            />
            <form action={signOut} className="mt-6">
              <Button type="submit" variant="secondary">
                <LogOut className="size-4" /> Sign Out
              </Button>
            </form>
          </div>
        </Card>

        <Card id="change-pin" className="scroll-mt-24">
          <CardHeader
            title={<span className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary-bright" /> Security</span>}
            description={cred?.pin_updated_at ? `PIN last changed ${formatDateTime(cred.pin_updated_at)}` : undefined}
          />
          <div className="p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="size-4 text-muted" /> Change PIN
            </h3>
            <ChangePinForm />
            <p className="mt-4 text-xs text-faint">
              Changing your PIN signs out every other browser or device. After {settings.lockout.max_attempts} wrong PINs,
              PIN entry is locked for {settings.lockout.lockout_minutes} minutes.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
