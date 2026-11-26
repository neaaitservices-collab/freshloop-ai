'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function OrdersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[FreshLoop] orders', error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center bg-slate-950 px-6 py-12 text-center text-slate-100">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-900/50 bg-rose-950/40 text-rose-400">
        <AlertTriangle className="h-8 w-8" aria-hidden />
      </div>
      <h1 className="text-xl font-black tracking-tight sm:text-2xl">Purchase orders could not be loaded</h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        The order screen hit an unexpected error. You can try again.
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-[10px] text-slate-600">Ref: {error.digest}</p>
      ) : null}
      <div className="mt-8 flex w-full max-w-sm flex-col gap-3 sm:flex-row sm:justify-center">
        <Button type="button" variant="primary" className="min-h-12 px-6" onClick={() => reset()}>
          <RotateCcw className="h-4 w-4" />
          Try again
        </Button>
        <Link
          href="/orders"
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-6 text-sm font-bold text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800"
        >
          Back to orders
        </Link>
      </div>
    </div>
  );
}
