import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { interpretInvoiceOcrModel } from '@/lib/domains/receiving/invoiceOcrModel';

const fixturePath = path.join(
  process.cwd(),
  'lib/domains/receiving/fixtures/tony-deodato-899559.model.json'
);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
  vendorName: string;
  invoiceNumber: string;
  lineItems: Array<{ name: string }>;
};
const model = interpretInvoiceOcrModel(fixture, { receivedOn: '2026-11-11' });

function stock(name: string) {
  return model.lineItems.find((line) => line.name === name);
}

test('invoice 899559 keeps the supplier name and invoice number', () => {
  assert.equal(model.vendorName, 'Tony Deodato & Sons');
  assert.equal(model.invoiceNumber, '899559');
  assert.equal(fixture.vendorName, 'Tony Deodato & Sons');
  assert.equal(JSON.stringify(fixture).includes('KINGSTON'), false);
  assert.equal(JSON.stringify(fixture).includes('COBOURG'), false);
  assert.equal(JSON.stringify(fixture).includes('FORTUNE'), false);
  assert.equal(JSON.stringify(fixture).includes('KING STREET'), false);
});

test('05-11-2026 is prefilled from the closer reading and still flagged', () => {
  assert.equal(model.invoiceDate, '2026-11-05');
  assert.match(model.gaps.join(' '), /05-11-2026/);
  assert.match(model.gaps.join(' '), /ambiguous/);
  assert.match(model.gaps.join(' '), /2026-11-05 \(DD-MM\)/);
  assert.match(model.gaps.join(' '), /Confirm this date/);
});

test('struck red grapes shipped 0 add no stock', () => {
  assert.equal(stock('GRAPES RED SEEDLESS'), undefined);
  const dropped = model.excludedLines.find((line) => line.name === 'GRAPES RED SEEDLESS');
  assert.ok(dropped);
  assert.equal(dropped.quantity, 0);
  assert.equal(dropped.lineKind, 'zero');
  assert.equal(dropped.postsStock, false);
  assert.equal(dropped.totalCost, 0);
});

test('strawberries 2 x 84.75 equal 169.50 with no mismatch', () => {
  const line = stock('8x1LB STRAWBERRIES');
  assert.ok(line);
  assert.equal(line.quantity, 2);
  assert.equal(line.unit, 'FLAT');
  assert.equal(line.unitCost, 84.75);
  assert.equal(line.totalCost, 169.5);
  assert.equal(line.lineTotalMismatch, false);
  assert.equal(line.postsStock, true);
});

test('blueberries 2 x 47.00 equal 94.00 with no mismatch', () => {
  const line = stock('BLUEBERRIES 12X1 HALF PINT');
  assert.ok(line);
  assert.equal(line.quantity, 2);
  assert.equal(line.unit, 'FLAT');
  assert.equal(line.unitCost, 47);
  assert.equal(line.totalCost, 94);
  assert.equal(line.lineTotalMismatch, false);
  assert.equal(line.postsStock, true);
});

test('FUEL SURCHARGE with unit CHRG is a charge and not stock', () => {
  assert.equal(stock('FUEL SURCHARGE'), undefined);
  const charge = model.excludedLines.find((line) => line.name === 'FUEL SURCHARGE');
  assert.ok(charge);
  assert.equal(charge.lineKind, 'charge');
  assert.equal(charge.postsStock, false);
  assert.equal(charge.unit, 'CHRG');
  assert.match(charge.gaps.join(' '), /charge/);
});

test('line amounts sum to the 570.00 subtotal', () => {
  assert.equal(model.subtotal, 570);
  assert.equal(model.subtotalGap, null);
  const stockSum = Number(model.lineItems.reduce((sum, line) => sum + line.totalCost, 0).toFixed(2));
  assert.equal(stockSum, 570);
  assert.equal(model.lineItems.length, 9);
});
