import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const files = [
  'components/features/recipes/RecipeProductionModal.tsx',
  'components/features/voice/VoiceLoggerModal.tsx',
  'components/features/operations/VolumetricScrapForm.tsx',
  'components/features/admin/WasteSemaphoreCard.tsx',
].map((file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8'));

test('named screens use English labels', () => {
  const source = files.join('\n');
  for (const spanish of [
    'Acceso denegado',
    'Cubeta',
    'semáforo',
    'Cantidad',
    'Reintentar',
    'No se pudo',
  ]) {
    assert.equal(source.includes(spanish), false, spanish);
  }
  assert.match(source, /Production manufacturing and BOM/);
  assert.match(source, /Process voice \(open confirmation\)/);
  assert.match(source, /Log scrap/);
  assert.match(source, /Waste traffic light/);
});
