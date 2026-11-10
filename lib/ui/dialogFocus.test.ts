import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { nextFocusIndex } from '@/lib/ui/dialogFocus';

test('dialog tab cycle wraps and lands on the first control', () => {
  assert.equal(nextFocusIndex(3, 0, false), 1);
  assert.equal(nextFocusIndex(3, 2, false), 0);
  assert.equal(nextFocusIndex(3, -1, false), 0);
  assert.equal(nextFocusIndex(3, 0, true), 2);
  assert.equal(nextFocusIndex(3, 1, true), 0);
  assert.equal(nextFocusIndex(0, 0, false), -1);
});

test('dialogs name themselves, trap focus, and the viewport allows pinch zoom', () => {
  const shell = fs.readFileSync(
    path.join(process.cwd(), 'components/ui/layout/ModalShell.tsx'),
    'utf8'
  );
  const staff = fs.readFileSync(
    path.join(process.cwd(), 'components/features/admin/StaffEmployeeModal.tsx'),
    'utf8'
  );
  const layout = fs.readFileSync(path.join(process.cwd(), 'app/layout.tsx'), 'utf8');
  assert.match(shell, /event\.key === 'Escape'/);
  assert.match(shell, /aria-labelledby=\{labelledBy\}/);
  assert.match(shell, /aria-label=\{labelledBy \? undefined : label \?\? 'Dialog'\}/);
  assert.match(shell, /previouslyFocused\?\.focus\(\)/);
  assert.match(shell, /nextFocusIndex/);
  assert.match(staff, /labelledBy=\{titleId\}/);
  assert.match(staff, /id=\{titleId\}/);
  assert.equal(layout.includes('maximumScale'), false);
  assert.equal(layout.includes('userScalable'), false);
});
