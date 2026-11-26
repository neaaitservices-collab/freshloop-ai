import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaffRosterCards, StaffRosterSkeleton } from '@/components/features/admin/StaffRosterCards';
import { StaffRosterErrorBoundary, runRosterRetry } from '@/components/features/admin/StaffRosterErrorBoundary';

test('staff cards show name, email, house, department, and wage without a wide table', () => {
  const html = renderToStaticMarkup(
    React.createElement(StaffRosterCards, {
      activeUserId: 'floor-1',
      onOpen: () => undefined,
      users: [
        {
          id: 'floor-1',
          name: 'Floor Staff',
          email: 'floor.person.with.a.very.long.email@freshloop.test',
          position: 'Produce floor',
          role: 'FLOOR_STAFF',
          hourlyRate: 17.6,
          deactivatedAt: null,
        },
        {
          id: 'back-1',
          name: 'Receiving Clerk',
          email: 'receiving@freshloop.test',
          position: 'Back door',
          role: 'RECEIVING_CLERK',
          hourlyRate: 17.6,
          deactivatedAt: '2026-11-26T16:00:00.000Z',
        },
      ],
    })
  );
  assert.equal(html.includes('<table'), false);
  assert.equal(html.includes('min-w-[640px]'), false);
  assert.match(html, /Floor Staff/);
  assert.match(html, /floor\.person\.with\.a\.very\.long\.email@freshloop\.test/);
  assert.match(html, /Front/);
  assert.match(html, /Produce floor/);
  assert.match(html, /\$17\.60\/hr/);
  assert.match(html, /whitespace-nowrap/);
  assert.match(html, /shrink-0/);
  assert.match(html, /break-all/);
  assert.match(html, /Back/);
  assert.match(html, /Back door/);
  assert.match(html, /Inactive/);

  const skeleton = renderToStaticMarkup(React.createElement(StaffRosterSkeleton));
  assert.match(skeleton, /aria-busy="true"/);
  assert.match(skeleton, /Loading staff/);
});

test('the staff roster error boundary catches a render error', async () => {
  const state = StaffRosterErrorBoundary.getDerivedStateFromError(new Error('roster blew up'));
  assert.match(state.error?.message ?? '', /roster blew up/);
  const boundary = new StaffRosterErrorBoundary({ children: null });
  boundary.state = state;
  const html = renderToStaticMarkup(boundary.render());
  assert.match(html, /Staff list could not be shown/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Try again/);
  const source = readFileSync('components/features/admin/StaffRosterErrorBoundary.tsx', 'utf8');
  assert.match(source, /componentDidCatch/);
  assert.match(source, /getDerivedStateFromError/);
  assert.match(source, /runRosterRetry/);
  let retried = false;
  let cleared = false;
  await runRosterRetry(
    async () => {
      retried = true;
    },
    () => {
      cleared = true;
    }
  );
  assert.equal(retried, true);
  assert.equal(cleared, true);
  assert.match(readFileSync('components/features/admin/UserManagementTable.tsx', 'utf8'), /onRetry=\{\(\) => refresh\(\)\}/);
});

test('the staff screen is cards, a confirm dialog, and a show-inactive toggle', () => {
  const table = readFileSync('components/features/admin/UserManagementTable.tsx', 'utf8');
  const modal = readFileSync('components/features/admin/StaffEmployeeModal.tsx', 'utf8');
  assert.match(table, /StaffRosterCards/);
  assert.match(table, /StaffRosterSkeleton/);
  assert.match(table, /StaffRosterErrorBoundary/);
  assert.match(table, /Show inactive/);
  assert.match(table, /includeInactive=1/);
  assert.match(table, /Deactivate employee/);
  assert.match(table, /reactivate: true/);
  assert.equal(table.includes('<table'), false);
  assert.equal(table.includes('min-w-[640px]'), false);
  assert.match(modal, /Back \/ front/);
  assert.match(modal, /Department/);
  assert.match(modal, /aria-label="Role"/);
  assert.match(modal, /Hourly wage/);
});
