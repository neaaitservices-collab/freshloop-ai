'use client';

import React, { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import type { DepartmentRefRecord } from '@/lib/domains/catalog/departmentRef';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ScrollTable } from '@/components/ui/layout';
import { Button } from '@/components/ui/Button';

const FIELD =
  'mt-1.5 w-full min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500/50';

type Editor =
  | { mode: 'create'; code: string; name: string }
  | { mode: 'rename'; id: string; code: string; name: string };

export function DepartmentAdminTable({
  initialDepartments,
  canEdit,
}: {
  initialDepartments: DepartmentRefRecord[];
  canEdit: boolean;
}) {
  const [departments, setDepartments] = useState(initialDepartments);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveEditor = async () => {
    if (!editor) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/departments', {
        method: editor.mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editor.mode === 'create'
            ? { code: editor.code, name: editor.name }
            : { id: editor.id, name: editor.name }
        ),
      });
      const json = (await response.json()) as {
        success?: boolean;
        error?: string;
        department?: DepartmentRefRecord;
      };
      if (!response.ok || !json.success || !json.department) {
        throw new Error(json.error || 'Department could not be saved.');
      }
      const saved = json.department;
      setDepartments((current) => {
        const next = current.filter((row) => row.id !== saved.id);
        next.push(saved);
        return next.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
      });
      setEditor(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Department could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (row: DepartmentRefRecord, active: boolean) => {
    setBusyId(row.id);
    setError(null);
    try {
      const response = await fetch('/api/admin/departments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, active }),
      });
      const json = (await response.json()) as {
        success?: boolean;
        error?: string;
        department?: DepartmentRefRecord;
      };
      if (!response.ok || !json.success || !json.department) {
        throw new Error(json.error || 'Department could not be saved.');
      }
      const saved = json.department;
      setDepartments((current) => current.map((item) => (item.id === saved.id ? saved : item)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Department could not be saved.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-400">
          {canEdit
            ? 'Add a department, rename it, or change whether it is active.'
            : 'You can view departments. An admin can add a department, rename it, or change whether it is active.'}
        </p>
        {canEdit ? (
          <Button
            type="button"
            variant="success"
            className="min-h-11 shrink-0"
            onClick={() => {
              setError(null);
              setEditor({ mode: 'create', code: '', name: '' });
            }}
          >
            <Plus className="h-4 w-4" />
            Add department
          </Button>
        ) : null}
      </div>
      {error && !editor ? <p className="mt-3 text-sm text-amber-200">{error}</p> : null}

      <ScrollTable className="mt-4 rounded-xl border border-slate-800">
        <table className="min-w-[720px] w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-900/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Sort</th>
              {canEdit ? <th className="px-4 py-3 text-right">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {departments.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 5 : 4} className="px-4 py-8 text-center text-slate-500">
                  No departments yet.
                </td>
              </tr>
            ) : (
              departments.map((row) => (
                <tr key={row.id} className="border-t border-slate-800/80 hover:bg-slate-900/40">
                  <td className="px-4 py-3 font-mono text-slate-200">{row.code}</td>
                  <td className="px-4 py-3 font-semibold text-slate-100">{row.name}</td>
                  <td className="px-4 py-3 text-slate-300">{row.active ? 'Active' : 'Inactive'}</td>
                  <td className="px-4 py-3 font-mono text-slate-400">{row.sortOrder}</td>
                  {canEdit ? (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setError(null);
                            setEditor({ mode: 'rename', id: row.id, code: row.code, name: row.name });
                          }}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-slate-400 hover:bg-slate-800 hover:text-emerald-300"
                          aria-label={`Rename ${row.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                          Rename
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void setActive(row, !row.active)}
                          className="inline-flex min-h-11 items-center rounded-lg px-2 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-50"
                        >
                          {row.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollTable>

      <ModalShell open={editor !== null} onClose={() => setEditor(null)} width="md" label="Department">
        <ModalHeader className="px-6 py-4">
          <h2 className="text-lg font-black text-white">
            {editor?.mode === 'rename' ? 'Rename department' : 'Add department'}
          </h2>
        </ModalHeader>
        <ModalBody className="space-y-4 px-6 py-4">
          {editor?.mode === 'rename' ? (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Code</p>
              <p className="mt-1.5 font-mono text-sm text-slate-200">{editor.code}</p>
              <p className="mt-1 text-xs text-slate-500">The code stays the same.</p>
            </div>
          ) : (
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
              Code
              <input
                required
                value={editor?.code ?? ''}
                onChange={(event) =>
                  setEditor((current) =>
                    current && current.mode === 'create'
                      ? { ...current, code: event.target.value }
                      : current
                  )
                }
                className={FIELD}
                autoCapitalize="characters"
                spellCheck={false}
              />
            </label>
          )}
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
            Name
            <input
              required
              value={editor?.name ?? ''}
              onChange={(event) =>
                setEditor((current) => (current ? { ...current, name: event.target.value } : current))
              }
              className={FIELD}
            />
          </label>
          {error ? <p className="text-sm text-amber-200">{error}</p> : null}
        </ModalBody>
        <ModalFooter className="gap-3 px-6 py-4">
          <Button type="button" variant="ghost" className="min-h-11 flex-1" onClick={() => setEditor(null)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="success"
            className="min-h-11 flex-1"
            disabled={saving || !editor}
            onClick={() => void saveEditor()}
          >
            {saving ? 'Saving…' : editor?.mode === 'rename' ? 'Save name' : 'Add department'}
          </Button>
        </ModalFooter>
      </ModalShell>
    </>
  );
}
