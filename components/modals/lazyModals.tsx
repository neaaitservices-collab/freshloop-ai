'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';

function ModalShellFallback() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 backdrop-blur-[1px]"
      aria-hidden
    >
      <div className="h-12 w-12 animate-pulse rounded-2xl border border-slate-700 bg-slate-900/80" />
    </div>
  );
}

type InvoiceProps = ComponentProps<
  typeof import('@/components/features/invoices/InvoiceUploadModal').InvoiceUploadModal
>;
type ManualRecipeProps = ComponentProps<
  typeof import('@/components/features/recipes/ManualRecipeCreatorModal').ManualRecipeCreatorModal
>;
type RecipeProductionProps = ComponentProps<
  typeof import('@/components/features/recipes/RecipeProductionModal').RecipeProductionModal
>;
type DeliLabelProps = ComponentProps<
  typeof import('@/components/features/recipes/DeliLabelModal').DeliLabelModal
>;

const InvoiceUploadModalDynamic = dynamic<InvoiceProps>(
  () =>
    import('@/components/features/invoices/InvoiceUploadModal').then(
      (m) => m.InvoiceUploadModal
    ),
  { ssr: false }
);

const ManualRecipeCreatorModalDynamic = dynamic<ManualRecipeProps>(
  () =>
    import('@/components/features/recipes/ManualRecipeCreatorModal').then(
      (m) => m.ManualRecipeCreatorModal
    ),
  { ssr: false }
);

const RecipeProductionModalDynamic = dynamic<RecipeProductionProps>(
  () =>
    import('@/components/features/recipes/RecipeProductionModal').then(
      (m) => m.RecipeProductionModal
    ),
  { ssr: false }
);

const DeliLabelModalDynamic = dynamic<DeliLabelProps>(
  () =>
    import('@/components/features/recipes/DeliLabelModal').then((m) => m.DeliLabelModal),
  { ssr: false }
);

function withModalSuspense<P extends object>(Component: React.ComponentType<P>) {
  return function LazyModalWithSuspense(props: P) {
    return (
      <Suspense fallback={<ModalShellFallback />}>
        <Component {...props} />
      </Suspense>
    );
  };
}

export const LazyInvoiceUploadModal = withModalSuspense(InvoiceUploadModalDynamic);
export const LazyManualRecipeCreatorModal = withModalSuspense(ManualRecipeCreatorModalDynamic);
export const LazyRecipeProductionModal = withModalSuspense(RecipeProductionModalDynamic);
export const LazyDeliLabelModal = withModalSuspense(DeliLabelModalDynamic);
