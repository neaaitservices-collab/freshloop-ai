'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { Loader2, Mail } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [devHint, setDevHint] = useState<string | null>(null);
  const [devResetLink, setDevResetLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);
    setDevHint(null);
    setDevResetLink(null);
    setSent(false);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const json = (await res.json()) as {
        error?: string;
        message?: string;
        devHint?: string;
        devResetLink?: string;
      };
      if (!res.ok) {
        setError(json.error ?? 'Could not send reset email.');
        return;
      }
      setMessage(json.message ?? 'Check your email for a reset link.');
      setDevHint(json.devHint ?? null);
      setDevResetLink(json.devResetLink ?? null);
      setSent(true);
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
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-800/50 bg-blue-950/40 text-blue-300">
            <Mail className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight">Forgot password</h1>
            <p className="text-xs text-slate-400">We&apos;ll email you a reset link</p>
          </div>
        </div>

        {sent ? (
          <div className="space-y-4">
            {message ? (
              <p className="rounded-xl border border-emerald-900/50 bg-emerald-950/40 px-3 py-2 text-xs font-semibold text-emerald-200">
                {message}
              </p>
            ) : null}
            {devHint ? (
              <p className="rounded-xl border border-amber-900/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-100">
                {devHint}
              </p>
            ) : null}
            {devResetLink ? (
              <div className="space-y-3 rounded-xl border border-blue-800/50 bg-blue-950/30 px-3 py-3 text-xs">
                <p className="font-bold text-blue-200">Dev reset link (local only)</p>
                <Button
                  type="button"
                  variant="primary"
                  className="min-h-12 w-full"
                  onClick={() => {
                    window.location.assign(devResetLink);
                  }}
                >
                  Open reset password page
                </Button>
                <a
                  href={devResetLink}
                  className="block break-all font-mono text-[11px] text-blue-300 underline"
                >
                  {devResetLink}
                </a>
              </div>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              className="min-h-12 w-full"
              onClick={() => {
                setSent(false);
                setMessage(null);
                setDevHint(null);
                setDevResetLink(null);
              }}
            >
              Send another link
            </Button>
          </div>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
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
            {error ? (
              <p className="rounded-xl border border-rose-900/50 bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-200">
                {error}
              </p>
            ) : null}
            <Button type="submit" variant="primary" className="min-h-12 w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                'Send reset link'
              )}
            </Button>
          </form>
        )}

        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="font-bold text-emerald-400 hover:text-emerald-300">
            Back to sign in
          </Link>
        </p>
        <p className="mt-3 text-center text-[11px] text-slate-500">
          Real inbox delivery requires{' '}
          <code className="text-slate-400">RESEND_API_KEY</code> in{' '}
          <code className="text-slate-400">.env.local</code> (see .env.example).
        </p>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
