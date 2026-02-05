import { getDb } from "../../db/client.js";
import { recoveryLedger } from "../../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { isBillable } from "../40-confidence-scoring/service.js";

const log = createLogger("flow:recovery-ledger");

/**
 * Flow 41: Recovery Ledger Writer
 *
 * Writes a financial record for each attributed recovery.
 * The ledger is the single source of truth for:
 *  - Revenue recovered
 *  - Discounts given
 *  - Veyra fees owed
 *  - Attribution quality
 *
 * Only billable recoveries (confidence >= 0.50) generate fee records.
 */

// Veyra fee structure: percentage of recovered revenue
const FEE_TIERS = [
  { maxRevenue: 1000, feePercent: 5 },    // First $1k: 5%
  { maxRevenue: 10000, feePercent: 4 },   // $1k-$10k: 4%
  { maxRevenue: Infinity, feePercent: 3 }, // $10k+: 3%
];

export interface LedgerInput {
  storeId: string;
  abandonId: string;
  orderId: string;
  orderTotal: string;
  currency: string;
  discountGiven: string;
  attributionConfidence: number;
  attributionSource: string;
}

export async function writeLedgerEntry(input: LedgerInput): Promise<void> {
  const db = getDb();

  // Don't create fee records for low-confidence attributions
  const billable = isBillable(input.attributionConfidence);

  const orderTotal = parseFloat(input.orderTotal);
  const discountGiven = parseFloat(input.discountGiven);
  const netRevenue = orderTotal - discountGiven;

  // Calculate fee
  const feePercent = billable ? calculateFeePercent(netRevenue) : 0;
  const feeAmount = billable ? parseFloat((netRevenue * (feePercent / 100)).toFixed(2)) : 0;

  // Billing period (YYYY-MM)
  const now = new Date();
  const billingPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Check for duplicate (idempotency)
  const existing = await db.query.recoveryLedger.findFirst({
    where: and(
      eq(recoveryLedger.storeId, input.storeId),
      eq(recoveryLedger.orderId, input.orderId),
    ),
  });

  if (existing) {
    log.debug({ orderId: input.orderId }, "Ledger entry already exists");
    return;
  }

  await db.insert(recoveryLedger).values({
    storeId: input.storeId,
    abandonId: input.abandonId,
    orderId: input.orderId,
    orderTotal: input.orderTotal,
    currency: input.currency,
    discountGiven: input.discountGiven,
    netRevenue: netRevenue.toFixed(2),
    feePercent: feePercent.toFixed(2),
    feeAmount: feeAmount.toFixed(2),
    attributionConfidence: input.attributionConfidence.toFixed(4),
    attributionSource: input.attributionSource,
    billingPeriod,
    recoveredAt: now,
  });

  log.info(
    {
      storeId: input.storeId,
      orderId: input.orderId,
      netRevenue,
      feeAmount,
      confidence: input.attributionConfidence,
      billable,
    },
    "Ledger entry written",
  );
}

function calculateFeePercent(netRevenue: number): number {
  // Simple tier lookup
  for (const tier of FEE_TIERS) {
    if (netRevenue <= tier.maxRevenue) return tier.feePercent;
  }
  return FEE_TIERS[FEE_TIERS.length - 1]!.feePercent;
}
