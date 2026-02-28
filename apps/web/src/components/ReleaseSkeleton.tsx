import { Skeleton } from "./Skeleton";

export function ReleaseSkeleton() {
  return (
    <div className="min-h-screen" data-testid="release-skeleton">
      <header className="flex items-center justify-center px-6 py-4">
        <Skeleton className="h-3 w-24" />
      </header>
      <main className="flex-1 overflow-y-auto px-6 pb-32 md:pb-12">
        <div className="md:grid md:grid-cols-[1fr_1fr] md:gap-12 md:max-w-4xl md:mx-auto md:items-start">
          <div>
            <div className="mt-2 flex justify-center">
              <Skeleton className="aspect-square w-full max-w-[220px] md:max-w-sm rounded-xl" />
            </div>
            <div className="mt-8 text-center space-y-3">
              <Skeleton className="h-6 w-3/4 mx-auto" />
              <Skeleton className="h-4 w-1/2 mx-auto" />
            </div>
            <div className="mt-6">
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          </div>
          <div className="mt-8 md:mt-4 space-y-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4">
                <Skeleton className="h-4 w-8" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
