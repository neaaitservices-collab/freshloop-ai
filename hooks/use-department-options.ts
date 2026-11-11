'use client';

import { useEffect, useState } from 'react';
import {
  enumDepartmentOptions,
  type DepartmentOption,
} from '@/lib/domains/catalog/departmentRef';

let cachedOptions: DepartmentOption[] | null = null;
let inflight: Promise<DepartmentOption[] | null> | null = null;

function loadClientDepartmentOptions(): Promise<DepartmentOption[] | null> {
  if (cachedOptions) return Promise.resolve(cachedOptions);
  if (!inflight) {
    inflight = fetch('/api/departments', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null;
        const json = (await response.json()) as {
          success?: boolean;
          departments?: DepartmentOption[];
        };
        if (!json.success || !Array.isArray(json.departments) || json.departments.length === 0) {
          return null;
        }
        cachedOptions = json.departments;
        return json.departments;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Table-backed department list. Starts on the enum labels if the request fails or the table is empty. */
export function useDepartmentOptions(): DepartmentOption[] {
  const [options, setOptions] = useState<DepartmentOption[]>(() => enumDepartmentOptions());

  useEffect(() => {
    let cancelled = false;
    void loadClientDepartmentOptions().then((next) => {
      if (!cancelled && next && next.length > 0) setOptions(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return options;
}
