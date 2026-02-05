import { getDb } from "../../db/client.js";
import { recoveryLedger } from "../../db/schema/index.js";
import { eq, and, sql } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";

const log = createLogger("flow:fee-calculator");

/**
 * Flow 42: Fee Calculator
 *
 * Calculates Veyra's usage-based fees for a store in a billing period.
 *
 * Fee model: Percentage of recovered revenue (net of discounts).
 * Only charged for billable recoveries (confidence >= 0.50).
 *
 * Fee tiers are applied at the individual recovery level (Flow 41).
 * This service aggregates for reporting.
 */

export interface FeeReport {
  storeId: string;
  billingPeriod: string;
  totalRecoveries: number;
  totalRecoveredRevenue: number;
  totalDiscountsGiven: number;
  totalNetRevenue: number;
  totalFees: number;
  avgConfidence: number;
}

export async function calculateStoreFees(
  storeId: string,
  billingPeriod: string,
): Promise<FeeReport> {
  const db = getDb();

  const entries = await db.query.recoveryLedger.findMany({
    where: and(
      eq(recoveryLedger.storeId, storeId),
      eq(recoveryLedger.billingPeriod, billingPeriod),
    ),
  });

  if (entries.length === 0) {
    return {
      storeId,
      billingPeriod,
      totalRecoveries: 0,
      totalRecoveredRevenue: 0,
      totalDiscountsGiven: 0,
      totalNetRevenue: 0,
      totalFees: 0,
      avgConfidence: 0,
    };
  }

  let totalRecoveredRevenue = 0;
  let totalDiscountsGiven = 0;
  let totalNetRevenue = 0;
  let totalFees = 0;
  let totalConfidence = 0;

  for (const entry of entries) {
    totalRecoveredRevenue += parseFloat(entry.orderTotal);
    totalDiscountsGiven += parseFloat(entry.discountGiven ?? "0");
    totalNetRevenue += parseFloat(entry.netRevenue);
    totalFees += parseFloat(entry.feeAmount);
    totalConfidence += parseFloat(entry.attributionConfidence ?? "0");
  }

  const report: FeeReport = {
    storeId,
    billingPeriod,
    totalRecoveries: entries.length,
    totalRecoveredRevenue: parseFloat(totalRecoveredRevenue.toFixed(2)),
    totalDiscountsGiven: parseFloat(totalDiscountsGiven.toFixed(2)),
    totalNetRevenue: parseFloat(totalNetRevenue.toFixed(2)),
    totalFees: parseFloat(totalFees.toFixed(2)),
    avgConfidence: parseFloat((totalConfidence / entries.length).toFixed(4)),
  };

  log.info({ report }, "Fee report calculated");
  return report;
}
