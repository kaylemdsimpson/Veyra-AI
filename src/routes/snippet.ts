import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { stores } from "../db/schema/index.js";
import { createLogger } from "../lib/logger.js";
import { env } from "../config/env.js";
import { evaluateFlowEligibility } from "../lib/flow-eligibility.js";
import type { StoreSettings } from "../db/schema/stores.js";

const log = createLogger("routes:snippet");

/**
 * Snippet Routes
 *
 * - GET /snippet/install   → returns the HTML snippet for the merchant to paste
 * - GET /snippet/v.js      → serves the lightweight client-side tracking script
 * - GET /snippet/status     → returns flow eligibility for a store (dashboard use)
 */
export const snippetRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /snippet/install?storeId=<uuid>
   *
   * Returns the snippet HTML that the merchant pastes into their Shopify theme.
   * Protected: requires dashboard auth (bearer token).
   */
  app.get<{ Querystring: { storeId: string } }>(
    "/install",
    async (request, reply) => {
      const { storeId } = request.query;
      if (!storeId) {
        return reply.status(400).send({ error: "storeId is required" });
      }

      const db = getDb();
      const store = await db.query.stores.findFirst({
        where: eq(stores.id, storeId),
        columns: { id: true, snippetToken: true, shopifyDomain: true, status: true },
      });

      if (!store || store.status !== "active") {
        return reply.status(404).send({ error: "Store not found or inactive" });
      }

      if (!store.snippetToken) {
        return reply.status(400).send({ error: "Snippet token not generated. Re-install the app." });
      }

      const apiBase = env().SHOPIFY_APP_URL || `http://localhost:${env().PORT}`;
      const snippet = [
        `<!-- Veyra Recovery — ${store.shopifyDomain} -->`,
        `<script src="${apiBase}/snippet/v.js" data-veyra-token="${store.snippetToken}" async></script>`,
        `<!-- End Veyra -->`,
      ].join("\n");

      return reply.send({
        snippet,
        token: store.snippetToken,
        domain: store.shopifyDomain,
        instructions: [
          "1. Copy the snippet above",
          "2. In Shopify Admin, go to Online Store → Themes → Edit Code",
          "3. Open theme.liquid",
          "4. Paste the snippet just before the closing </head> tag",
          "5. Save — Veyra is now active on your storefront",
        ],
      });
    },
  );

  /**
   * GET /snippet/v.js
   *
   * Serves the minimal client-side tracking script.
   * This is the only code that runs on the merchant's storefront.
   *
   * What it does:
   *   1. Reads the data-veyra-token from its own <script> tag
   *   2. Listens for cart changes via Shopify AJAX API interception
   *   3. Captures browse events (product page views)
   *   4. POSTs to /ingest/cart-abandon and /ingest/browse-abandon
   *
   * What it does NOT do:
   *   - No flow logic
   *   - No decision-making
   *   - No configuration
   *   - No local storage of sensitive data
   *   - No DOM manipulation beyond reading product data attributes
   */
  app.get("/v.js", async (_request, reply) => {
    const apiBase = env().SHOPIFY_APP_URL || `http://localhost:${env().PORT}`;

    const script = `(function(){
  "use strict";

  // ─── Bootstrap ──────────────────────────────────────────────
  var el = document.currentScript || document.querySelector("script[data-veyra-token]");
  if (!el) return;
  var TOKEN = el.getAttribute("data-veyra-token");
  if (!TOKEN) return;

  var API = ${JSON.stringify(apiBase)};
  var DEBOUNCE_MS = 2000;
  var _timer = null;
  var _lastCartToken = null;
  var _sentBrowse = {};

  // ─── Helpers ────────────────────────────────────────────────
  function post(path, body) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", API + path, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("X-Veyra-Token", TOKEN);
      xhr.send(JSON.stringify(body));
    } catch (e) { /* silent fail — never break the storefront */ }
  }

  // ─── Cart Abandon Detection ─────────────────────────────────
  // Intercept fetch to detect Shopify AJAX cart changes
  function getEmail() {
    // Try to read from Shopify's customer object (logged-in users)
    if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.page) {
      var c = window.ShopifyAnalytics.meta.page.customerId;
      if (c && window.__st && window.__st.cid) return null; // we'll get it from checkout
    }
    // Try checkout fields
    var emailEl = document.getElementById("checkout_email") || document.querySelector("[name='checkout[email]']");
    if (emailEl && emailEl.value) return emailEl.value;
    return null;
  }

  function processCart(cart) {
    if (!cart || !cart.items || cart.items.length === 0) return;
    if (cart.token === _lastCartToken) return;
    _lastCartToken = cart.token;

    clearTimeout(_timer);
    _timer = setTimeout(function() {
      var items = [];
      for (var i = 0; i < cart.items.length; i++) {
        var item = cart.items[i];
        items.push({
          productId: String(item.product_id),
          variantId: String(item.variant_id),
          title: item.product_title || item.title,
          quantity: item.quantity,
          price: (item.final_line_price / 100).toFixed(2)
        });
      }
      post("/ingest/cart-abandon", {
        cartToken: cart.token,
        email: getEmail(),
        cartTotal: (cart.total_price / 100).toFixed(2),
        currency: window.Shopify && window.Shopify.currency && window.Shopify.currency.active || "USD",
        lineItems: items
      });
    }, DEBOUNCE_MS);
  }

  // Intercept fetch() for /cart.js and /cart/change.js etc.
  if (window.fetch) {
    var _origFetch = window.fetch;
    window.fetch = function(url, opts) {
      var result = _origFetch.apply(this, arguments);
      if (typeof url === "string" && /\\/cart(\\/|\\.|$)/.test(url)) {
        result.then(function(response) {
          return response.clone().json();
        }).then(function(data) {
          if (data && (data.items || data.token)) processCart(data);
        }).catch(function(){});
      }
      return result;
    };
  }

  // Intercept XMLHttpRequest for legacy themes
  var _origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._veyraUrl = url;
    return _origOpen.apply(this, arguments);
  };
  var _origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function() {
    var self = this;
    if (typeof self._veyraUrl === "string" && /\\/cart(\\/|\\.|$)/.test(self._veyraUrl)) {
      self.addEventListener("load", function() {
        try {
          var data = JSON.parse(self.responseText);
          if (data && (data.items || data.token)) processCart(data);
        } catch(e) {}
      });
    }
    return _origSend.apply(this, arguments);
  };

  // Initial cart fetch on page load
  try {
    fetch("/cart.js").then(function(r){ return r.json(); }).then(processCart).catch(function(){});
  } catch(e) {}

  // ─── Browse Abandon Detection ───────────────────────────────
  // Detect product page views from Shopify's meta
  function detectBrowse() {
    var meta = window.ShopifyAnalytics && window.ShopifyAnalytics.meta;
    if (!meta || !meta.product) return;

    var product = meta.product;
    var pid = String(product.id);
    if (_sentBrowse[pid]) return;
    _sentBrowse[pid] = true;

    // Generate a session identifier
    var sid = sessionStorage.getItem("_veyra_sid");
    if (!sid) {
      sid = "vs_" + Math.random().toString(36).substr(2, 12) + Date.now().toString(36);
      sessionStorage.setItem("_veyra_sid", sid);
    }

    var email = getEmail();
    if (!email) return; // browse abandons require an email

    post("/ingest/browse-abandon", {
      sessionId: sid,
      email: email,
      products: [{
        productId: pid,
        variantId: String(product.variants && product.variants[0] && product.variants[0].id || ""),
        title: product.title || "",
        price: String(product.price ? (product.price / 100).toFixed(2) : "0.00"),
        imageUrl: product.featured_image || ""
      }]
    });
  }

  // Run browse detection after DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", detectBrowse);
  } else {
    detectBrowse();
  }
})();`;

    return reply
      .type("application/javascript; charset=utf-8")
      .header("Cache-Control", "public, max-age=3600, s-maxage=86400")
      .header("Access-Control-Allow-Origin", "*")
      .send(script);
  });

  /**
   * GET /snippet/status?storeId=<uuid>
   *
   * Returns the flow eligibility evaluation for a store.
   * Used by the dashboard to show which flows are active.
   */
  app.get<{ Querystring: { storeId: string } }>(
    "/status",
    async (request, reply) => {
      const { storeId } = request.query;
      if (!storeId) {
        return reply.status(400).send({ error: "storeId is required" });
      }

      const db = getDb();
      const store = await db.query.stores.findFirst({
        where: eq(stores.id, storeId),
        columns: { id: true, settings: true, snippetToken: true, status: true },
      });

      if (!store) {
        return reply.status(404).send({ error: "Store not found" });
      }

      const settings = store.settings as StoreSettings;
      const flows = evaluateFlowEligibility(settings, {
        smsEnabled: env().ENABLE_SMS,
        whatsappEnabled: env().ENABLE_WHATSAPP,
        holdoutEnabled: env().ENABLE_HOLDOUT_GROUPS,
      });

      const activeCount = flows.filter((f) => f.active).length;

      return reply.send({
        storeId: store.id,
        snippetInstalled: !!store.snippetToken,
        totalFlows: flows.length,
        activeFlows: activeCount,
        inactiveFlows: flows.length - activeCount,
        flows,
      });
    },
  );
};
