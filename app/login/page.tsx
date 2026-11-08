'use client';

import React, { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { waitForClientSession } from '@/lib/auth/waitForClientSession';
import Link from 'next/link';
import { Loader2, Store } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { AuthPageShell } from '@/components/ui/layout';

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/';
  const safeCallback =
    callbackUrl.startsWith('/') && !callbackUrl.startsWith('//') ? callbackUrl : '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await signIn('credentials', {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
      callbackUrl: safeCallback,
    });
    if (result?.error) {
      setSubmitting(false);
      setError('Invalid email or password.');
      return;
    }
    if (result?.ok) {
      await waitForClientSession();
      // Full document load so `/` runs the server role redirect. A client replace
      // reuses the logged-out root layout and can stop on the empty page.
      window.location.assign(safeCallback);
      return;
    }
    setSubmitting(false);
    setError('Could not complete sign-in. Try again.');
  };

  return (
    <AuthPageShell>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-800/50 bg-emerald-950/40 text-emerald-400">
            <Store className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-500/90">
              FreshLoop AI
            </p>
            <h1 className="text-xl font-black tracking-tight">Staff sign in</h1>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Work email + password · secure 12-hour session
            </p>
          </div>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <label className="block text-xs font-semibold text-slate-400">
            Work email
            <Input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 min-h-12"
              placeholder="floor@freshloop.test"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-400">
            Password
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 min-h-12"
            />
          </label>
          {error ? (
            <p className="rounded-xl border border-rose-900/50 bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-200">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            className="min-h-12 w-full"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link
            href="/forgot-password"
            className="font-bold text-blue-300 hover:text-blue-200"
          >
            I don&apos;t remember my password
          </Link>
        </p>
        <p className="mt-2 text-center text-sm">
          <Link href="/signup" className="font-bold text-emerald-400 hover:text-emerald-300">
            Need an account? Sign up
          </Link>
        </p>
        <p className="mt-3 text-center text-[11px] text-slate-500">
          Demo accounts (after seed): e.g.{' '}
          <code className="text-slate-400">floor@freshloop.test</code> /{' '}
          <code className="text-slate-400">freshloop</code>
        </p>
    </AuthPageShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
