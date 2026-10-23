'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { KeyRound, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const emailFromUrl = searchParams.get('email') ?? '';
  const tokenFromUrl = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
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
    if (!emailFromUrl || !tokenFromUrl) {
      setError('Invalid reset link. Request a new one from forgot password.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailFromUrl,
          token: tokenFromUrl,
          password,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Could not reset password.');
        return;
      }
      setDone(true);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-12 text-slate-100">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-800/50 bg-amber-950/40 text-amber-300">
            <KeyRound className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight">New password</h1>
            <p className="truncate text-xs text-slate-400">{emailFromUrl || '—'}</p>
          </div>
        </div>

        {done ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-emerald-300">Password updated successfully.</p>
            <Link
              href="/login"
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-500 px-6 text-sm font-black text-slate-950"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <label className="block text-xs font-semibold text-slate-400">
              New password
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
                  Saving…
                </>
              ) : (
                'Update password'
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
