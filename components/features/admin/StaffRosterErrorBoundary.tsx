'use client';

import React from 'react';

type BoundaryState = { error: Error | null };

/** Reload the roster, then show the cards again. */
export async function runRosterRetry(
  onRetry: (() => void | Promise<void>) | undefined,
  clear: () => void
): Promise<void> {
  await onRetry?.();
  clear();
}

/** Catches a render error in the staff roster without blanking the rest of settings. */
export class StaffRosterErrorBoundary extends React.Component<
  { children: React.ReactNode; onRetry?: () => void | Promise<void> },
  BoundaryState
> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[freshloop] staff roster', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="mt-4 flex flex-col items-start gap-3 rounded-2xl border border-rose-900/50 bg-rose-950/30 px-4 py-5"
      >
        <h3 className="text-base font-black text-rose-100">Staff list could not be shown</h3>
        <p className="text-sm text-rose-100/80">
          The roster hit an unexpected error. Try again to reload the staff cards.
        </p>
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-rose-800/60 bg-rose-950 px-4 text-sm font-bold text-rose-50 hover:bg-rose-900"
          onClick={() => {
            void runRosterRetry(this.props.onRetry, () => this.setState({ error: null }));
          }}
        >
          Try again
        </button>
      </div>
    );
  }
}
