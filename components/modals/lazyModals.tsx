'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';

function ModalFallback() {
  return null;
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

export const LazyInvoiceUploadModal = dynamic<InvoiceProps>(
  () =>
    import('@/components/features/invoices/InvoiceUploadModal').then(
      (m) => m.InvoiceUploadModal
    ),
  { loading: ModalFallback, ssr: false }
);

export const LazyManualRecipeCreatorModal = dynamic<ManualRecipeProps>(
  () =>
    import('@/components/features/recipes/ManualRecipeCreatorModal').then(
      (m) => m.ManualRecipeCreatorModal
    ),
  { loading: ModalFallback, ssr: false }
);

export const LazyRecipeProductionModal = dynamic<RecipeProductionProps>(
  () =>
    import('@/components/features/recipes/RecipeProductionModal').then(
      (m) => m.RecipeProductionModal
    ),
  { loading: ModalFallback, ssr: false }
);

export const LazyDeliLabelModal = dynamic<DeliLabelProps>(
  () =>
    import('@/components/features/recipes/DeliLabelModal').then((m) => m.DeliLabelModal),
  { loading: ModalFallback, ssr: false }
);
