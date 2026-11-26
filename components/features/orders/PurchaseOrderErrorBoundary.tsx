'use client';

import React from 'react';

type BoundaryState = { error: Error | null };

/** Catches a render error on the purchase order screen and offers a retry. */
export class PurchaseOrderErrorBoundary extends React.Component<
  { children: React.ReactNode },
  BoundaryState
> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[freshloop] purchase order', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="mx-auto flex min-h-[40vh] max-w-lg flex-col items-center justify-center px-4 py-10 text-center"
      >
        <h1 className="text-lg font-black text-slate-100">Purchase orders could not be shown</h1>
        <p className="mt-2 text-sm text-slate-400">
          This screen hit an unexpected error. Try again to reload the order list.
        </p>
        <button
          type="button"
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-4 text-sm font-bold text-slate-100 hover:bg-slate-700"
          onClick={() => this.setState({ error: null })}
        >
          Try again
        </button>
      </div>
    );
  }
}
