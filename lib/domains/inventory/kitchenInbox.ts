/** Positive Rescue into production prep. The matching negative floor leg is not a receipt. */
export function isInboundProductionTransfer(row: {
  transactionType: string;
  toLocation: string;
  qtyChange: number;
}): boolean {
  return row.transactionType === 'Rescue' && row.toLocation === 'Kitchen_Prep' && row.qtyChange > 0;
}
