'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getSession, signIn } from 'next-auth/react';
import { Loader2, UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

function SignupForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email: email.trim().toLowerCase(),
          position,
          password,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Could not create your account.');
        setSubmitting(false);
        return;
      }

      const signInResult = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
        callbackUrl,
      });

      if (signInResult?.error) {
        setSubmitting(false);
        setError('Account created. Sign in on the login page.');
        return;
      }
      if (signInResult?.ok) {
        await getSession();
        window.location.assign(signInResult.url ?? callbackUrl);
        return;
      }
      setSubmitting(false);
      setError('Account created but sign-in failed. Use the login page.');
    } catch {
      setSubmitting(false);
      setError('Network error. Try again.');
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-12 text-slate-100">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-800/50 bg-blue-950/40 text-blue-300">
            <UserPlus className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-500/90">
              FreshLoop AI
            </p>
            <h1 className="text-xl font-black tracking-tight">Create staff account</h1>
          </div>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <label className="block text-xs font-semibold text-slate-400">
            Full name
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 min-h-12"
              autoComplete="name"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-400">
            Work email
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 min-h-12"
              autoComplete="email"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-400">
            Job / station
            <Input
              required
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="mt-1.5 min-h-12"
              placeholder="e.g. Produce floor"
              autoComplete="organization-title"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-400">
            Password (min 8 characters)
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 min-h-12"
              autoComplete="new-password"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-400">
            Confirm password
            <Input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1.5 min-h-12"
              autoComplete="new-password"
            />
          </label>

          {error ? (
            <p className="rounded-xl border border-rose-900/50 bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-200">
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" className="min-h-12 w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating account…
              </>
            ) : (
              'Sign up'
            )}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          New accounts start as{' '}
          <span className="font-semibold text-slate-300">Floor staff</span>. A manager can
          change your role in Admin.
        </p>
        <p className="mt-3 text-center text-sm">
          <Link href="/login" className="font-bold text-emerald-400 hover:text-emerald-300">
            Already have an account? Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
