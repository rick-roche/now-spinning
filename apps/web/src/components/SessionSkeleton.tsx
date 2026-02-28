import { Skeleton } from "./Skeleton";

export function SessionSkeleton() {
  return (
    <div className="min-h-screen" data-testid="session-skeleton">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="w-10" />
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2 w-28" />
        </div>
        <div className="w-10" />
      </header>
      <main className="flex-1 overflow-y-auto px-6 pb-32 md:pb-12">
        <div className="md:grid md:grid-cols-[1fr_1fr] md:gap-12 md:max-w-4xl md:mx-auto md:items-start">
          <div>
            <Skeleton className="aspect-square w-full rounded-2xl" />
            <div className="mt-6 space-y-3 text-center">
              <Skeleton className="h-5 w-2/3 mx-auto" />
              <Skeleton className="h-4 w-1/2 mx-auto" />
              <Skeleton className="h-3 w-1/3 mx-auto" />
            </div>
            <div className="mt-8">
              <Skeleton className="h-2 w-full rounded-full" />
              <div className="flex justify-between mt-3">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-3 w-10" />
              </div>
            </div>
            <div className="mt-8 flex items-center justify-center gap-4">
              <Skeleton className="h-14 w-14 rounded-full" />
              <Skeleton className="h-16 w-16 rounded-full" />
              <Skeleton className="h-14 w-14 rounded-full" />
            </div>
          </div>
          <div className="mt-10 md:mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4">
                <Skeleton className="h-4 w-8" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
