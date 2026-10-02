import { Construction } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export function ComingSoon({ title, phase, description }: { title: string; phase: number; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="grid size-12 place-items-center rounded-xl bg-primary-soft text-primary-bright">
          <Construction className="size-6" aria-hidden />
        </span>
        <p className="text-base font-semibold">Coming in Phase {phase}</p>
        <p className="max-w-md text-sm text-muted">{description}</p>
      </Card>
    </>
  );
}
