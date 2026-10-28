import { cn } from '@/lib/utils/cn';

export type RouteSkeletonVariant = 'default' | 'grid' | 'table';

export function RouteSkeleton({
  variant = 'default',
  className,
}: {
  variant?: RouteSkeletonVariant;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-7xl animate-pulse px-3 py-6 sm:px-6 sm:py-8',
        className
      )}
      aria-busy
      aria-label="Loading page"
    >
      <div className="mb-2 h-3 w-28 rounded bg-slate-800" />
      <div className="mb-2 h-8 max-w-md rounded-lg bg-slate-800" />
      <div className="mb-8 h-4 max-w-xl rounded bg-slate-800/70" />

      {variant === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-44 rounded-2xl bg-slate-800/80" />
          ))}
        </div>
      ) : variant === 'table' ? (
        <div className="overflow-hidden rounded-2xl border border-slate-800/80">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="flex gap-4 border-b border-slate-800/60 px-4 py-4 last:border-0"
            >
              <div className="h-4 flex-1 rounded bg-slate-800" />
              <div className="h-4 w-20 rounded bg-slate-800/80" />
              <div className="h-4 w-16 rounded bg-slate-800/80" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-14 rounded-xl bg-slate-800/80 sm:h-16" />
          ))}
        </div>
      )}
    </div>
  );
}
