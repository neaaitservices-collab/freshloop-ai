import { redirect } from 'next/navigation';

/** @deprecated Use `/production` */
export default function KitchenLegacyRedirect() {
  redirect('/production');
}
