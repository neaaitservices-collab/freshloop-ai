import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { decideEdgeAccess } from '@/lib/auth/edgeAccess';
import { decidePageAccess } from '@/lib/auth/pageAccess';
import { staffUserFromRow, type StaffAuthRow } from '@/lib/auth/staffSnapshot';

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function user(role: StaffAuthRow['role']) {
  return staffUserFromRow({
    id: 'user-1',
    name: 'Alex Rivera',
    email: 'alex@freshloop.local',
    role,
    position: 'Staff',
    hourlyRate: 20,
    passwordHash: 'hash',
    credentialVersion: 0,
  });
}

test('voice cancel and the X close share one dismiss', () => {
  const src = read('components/features/voice/VoiceLoggerModal.tsx');
  const close = src.indexOf('aria-label="Close"');
  const cancel = src.indexOf('>\n                Cancel');
  assert.ok(close !== -1 && cancel !== -1);
  assert.match(src.slice(close - 420, close), /onClick=\{dismiss\}/);
  assert.match(src.slice(cancel - 420, cancel), /onClick=\{dismiss\}/);
  assert.match(src, /const dismiss = \(\) => \{\s*resetClosedSession\(\);\s*onClose\(\);/);
});

test('/voice is a guarded redirect, not a config bypass', () => {
  const page = read('app/voice/page.tsx');
  const guardAt = page.indexOf("guardFreshPage('/voice')");
  const redirectAt = page.indexOf("redirect('/operations')");
  assert.ok(guardAt !== -1 && redirectAt !== -1 && guardAt < redirectAt);
  assert.equal(read('next.config.ts').includes('"/voice"'), false);
  assert.match(read('middleware.ts'), /decideEdgeAccess/);

  assert.deepEqual(decideEdgeAccess('/voice', false), {
    type: 'login',
    callbackUrl: '/voice',
  });
  assert.deepEqual(decideEdgeAccess('/voice', true), { type: 'continue' });

  const floor = user('FLOOR_STAFF');
  const admin = user('ADMIN');
  assert.ok(floor && admin);
  assert.deepEqual(decidePageAccess('/voice', null), {
    action: 'redirect',
    location: '/login?callbackUrl=%2Fvoice',
  });
  assert.deepEqual(decidePageAccess('/voice', floor), {
    action: 'redirect',
    location: '/inventory/floor',
  });
  assert.deepEqual(decidePageAccess('/voice', admin), { action: 'allow' });
});

test('receive list is labeled as deliveries', () => {
  const carousel = read('components/features/receive/InvoiceItemsCarousel.tsx');
  const dashboard = read('components/features/receive/YieldPricingDashboard.tsx');
  assert.match(carousel, /aria-label="Recent deliveries"/);
  assert.match(carousel, /Recent deliveries \(\{items\.length\}\)/);
  assert.match(carousel, /Swipe to browse deliveries/);
  assert.equal(carousel.includes('Invoice items'), false);
  assert.equal(dashboard.includes('text-slate-400">Deliveries'), false);
});

test('dialog close controls stay above the backdrop', () => {
  const shell = read('components/ui/layout/ModalShell.tsx');
  assert.match(shell, /createPortal\(dialog, document\.body\)/);
  assert.match(shell, /className="absolute inset-0 z-0"/);
  assert.match(shell, /pointer-events-auto relative z-10/);
  for (const file of [
    'components/features/admin/StaffEmployeeModal.tsx',
    'components/features/admin/ScrapBucketSettingsModal.tsx',
    'components/features/inventory/ItemSettingsModal.tsx',
  ]) {
    const src = read(file);
    const close = src.indexOf('aria-label="Close');
    assert.ok(close !== -1, file);
    assert.match(src.slice(close - 220, close), /pointer-events-auto relative z-30|relative z-30 pointer-events-auto/);
  }
});
