import { Skeleton } from "@/components/ui/skeleton";

export default function TreenityBotLoading() {
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
      </div>
      <Skeleton className="h-12 w-72 rounded-xl" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
