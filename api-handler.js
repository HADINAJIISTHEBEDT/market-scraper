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

const OWNER_EMAIL = "pazarfiyati@gmail.com";
const FIREBASE_PROJECT_ID = "st-business-86a9b";
const FIREBASE_WEB_API_KEY =
  process.env.FIREBASE_WEB_API_KEY ||
  "AIzaSyA4ZmYg5sTs4gU1Nm25s7of6oqJ4xGpR28";
const OWNER_ADMIN_PASSWORD =
  process.env.OWNER_ADMIN_PASSWORD ||
  process.env.OWNER_PASSWORD ||
  "1";
const DEPLOY_MARK = "ads-settings-20260728d";
const APP_SETTINGS_PATH = path.join(__dirname, "data", "app-settings.json");
const ADS_TXT_BODY =
  "google.com, pub-1598347178644013, DIRECT, f08c47fec0942fa0\n";
// Empty "Disallow:" means allow everything. AdsBot is listed explicitly so
// AdMob verification cannot treat a missing group as blocked.
const ROBOTS_TXT_BODY = `User-agent: *
Disallow:

User-agent: Googlebot
Disallow:

User-agent: AdsBot-Google
Disallow:

User-agent: Mediapartners-Google
Disallow:
`;

let secureTokenCertsCache = null;
let secureTokenCertsFetchedAt = 0;

function normalizeGmail(email) {
  const value = String(email || "")
    .trim()
    .toLowerCase();
  const [local, domain] = value.split("@");
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${String(local || "").replace(/\./g, "")}@gmail.com`;
  }
  return value;
}

function resolvePublicPath(urlPath) {
  const relative = String(urlPath || "")
    .replace(/^\/+/, "")
    .replace(/\.\./g, "");
  return path.join(__dirname, relative || "index.html");
}

function readTextFileOrFallback(fileName, fallback) {
  try {
    return fs.readFileSync(path.join(__dirname, fileName), "utf8");
  } catch (_) {
    return fallback;
  }
}

function textResponse(body, contentType = "text/plain") {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      ...corsHeaders(),
    },
    body: String(body || ""),
  };
}

function readStoredAppSettings() {
  try {
    if (!fs.existsSync(APP_SETTINGS_PATH)) return null;
    const parsed = JSON.parse(fs.readFileSync(APP_SETTINGS_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return null;
  }
}

function writeStoredAppSettings(settings) {
  const dir = path.dirname(APP_SETTINGS_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(APP_SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8");
}

function decodeJwtPart(part) {
  return JSON.parse(Buffer.from(String(part || ""), "base64url").toString("utf8"));
}

async function getSecureTokenCerts() {
  const now = Date.now();
  if (secureTokenCertsCache && now - secureTokenCertsFetchedAt < 60 * 60 * 1000) {
    return secureTokenCertsCache;
  }
  const response = await fetch(
    "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com",
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch Google securetoken certs (${response.status})`);
  }
  secureTokenCertsCache = await response.json();
  secureTokenCertsFetchedAt = now;
  return secureTokenCertsCache;
}

async function verifyFirebaseIdTokenLocally(idToken) {
  const crypto = require("crypto");
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed ID token");
  }

  const header = decodeJwtPart(parts[0]);
  const payload = decodeJwtPart(parts[1]);
  const certs = await getSecureTokenCerts();
  const cert = certs[header.kid];
  if (!cert) {
    throw new Error("Unknown ID token signing key");
  }

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  const signature = Buffer.from(parts[2], "base64url");
  if (!verifier.verify(cert, signature)) {
    throw new Error("ID token signature invalid");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (Number(payload.exp || 0) < nowSec) {
    throw new Error("ID token expired");
  }
  if (String(payload.aud || "") !== FIREBASE_PROJECT_ID) {
    throw new Error("ID token audience mismatch");
  }
  if (
    String(payload.iss || "") !==
    `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`
  ) {
    throw new Error("ID token issuer mismatch");
  }
  if (!payload.sub) {
    throw new Error("ID token missing subject");
  }

  return payload;
}

async function verifyFirebaseIdTokenViaIdentityToolkit(idToken) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(data.users) || !data.users.length) {
    throw new Error(
      data.error?.message || "Invalid or expired auth token",
    );
  }
  return data.users[0];
}

function assertOwnerEmail(email) {
  if (normalizeGmail(email) !== normalizeGmail(OWNER_EMAIL)) {
    throw new HttpError(403, "Only the owner admin can save settings");
  }
}

async function verifyOwnerIdToken(idToken) {
  const token = String(idToken || "").trim();
  if (!token) {
    throw new HttpError(401, "Missing auth token");
  }

  // Prefer Admin SDK when available.
  try {
    const admin = require("firebase-admin");
    if (!admin.apps.length) {
      await initializePushService();
    }
    if (admin.apps.length) {
      const decoded = await admin.auth().verifyIdToken(token);
      assertOwnerEmail(decoded.email);
      return decoded;
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // Fall through when Admin SDK is unavailable/misconfigured.
  }

  // Local JWT verification (works without service account).
  try {
    const payload = await verifyFirebaseIdTokenLocally(token);
    assertOwnerEmail(payload.email);
    if (payload.email_verified === false) {
      throw new HttpError(403, "Owner email is not verified");
    }
    return payload;
  } catch (err) {
    if (err instanceof HttpError) throw err;
  }

  // Identity Toolkit lookup (POST body — avoids tokeninfo URL-length failures).
  try {
    const user = await verifyFirebaseIdTokenViaIdentityToolkit(token);
    assertOwnerEmail(user.email);
    if (user.emailVerified === false) {
      throw new HttpError(403, "Owner email is not verified");
    }
    return user;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(
      401,
      err.message || "Invalid or expired auth token. Sign in again with Google.",
    );
  }
}

function verifyOwnerPassword(body = {}) {
  const password = String(body.ownerPassword || body.password || "").trim();
  if (!password || password !== String(OWNER_ADMIN_PASSWORD)) {
    return null;
  }
  return {
    email: OWNER_EMAIL,
    uid: "owner-password",
    authMethod: "owner-password",
  };
}

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
  // Serve crawler/static text endpoints before initializing Firebase/mail.
  // Always serve the known-good crawler files (do not depend on disk contents).
  if (method === "GET" && urlPath === "/app-ads.txt") {
    return textResponse(ADS_TXT_BODY);
  }

  if (method === "GET" && urlPath === "/ads.txt") {
    return textResponse(ADS_TXT_BODY);
  }

  if (method === "GET" && urlPath === "/robots.txt") {
    return textResponse(ROBOTS_TXT_BODY);
  }

  if (method === "GET" && urlPath === "/app-settings") {
    return jsonResponse(200, {
      ok: true,
      settings: readStoredAppSettings() || {},
      source: fs.existsSync(APP_SETTINGS_PATH) ? "server" : "empty",
      deploy: DEPLOY_MARK,
    });
  }

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
      deploy: DEPLOY_MARK,
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
    const idToken = String(body.idToken || "").trim();
    const settings =
      body.settings && typeof body.settings === "object" ? body.settings : null;
    if (!settings) {
      throw new HttpError(400, "settings are required");
    }

    let decoded = null;
    let authError = null;

    if (idToken) {
      try {
        decoded = await verifyOwnerIdToken(idToken);
      } catch (err) {
        authError = err;
      }
    }

    if (!decoded) {
      decoded = verifyOwnerPassword(body);
    }

    if (!decoded) {
      const message =
        (authError && authError.message) ||
        "Sign in again with Google as pazarfiyati@gmail.com (or send owner password).";
      const status = authError instanceof HttpError ? authError.statusCode : 401;
      return jsonResponse(status, { ok: false, error: message });
    }

    const payload = {
      ...settings,
      updatedAt: new Date().toISOString(),
      updatedBy: decoded.email || OWNER_EMAIL,
    };

    // Always persist on the server so admin save works even when Firestore
    // rules block client writes and FIREBASE_SERVICE_ACCOUNT_JSON is unset.
    writeStoredAppSettings(payload);

    let firestoreSaved = false;
    let firestoreError = null;
    try {
      const admin = require("firebase-admin");
      if (!admin.apps.length) {
        await initializePushService();
      }
      if (admin.apps.length) {
        await admin.firestore().collection("appSettings").doc("global").set(payload, {
          merge: true,
        });
        firestoreSaved = true;
      }
    } catch (err) {
      firestoreError = err.message || "Firestore sync failed";
    }

    return jsonResponse(200, {
      ok: true,
      savedTo: "server",
      firestoreSaved,
      firestoreError,
      deploy: DEPLOY_MARK,
    });
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
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
}

function createNodeRequestListener() {
  return (req, res) => {
    const urlPath = String(req.url || "/").split("?")[0] || "/";

    // AdMob / settings APIs: always go through routeApiRequest so fallbacks work.
    if (
      req.method === "GET" &&
      (urlPath === "/app-ads.txt" ||
        urlPath === "/ads.txt" ||
        urlPath === "/robots.txt" ||
        urlPath === "/app-settings" ||
        urlPath === "/health")
    ) {
      routeApiRequest("GET", urlPath, {})
        .then((response) => {
          res.writeHead(response.statusCode, response.headers);
          res.end(response.body);
        })
        .catch((err) => {
          const response = handleRouteError(err, urlPath);
          res.writeHead(response.statusCode, response.headers);
          res.end(response.body);
        });
      return;
    }

    if (
      req.method === "GET" &&
      (urlPath === "/" || isStaticFileRequest(urlPath))
    ) {
      const normalizedPath = urlPath === "/" ? "/index.html" : urlPath;
      serveStaticFile(res, resolvePublicPath(normalizedPath));
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
