import { shopifyRequest } from "../../lib/shopify.js";
import { decrypt } from "../../lib/crypto.js";
import { getDb } from "../../db/client.js";
import { stores, customers } from "../../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";

const log = createLogger("flow:customer-sync");

interface ShopifyCustomer {
  id: number;
  email: string;
  phone: string | null;
  first_name: string;
  last_name: string;
  orders_count: number;
  total_spent: string;
  email_marketing_consent: { state: string } | null;
  sms_marketing_consent: { state: string } | null;
}

/**
 * Flow 5: Customer Sync
 *
 * Paginates through all customers on initial install.
 * Incremental updates via customer.updated webhook.
 */
export async function syncAllCustomers(storeId: string, shop: string): Promise<void> {
  const db = getDb();
  const store = await db.query.stores.findFirst({
    where: eq(stores.id, storeId),
  });

  if (!store || store.status !== "active") return;

  const accessToken = decrypt(store.shopifyAccessToken);
  let pageInfo: string | null = null;
  let totalSynced = 0;

  do {
    const endpoint: string = pageInfo
      ? `customers.json?limit=250&page_info=${pageInfo}`
      : "customers.json?limit=250";

    const response: { customers: ShopifyCustomer[] } = await shopifyRequest<{ customers: ShopifyCustomer[] }>({
      shop,
      accessToken,
      endpoint,
    });

    for (const c of response.customers) {
      await upsertCustomer(db, storeId, c);
      totalSynced++;
    }

    // Pagination: Shopify uses link-based pagination
    // In production, parse the Link header. Simplified here.
    pageInfo = response.customers.length === 250 ? "next" : null;
    if (response.customers.length < 250) pageInfo = null;
  } while (pageInfo);

  log.info({ storeId, shop, totalSynced }, "Customer sync complete");
}

export async function upsertCustomer(
  db: ReturnType<typeof getDb>,
  storeId: string,
  c: ShopifyCustomer,
): Promise<string> {
  const existing = await db.query.customers.findFirst({
    where: and(
      eq(customers.storeId, storeId),
      eq(customers.shopifyCustomerId, String(c.id)),
    ),
  });

  const emailConsent =
    c.email_marketing_consent?.state === "subscribed" ||
    c.email_marketing_consent?.state === "pending";
  const smsConsent = c.sms_marketing_consent?.state === "subscribed";

  if (existing) {
    await db
      .update(customers)
      .set({
        email: c.email,
        phone: c.phone,
        firstName: c.first_name,
        lastName: c.last_name,
        totalOrders: c.orders_count,
        totalSpent: c.total_spent,
        emailConsent,
        smsConsent,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, existing.id));
    return existing.id;
  }

  const [newCustomer] = await db
    .insert(customers)
    .values({
      storeId,
      shopifyCustomerId: String(c.id),
      email: c.email,
      phone: c.phone,
      firstName: c.first_name,
      lastName: c.last_name,
      totalOrders: c.orders_count,
      totalSpent: c.total_spent,
      emailConsent,
      smsConsent,
    })
    .returning({ id: customers.id });

  return newCustomer!.id;
}
