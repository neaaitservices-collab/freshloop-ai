'use client';

import React, { useMemo, useState } from 'react';
import { ChevronRight, Pencil, Plus, Search } from 'lucide-react';
import type { SupplierRecord } from '@/lib/domains/suppliers/suppliers';
import { ModalBody, ModalFooter, ModalHeader, ModalShell } from '@/components/ui/layout';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';

const FIELD =
  'mt-1.5 w-full min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500/50';

const FOCUS =
  'focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400';

type FormState = {
  name: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
};

function supplierSummary(row: SupplierRecord): string {
  const contact = row.contactName?.trim() || '';
  const reach = row.contactPhone?.trim() || row.contactEmail?.trim() || '';
  if (contact && reach) return `${contact} · ${reach}`;
  return contact || reach || 'No contact on file';
}

function formatSupplierDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function DetailValue({ children }: { children: React.ReactNode }) {
  return <dd className="text-sm font-semibold text-slate-100">{children}</dd>;
}

export function SupplierDirectory({
  initialSuppliers,
  canEdit,
}: {
  initialSuppliers: SupplierRecord[];
  canEdit: boolean;
}) {
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>(initialSuppliers);
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SupplierRecord | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return suppliers;
    return suppliers.filter((row) => {
      const hay = [row.name, row.contactName, row.contactPhone, row.contactEmail]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [suppliers, query]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (row: SupplierRecord) => {
    setDetail(null);
    setEditingId(row.id);
    setForm({
      name: row.name,
      contactName: row.contactName ?? '',
      contactPhone: row.contactPhone ?? '',
      contactEmail: row.contactEmail ?? '',
    });
    setError(null);
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError('Supplier name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          contactName: form.contactName.trim() || null,
          contactPhone: form.contactPhone.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.supplier) {
        throw new Error(json.error || 'Could not save supplier.');
      }
      const saved = json.supplier as SupplierRecord;
      setSuppliers((current) => {
        const idx = current.findIndex((s) => s.id === saved.id);
        if (idx >= 0) {
          const next = [...current];
          next[idx] = saved;
          return next.sort((a, b) => a.name.localeCompare(b.name));
        }
        return [...current, saved].sort((a, b) => a.name.localeCompare(b.name));
      });
      setModalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save supplier.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search suppliers</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search suppliers…"
            className="w-full min-h-11 rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-600 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          />
        </label>
        {canEdit ? (
          <Button type="button" variant="success" className="min-h-11 shrink-0" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add supplier
          </Button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500" role="status">
          {query.trim() ? 'No suppliers match your search.' : 'No suppliers yet.'}
        </p>
      ) : (
        <ul role="list" className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((row) => (
            <li
              key={row.id}
              role="listitem"
              className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70"
            >
              <button
                type="button"
                onClick={() => setDetail(row)}
                aria-haspopup="dialog"
                className={cn(
                  'flex w-full min-h-11 flex-col gap-1 px-4 py-3 text-left transition hover:bg-slate-900/80',
                  FOCUS
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate text-base font-semibold text-white">{row.name}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                </span>
                <span className="truncate text-sm text-slate-400">{supplierSummary(row)}</span>
                <span className="sr-only">View details</span>
              </button>
              {canEdit ? (
                <div className="border-t border-slate-800 px-2 py-1">
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    aria-label={`Edit ${row.name}`}
                    className={cn(
                      'inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-emerald-200',
                      FOCUS
                    )}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                    Edit
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <ModalShell
        open={detail !== null}
        onClose={() => setDetail(null)}
        width="sm"
        labelledBy="supplier-detail-title"
      >
        {detail ? (
          <>
            <ModalHeader>
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-200">Supplier</p>
              <h2 id="supplier-detail-title" className="mt-1 text-lg font-black text-white">
                {detail.name}
              </h2>
            </ModalHeader>
            <ModalBody>
              <dl className="space-y-4">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Contact</dt>
                  <DetailValue>{detail.contactName?.trim() || '—'}</DetailValue>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Phone</dt>
                  <DetailValue>
                    {detail.contactPhone?.trim() ? (
                      <a
                        href={`tel:${detail.contactPhone.trim()}`}
                        className={cn('rounded-md text-emerald-300 underline-offset-2 hover:underline', FOCUS)}
                      >
                        {detail.contactPhone.trim()}
                      </a>
                    ) : (
                      '—'
                    )}
                  </DetailValue>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Email</dt>
                  <DetailValue>
                    {detail.contactEmail?.trim() ? (
                      <a
                        href={`mailto:${detail.contactEmail.trim()}`}
                        className={cn(
                          'break-all rounded-md text-emerald-300 underline-offset-2 hover:underline',
                          FOCUS
                        )}
                      >
                        {detail.contactEmail.trim()}
                      </a>
                    ) : (
                      '—'
                    )}
                  </DetailValue>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Added</dt>
                  <DetailValue>{formatSupplierDate(detail.createdAt)}</DetailValue>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Updated</dt>
                  <DetailValue>{formatSupplierDate(detail.updatedAt)}</DetailValue>
                </div>
              </dl>
            </ModalBody>
            <ModalFooter className="flex gap-3">
              <Button type="button" variant="ghost" className="min-h-11 flex-1" onClick={() => setDetail(null)}>
                Close
              </Button>
              {canEdit ? (
                <Button
                  type="button"
                  variant="success"
                  className="min-h-11 flex-1"
                  onClick={() => openEdit(detail)}
                >
                  Edit supplier
                </Button>
              ) : null}
            </ModalFooter>
          </>
        ) : null}
      </ModalShell>

      <ModalShell
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        width="md"
        labelledBy="supplier-form-title"
      >
        <ModalHeader className="px-6 py-4">
          <h2 id="supplier-form-title" className="text-lg font-black text-white">
            {editingId ? 'Edit supplier' : 'New supplier'}
          </h2>
        </ModalHeader>
        <ModalBody className="space-y-4 px-6 py-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
            Supplier name
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={FIELD}
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
            Contact person
            <input
              value={form.contactName}
              onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
              className={FIELD}
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
            Phone
            <input
              value={form.contactPhone}
              onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
              className={cn(FIELD, 'font-mono tabular-nums')}
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
            Email
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
              className={FIELD}
            />
          </label>
          {error ? <p className="text-sm text-amber-200">{error}</p> : null}
        </ModalBody>
        <ModalFooter className="gap-3 px-6 py-4">
          <Button type="button" variant="ghost" className="min-h-11 flex-1" onClick={() => setModalOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="success"
            className="min-h-11 flex-1"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save supplier'}
          </Button>
        </ModalFooter>
      </ModalShell>
    </>
  );
}

export const SupplierTable = SupplierDirectory;
