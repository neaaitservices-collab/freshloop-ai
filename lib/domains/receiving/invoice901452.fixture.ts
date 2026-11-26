import { interpretInvoiceOcrModel } from '@/lib/domains/receiving/invoiceOcrModel';
import {
  codesIfUnfiltered,
  mergeReadPages,
  type InvoicePageLine,
  type ScanPageState,
} from '@/lib/domains/receiving/invoicePageScan';

/** Tony Deodato & Sons invoice 901452, Tuesday Nov 17 2026. Ordered, shipped, unit, description, code, unit price, amount. */
export const INVOICE_901452_PAGE1: Array<[number, number, string, string, string, number, number]> = [
  [1, 1, 'CASE', 'YELLOW FINGERLING 25LB', 'POFY25', 68.0, 68.0],
  [1, 1, 'CASE', 'ORGANIC BANANA', 'VOBA02', 53.25, 53.25],
  [4, 0, 'CASE', 'AVOCADO 36CT', 'AV36', 0, 0],
  [1, 0, 'CASE', 'BUNCH TOP CARROTS', 'CA7B', 0, 0],
  [2, 2, 'CASE', '15KG CLEMENTINES', 'CL3C', 54.5, 109.0],
  [1, 0, 'CASE', 'DRAGON FRUIT', 'DR1C', 0, 0],
  [3, 0, 'CASE', 'FIGS', 'FI2C', 0, 0],
  [1, 1, 'CASE', '32 RED GRAPEFRUIT', 'GFR32', 49.5, 49.5],
  [1, 0, 'BAG', '5LB HORSERADISH ROOT PRODUCT OF USA', 'HO5C', 0, 0],
  [1, 1, 'CASE', 'LEMONS 90/95', 'LEM95', 33.25, 33.25],
  [1, 1, 'CASE', 'MANGOES', 'MA1C', 15.5, 15.5],
  [3, 0, 'CASE', 'ATAULFO MANGOES', 'MAN1S', 0, 0],
  [1, 0, 'CASE', 'MAITAKE MUSHROOM 6x150gm', 'MU9W3', 0, 0],
  [1, 1, 'CASE', 'GOLDEN RIPE PINEAPPLE', 'PI7C', 25.75, 25.75],
  [1, 1, 'CASE', 'POMEGRANATE', 'PO54C', 20.75, 20.75],
  [1, 0, 'CASE', 'RADISH RED 2 DOZ', 'RAD002', 0, 0],
  [1, 1, 'CASE', 'ANISE', 'AN1C', 53.25, 53.25],
  [1, 1, 'CASE', 'ASPARAGUS 11LB', 'AS1C', 69.5, 69.5],
  [2, 2, 'CASE', "BROCCOLI 18'S", 'BR1J', 37.25, 74.5],
  [1, 1, 'BAG', '10LB RAINBOW CARROT PRODUCT OF USA NO.1 GRADE', 'CA8Y', 20.0, 20.0],
  [1, 1, 'CASE', 'RED CABBAGE CASE', 'CAB4C', 22.75, 22.75],
  [1, 1, 'CASE', 'CELERY 24', 'CE1C', 44.5, 44.5],
  [2, 2, 'CASE', 'GRAPES GREEN SEEDLESS', 'GR01C', 67.5, 135.0],
  [1, 1, 'CASE', 'GRAPES RED SEEDLESS', 'GR02C', 57.0, 57.0],
  [1, 0, 'CASE', 'BLACK KALE', 'KA5C', 0, 0],
  [1, 0, 'CASE', 'RED KALE', 'KAL200', 0, 0],
  [1, 1, 'CASE', 'LEEKS', 'LEE1C', 35.25, 35.25],
  [1, 0, 'CASE', 'RED LEAF LETTUCE', 'LETR', 0, 0],
  [1, 1, 'BOX', 'MUSHROOMS', 'MU1B', 15.85, 15.85],
  [1, 1, 'CASE', 'SUGAR PEAS', 'SN2C', 67.5, 67.5],
  [1, 1, 'CASE', 'ROMAINE USA PRODUCT OF USA', 'RO1U', 56.75, 56.75],
  [3, 3, 'FLAT', '8x1LB USA TUB STRAWBERRIES', 'ST1F', 77.0, 231.0],
  [1, 1, 'BOX', 'SHITAKE MUSHROOMS', 'MU4B', 25.25, 25.25],
  [1, 1, 'BOX', 'OYSTER MUSHROOMS', 'MU5B', 15.65, 15.65],
  [1, 1, 'BOX', 'WINDMILLS BROWN MUSHROOMS', 'MU6B', 17.5, 17.5],
  [1, 1, 'CASE', 'GREEN ONIONS', 'ON11C', 44.5, 44.5],
  [1, 1, 'CASE', 'ITALIAN PARSLEY 5 DOZEN', 'PA3A', 44.0, 44.0],
  [1, 1, 'CASE', 'RADICCHIO', 'RA3C', 28.25, 28.25],
  [2, 2, 'CASE', 'RED VINE CLUSTER TOMATOES', 'TO31D', 47.0, 94.0],
  [1, 1, 'CASE', 'GRAPE TOMATO MEDLEY 12x1', 'TO37D', 47.25, 47.25],
  [2, 2, 'CASE', 'TOMATO HH 20 SIZE', 'TOH20', 52.0, 104.0],
];

export const INVOICE_901452_PAGE2: Array<[number, number, string, string, string, number, number]> = [
  [1, 0, 'CASE', 'SAPORI TOMATO 10x1LB', 'TOSAP', 0, 0],
  [1, 1, 'BAG', 'BAG BASIL', 'BAS1F', 14.0, 14.0],
  [2, 2, 'CASE', 'ENGLISH CUCUMBER LARGE', 'CUE5C', 22.75, 45.5],
  [1, 1, 'CASE', 'MINT', 'MI1C', 32.0, 32.0],
  [1, 0, 'CASE', 'PEPPERS SWEET POINT 12x1lb', 'PESP', 0, 0],
  [1, 1, 'BAG', 'ESCHALLOTS PRODUCT OF CANADA', 'ESC1B', 13.75, 13.75],
  [1, 1, 'BAG', 'RED ONION JUMBO', 'ON06A', 24.51, 24.51],
  [1, 0, 'BAG', "USA YUKON GOLD 'A' POTATO", 'PO45F', 0, 0],
  [2, 2, 'EACH', 'SIZE 4 WATERMELON SEEDLESS PRODUCT OF USA', 'WAT4E', 10.75, 21.5],
  [1, 1, 'CASE', 'CRIPPS PINK 80/88', 'APCR3C', 92.0, 92.0],
  [2, 2, 'FLAT', 'BLUEBERRIES 12X1 HALF PINT', 'BL1FH', 45.75, 91.5],
  [1, 1, 'FLAT', 'BLACKBERRIES 1/2 PINTS', 'BL2C', 26.25, 26.25],
  [1, 1, 'FLAT', 'RASPBERRIES', 'RA5F', 52.0, 52.0],
  [1, 1, 'BAG', 'SAGE', 'SA1C', 17.75, 17.75],
  [1, 1, 'BAG', 'THYME', 'TH1', 14.0, 14.0],
  [1, 1, 'CHRG', 'FUEL SURCHARGE', 'FUEL', 0, 0],
  [1, 0, 'XXXX', 'SEE COMMENT LINE', 'XCALL', 0, 0],
];

export const INVOICE_901452_TOTAL = 2123.01;
export const INVOICE_901452_POSTED_LINES = 42;

function rawPage(
  rows: Array<[number, number, string, string, string, number, number]>,
  invoiceNumber: string
) {
  return {
    vendorName: 'Tony Deodato & Sons',
    invoiceNumber,
    invoiceDate: '2026-11-17',
    subtotal: INVOICE_901452_TOTAL,
    lineItems: rows.map(([ordered, shipped, unit, name, code, unitCost, totalCost]) => ({
      name,
      code,
      department: 'PRODUCE',
      ordered,
      shipped,
      quantity: shipped,
      unit,
      unitCost,
      totalCost,
    })),
  };
}

function readPage(
  rows: Array<[number, number, string, string, string, number, number]>,
  invoiceNumber: string,
  index: number
): ScanPageState {
  const raw = rawPage(rows, invoiceNumber);
  const model = interpretInvoiceOcrModel(raw);
  const codes = codesIfUnfiltered(raw, model.lineItems.length);
  const lines: InvoicePageLine[] = model.lineItems.map((line, lineIndex) => ({
    page: index,
    name: line.name,
    ...(codes[lineIndex] ? { code: codes[lineIndex] } : {}),
    quantity: line.quantity,
    unit: line.unit,
    unitCost: line.unitCost,
    totalCost: line.totalCost,
    department: line.department,
    departmentAssumed: line.departmentAssumed,
    casePackSize: line.casePackSize,
    subUnit: line.subUnit,
  }));
  return {
    index,
    status: 'read',
    attempt: 1,
    updatedAt: '2026-11-17T16:00:00.000Z',
    vendorName: model.vendorName,
    invoiceNumber: model.invoiceNumber,
    invoiceDate: model.invoiceDate,
    subtotal: model.subtotal ?? undefined,
    lines,
  };
}

/** Page scan states after both pages of invoice 901452 have been read. */
export function invoice901452Pages(): ScanPageState[] {
  return [
    readPage(INVOICE_901452_PAGE1, '901452 01', 1),
    readPage(INVOICE_901452_PAGE2, '901452 02', 2),
  ];
}

export function invoice901452MergedLines(): InvoicePageLine[] {
  return mergeReadPages(invoice901452Pages()).lines;
}
