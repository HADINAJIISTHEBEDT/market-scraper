"use strict";

const fs = require("fs");
const path = require("path");
const {
  compareIngredients,
  searchProduct,
  searchMultiple,
} = require("./scraper");
const {
  initializePushService,
  getPushStatus,
  sendTestNotification,
  scheduleNotification,
  cancelNotification,
} = require("./push-service");
const {
  initializeMailService,
  getMailStatus,
  processPendingMail,
  sendAccountEmail,
} = require("./mail-service");
const { processExpiredUnpaidOrders } = require("./order-expiry-service");

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
};

class HttpError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function jsonResponse(statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  };
}

function notFoundPayload(urlPath) {
  return { error: "not found", path: urlPath };
}

function parseRequestBody(rawBody) {
  if (!rawBody) return {};
  if (typeof rawBody === "object") return rawBody;

  try {
    return JSON.parse(rawBody);
  } catch (err) {
    throw new HttpError(400, "invalid json");
  }
}

function normalizeMarket(value) {
  const market = String(value || "")
    .trim()
    .toLowerCase();
  return market;
}

async function routeApiRequest(method, urlPath, body) {
  await initializePushService();
  await initializeMailService();

  if (method === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (method === "GET" && urlPath === "/health") {
    const mail = getMailStatus();
    return jsonResponse(200, {
      status: "ok",
      push: getPushStatus().supported,
      mail: mail.supported,
      mailFrom: mail.from,
      mailError: mail.reason,
      timestamp: Date.now(),
    });
  }

  if (method === "GET" && urlPath === "/push-public-key") {
    const push = getPushStatus();
    if (!push.publicKey) {
      return jsonResponse(503, {
        error: push.reason || "push notifications are not configured",
        supported: false,
      });
    }

    return jsonResponse(200, push);
  }

  if (method !== "POST") {
    throw new HttpError(404, "not found", notFoundPayload(urlPath));
  }

  if (urlPath === "/compare") {
    const ingredients = Array.isArray(body.ingredients) ? body.ingredients : [];
    if (!ingredients.length) {
      throw new HttpError(400, "ingredients array is required");
    }
    return jsonResponse(200, await compareIngredients(ingredients));
  }

  if (urlPath === "/search") {
    const product = String(body.product || "").trim();
    const market = normalizeMarket(body.market);
    if (!product) {
      throw new HttpError(400, "product name is required");
    }
    if (
      !["bim", "sok", "migros", "tahtakale", "carrefour"].includes(
        market,
      )
    ) {
      throw new HttpError(
        400,
        "market must be bim, sok, migros, tahtakale, or carrefour",
      );
    }
    return jsonResponse(
      200,
      (await searchProduct(product, market)) || { error: "No product found" },
    );
  }

  if (urlPath === "/search-all") {
    const product = String(body.product || "").trim();
    if (!product) {
      throw new HttpError(400, "product name is required");
    }
    return jsonResponse(200, await searchMultiple(product));
  }

  if (urlPath === "/push-test") {
    return jsonResponse(200, await sendTestNotification(body));
  }

  if (urlPath === "/push-schedule") {
    return jsonResponse(200, await scheduleNotification(body));
  }

  if (urlPath === "/push-cancel") {
    return jsonResponse(200, await cancelNotification(body));
  }

  if (urlPath === "/mail-process") {
    await processPendingMail();
    return jsonResponse(200, { ok: true, mail: getMailStatus() });
  }

  if (urlPath === "/send-account-email") {
    try {
      const result = await sendAccountEmail(body);
      return jsonResponse(200, result);
    } catch (err) {
      return jsonResponse(503, {
        ok: false,
        error: err.message || "Email send failed",
        mail: getMailStatus(),
      });
    }
  }

  if (urlPath === "/process-expired-orders") {
    try {
      const result = await processExpiredUnpaidOrders(body || {});
      return jsonResponse(200, result);
    } catch (err) {
      return jsonResponse(500, {
        ok: false,
        error: err.message || "Expired order processing failed",
      });
    }
  }


  if (urlPath === "/admin-save-settings") {
    const admin = require("firebase-admin");
    const OWNER_EMAIL = "pazarfiyati@gmail.com";

    function normalizeGmail(email) {
      const value = String(email || "").trim().toLowerCase();
      const [local, domain] = value.split("@");
      if (domain === "gmail.com" || domain === "googlemail.com") {
        return local.replace(/\./g, "") + "@gmail.com";
      }
      return value;
    }

    // Ensure admin app is initialized (push/mail services usually do this).
    if (!admin.apps.length) {
      await initializePushService();
    }
    if (!admin.apps.length) {
      return jsonResponse(503, {
        ok: false,
        error: "Firebase Admin is not configured on the server (FIREBASE_SERVICE_ACCOUNT_JSON)",
      });
    }

    const idToken = String(body.idToken || "").trim();
    const settings = body.settings && typeof body.settings === "object" ? body.settings : null;
    if (!idToken || !settings) {
      throw new HttpError(400, "idToken and settings are required");
    }

    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      return jsonResponse(401, { ok: false, error: "Invalid or expired auth token" });
    }

    if (normalizeGmail(decoded.email) !== normalizeGmail(OWNER_EMAIL)) {
      return jsonResponse(403, { ok: false, error: "Only the owner admin can save settings" });
    }

    const db = admin.firestore();
    await db.collection("appSettings").doc("global").set(
      {
        ...settings,
        updatedAt: new Date().toISOString(),
        updatedBy: decoded.email || OWNER_EMAIL,
      },
      { merge: true },
    );

    return jsonResponse(200, { ok: true });
  }

  throw new HttpError(404, "not found", notFoundPayload(urlPath));
}

function handleRouteError(err, urlPath) {
  if (err instanceof HttpError) {
    return jsonResponse(
      err.statusCode,
      err.details || { error: err.message, path: urlPath },
    );
  }

  const statusCode = Number(err?.statusCode || 500);
  const payload =
    statusCode >= 500
      ? { error: err?.message || "internal error", path: urlPath }
      : { error: err?.message || "request failed", path: urlPath };

  return jsonResponse(statusCode, payload);
}

function isStaticFileRequest(urlPath) {
  return Boolean(MIME[path.extname(urlPath)]);
}

function serveStaticFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      const response = jsonResponse(404, { error: "not found" });
      res.writeHead(response.statusCode, response.headers);
      res.end(response.body);
      return;
    }

    res.writeHead(200, {
      "Content-Type":
        MIME[path.extname(filePath)] || "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(data);
  });
}

function createNodeRequestListener() {
  return (req, res) => {
    const urlPath = String(req.url || "/").split("?")[0] || "/";

    // AdMob / crawlers must always get these plain-text files.
    if (
      req.method === "GET" &&
      (urlPath === "/app-ads.txt" ||
        urlPath === "/ads.txt" ||
        urlPath === "/robots.txt")
    ) {
      serveStaticFile(res, path.join(__dirname, urlPath));
      return;
    }

    if (
      req.method === "GET" &&
      (urlPath === "/" || isStaticFileRequest(urlPath))
    ) {
      const normalizedPath = urlPath === "/" ? "/index.html" : urlPath;
      serveStaticFile(res, path.join(__dirname, normalizedPath));
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const response = await routeApiRequest(
          req.method || "GET",
          urlPath,
          parseRequestBody(body),
        );
        res.writeHead(response.statusCode, response.headers);
        res.end(response.body);
      } catch (err) {
        const response = handleRouteError(err, urlPath);
        res.writeHead(response.statusCode, response.headers);
        res.end(response.body);
      }
    });
  };
}

async function handleNetlifyEvent(event) {
  const method = event.httpMethod || "GET";
  let urlPath = event.rawPath || event.path || "/";

  urlPath = urlPath.replace(/^.*\.netlify\/functions\/api/, "");
  if (!urlPath.startsWith("/")) {
    urlPath = `/${urlPath}`;
  }
  urlPath = urlPath.split("?")[0];

  try {
    const body =
      event.isBase64Encoded && event.body
        ? Buffer.from(event.body, "base64").toString("utf8")
        : event.body;
    return await routeApiRequest(method, urlPath, parseRequestBody(body));
  } catch (err) {
    return handleRouteError(err, urlPath);
  }
}

module.exports = {
  createNodeRequestListener,
  handleNetlifyEvent,
  routeApiRequest,
};
