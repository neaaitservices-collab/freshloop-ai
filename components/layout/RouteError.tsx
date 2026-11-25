'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function RouteError({
  title,
  error,
  reset,
}: {
  title: string;
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[FreshLoop]', error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-12 text-center text-slate-100 sm:px-6">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-900/50 bg-rose-950/40 text-rose-400">
        <AlertTriangle className="h-7 w-7" aria-hidden />
      </div>
      <h1 className="text-lg font-black tracking-tight sm:text-2xl">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        The numbers on this screen did not load. Nothing here is filled in from sample stock.
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-slate-600">Ref: {error.digest}</p>
      ) : null}
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
        <Button type="button" variant="primary" className="min-h-12 px-6" onClick={() => reset()}>
          <RotateCcw className="h-4 w-4" />
          Try again
        </Button>
        <Link
          href="/"
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-6 text-sm font-bold text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
