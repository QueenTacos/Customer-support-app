import { Spinner } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted">
      <Spinner />
    </div>
  );
}
