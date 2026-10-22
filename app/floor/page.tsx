import { redirect } from 'next/navigation';

/** Floor is unified with inventory — on-hand ledger is the single source of truth. */
export default function FloorPage() {
  redirect('/inventory');
}
