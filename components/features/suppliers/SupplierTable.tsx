'use client';

import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Search } from 'lucide-react';
import type { SupplierRecord } from '@/lib/domains/suppliers/suppliers';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ScrollTable } from '@/components/ui/layout';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';

const FIELD =
  'mt-1.5 w-full min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500/50';

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

export function SupplierTable({
  initialSuppliers,
  canEdit,
}: {
  initialSuppliers: SupplierRecord[];
  canEdit: boolean;
}) {
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>(initialSuppliers);
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
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
    setForm(EMPTY_FORM);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (row: SupplierRecord) => {
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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search suppliers…"
            className="w-full min-h-11 rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-600"
          />
        </label>
        {canEdit ? (
          <Button type="button" variant="success" className="min-h-11 shrink-0" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add supplier
          </Button>
        ) : null}
      </div>

      <ScrollTable className="mt-4 rounded-xl border border-slate-800">
        <table className="min-w-[640px] w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-900/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Email</th>
              {canEdit ? <th className="px-4 py-3 text-right">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 5 : 4} className="px-4 py-8 text-center text-slate-500">
                  {query.trim() ? 'No suppliers match your search.' : 'No suppliers yet.'}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-t border-slate-800/80 hover:bg-slate-900/40">
                  <td className="min-w-0 px-4 py-3 font-semibold text-slate-100">
                    <span className="truncate block max-w-[16rem]" title={row.name}>
                      {row.name}
                    </span>
                  </td>
                  <td className="min-w-0 px-4 py-3 text-slate-300">
                    <span className="truncate block max-w-[12rem]" title={row.contactName ?? undefined}>
                      {row.contactName || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-400">{row.contactPhone || '—'}</td>
                  <td className="min-w-0 px-4 py-3 text-slate-400">
                    <span className="truncate block max-w-[14rem]" title={row.contactEmail ?? undefined}>
                      {row.contactEmail || '—'}
                    </span>
                  </td>
                  {canEdit ? (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-emerald-300"
                        aria-label={`Edit ${row.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollTable>

      <ModalShell open={modalOpen} onClose={() => setModalOpen(false)} width="md">
        <ModalHeader className="px-6 py-4">
          <h2 className="text-lg font-black text-white">
            {form.name && suppliers.some((s) => s.name === form.name) ? 'Edit supplier' : 'New supplier'}
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
