import { redirect } from 'next/navigation';

/** Legacy `/floor` URL → clerk-focused retail floor transfers. */
export default function FloorPage() {
  redirect('/inventory/floor');
}
