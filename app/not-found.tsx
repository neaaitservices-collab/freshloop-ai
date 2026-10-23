import Link from 'next/link';
import { MapPinOff } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 py-12 text-center text-slate-100">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/80 text-slate-400">
        <MapPinOff className="h-8 w-8" aria-hidden />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-500/90">
        404
      </p>
      <h1 className="mt-2 text-xl font-black tracking-tight sm:text-2xl">
        Page not found
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        This route is not part of FreshLoop. Check the URL or open your role home
        from the nav.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex min-h-12 items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-8 text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:from-emerald-400 hover:to-teal-400"
      >
        Back to FreshLoop
      </Link>
    </div>
  );
}
