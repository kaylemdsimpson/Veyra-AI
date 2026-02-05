import { env } from "../config/env.js";
import { createLogger } from "./logger.js";
import { ShopifyApiError } from "./errors.js";

const log = createLogger("shopify-client");

interface ShopifyRequestOptions {
  shop: string;
  accessToken: string;
  endpoint: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
}

/**
 * Low-level Shopify Admin REST API client.
 * Handles rate limiting (retry on 429) and error wrapping.
 */
export async function shopifyRequest<T = unknown>(
  options: ShopifyRequestOptions,
): Promise<T> {
  const { shop, accessToken, endpoint, method = "GET", body } = options;
  const url = `https://${shop}/admin/api/2024-10/${endpoint}`;

  const headers: Record<string, string> = {
    "X-Shopify-Access-Token": accessToken,
    "Content-Type": "application/json",
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 429) {
      const retryAfter = parseFloat(response.headers.get("Retry-After") ?? "2");
      log.warn({ shop, endpoint, retryAfter }, "Shopify rate limited, retrying");
      await sleep(retryAfter * 1000);
      continue;
    }

    if (!response.ok) {
      const errorBody = await response.text();
      log.error({ shop, endpoint, status: response.status, errorBody }, "Shopify API error");
      throw new ShopifyApiError(
        `Shopify API ${response.status}: ${endpoint}`,
        errorBody,
      );
    }

    return (await response.json()) as T;
  }

  throw new ShopifyApiError(`Shopify API rate limit exceeded after retries: ${endpoint}`);
}

/**
 * Shopify GraphQL Admin API client.
 */
export async function shopifyGraphQL<T = unknown>(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const url = `https://${shop}/admin/api/2024-10/graphql.json`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new ShopifyApiError(`Shopify GraphQL error: ${response.status}`, errorBody);
  }

  const result = await response.json() as { data: T; errors?: unknown[] };
  if (result.errors?.length) {
    throw new ShopifyApiError("Shopify GraphQL errors", result.errors);
  }

  return result.data;
}

/**
 * Build Shopify OAuth authorization URL.
 */
export function buildAuthUrl(shop: string, nonce: string): string {
  const config = env();
  const redirectUri = `${config.SHOPIFY_APP_URL}/auth/shopify/callback`;
  const scopes = config.SHOPIFY_SCOPES;
  return (
    `https://${shop}/admin/oauth/authorize?` +
    `client_id=${config.SHOPIFY_API_KEY}` +
    `&scope=${scopes}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${nonce}`
  );
}

/**
 * Exchange authorization code for access token.
 */
export async function exchangeToken(
  shop: string,
  code: string,
): Promise<{ access_token: string; scope: string }> {
  const config = env();
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.SHOPIFY_API_KEY,
      client_secret: config.SHOPIFY_API_SECRET,
      code,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new ShopifyApiError(`Token exchange failed: ${response.status}`, errorBody);
  }

  return response.json() as Promise<{ access_token: string; scope: string }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
