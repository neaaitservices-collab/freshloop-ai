'use client';

import { Button } from '@/components/ui/Button';
import {
  addOcrSupplierLabel,
  matchSupplierByName,
  type SupplierNameCandidate,
} from '@/lib/domains/suppliers/supplierInvoiceMatch';

/** Shown only when the printed vendor matches no saved supplier. Creation is the click. */
export function OcrSupplierCreateButton({
  vendorName,
  suppliers,
  creating,
  disabled,
  onCreate,
}: {
  vendorName: string;
  suppliers: readonly SupplierNameCandidate[];
  creating: boolean;
  disabled?: boolean;
  onCreate: () => void;
}) {
  if (matchSupplierByName(vendorName, suppliers).status !== 'none') return null;
  const label = addOcrSupplierLabel(vendorName);
  if (!label) return null;
  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full"
      disabled={disabled || creating}
      onClick={onCreate}
    >
      {creating ? 'Adding supplier…' : label}
    </Button>
  );
}
