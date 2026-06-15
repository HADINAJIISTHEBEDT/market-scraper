"use strict";

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

const MAIL_COLLECTION = "mail";
const processing = new Set();

let initialized = false;
let initError = null;
let firestore = null;
let transporter = null;
let mailListener = null;

function envString(name) {
  return String(process.env[name] || "").trim();
}

function log(message, extra) {
  if (extra !== undefined) {
    console.log(`[Mail] ${message}`, extra);
    return;
  }
  console.log(`[Mail] ${message}`);
}

function readServiceAccountFromEnv() {
  const rawJson = envString("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (rawJson) {
    return JSON.parse(rawJson);
  }

  const rawBase64 = envString("FIREBASE_SERVICE_ACCOUNT_BASE64");
  if (rawBase64) {
    return JSON.parse(Buffer.from(rawBase64, "base64").toString("utf8"));
  }

  const configuredPath =
    envString("FIREBASE_SERVICE_ACCOUNT_PATH") ||
    path.join(__dirname, "serviceAccountKey.json");

  if (fs.existsSync(configuredPath)) {
    return JSON.parse(fs.readFileSync(configuredPath, "utf8"));
  }

  return null;
}

function isMailConfigured() {
  return Boolean(transporter);
}

function isMailQueueConfigured() {
  return Boolean(transporter && firestore);
}

function getMailStatus() {
  return {
    supported: isMailConfigured(),
    queueSupported: isMailQueueConfigured(),
    from: envString("MAIL_FROM") || envString("SMTP_USER") || null,
    reason: initError
      ? initError.message
      : !transporter
        ? "Set SMTP_USER and SMTP_PASS on Render"
        : null,
  };
}

function buildTransporter() {
  const user = envString("SMTP_USER") || envString("GMAIL_USER");
  const pass = envString("SMTP_PASS") || envString("GMAIL_APP_PASSWORD");
  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host: envString("SMTP_HOST") || "smtp.gmail.com",
    port: Number(envString("SMTP_PORT") || 587),
    secure: envString("SMTP_SECURE") === "true",
    auth: { user, pass },
  });
}

async function markInboxEmailSent(deleteRequestId, sentAt, inboxEntryId) {
  const docId = String(inboxEntryId || deleteRequestId || "").trim();
  if (!firestore || !docId) return;
  await firestore.doc(`adminInbox/${docId}`).set(
    {
      emailSentAt: sentAt,
      emailDeliveryError: "",
    },
    { merge: true },
  );
}

async function markInboxEmailFailed(deleteRequestId, errorMessage, inboxEntryId) {
  const docId = String(inboxEntryId || deleteRequestId || "").trim();
  if (!firestore || !docId) return;
  const ref = firestore.doc(`adminInbox/${docId}`);
  const snap = await ref.get();
  if (snap.exists() && snap.data()?.emailSentAt) return;
  await ref.set(
    {
      emailDeliveryError: String(errorMessage || "Email send failed"),
    },
    { merge: true },
  );
}

function getFromAddress() {
  return (
    envString("MAIL_FROM") ||
    envString("SMTP_USER") ||
    envString("GMAIL_USER")
  );
}

async function processMailDoc(docSnap) {
  const docId = docSnap.id;
  if (processing.has(docId)) return;

  const data = docSnap.data() || {};
  const deliveryState = data.delivery?.state;
  if (deliveryState === "SUCCESS" || deliveryState === "PROCESSING") return;
  if (!transporter) {
    const errorMessage = initError?.message || "SMTP not configured on server";
    await docSnap.ref.set(
      {
        delivery: {
          state: "ERROR",
          error: errorMessage,
          endTime: new Date().toISOString(),
        },
      },
      { merge: true },
    );
    await markInboxEmailFailed(data.deleteRequestId, errorMessage, data.inboxEntryId);
    return;
  }

  const to = Array.isArray(data.to) ? data.to[0] : data.to;
  const subject = String(data.message?.subject || "").trim();
  const text = String(data.message?.text || "").trim();
  const html = String(data.message?.html || "").trim();
  if (!to || !subject || (!text && !html)) {
    await docSnap.ref.set(
      {
        delivery: {
          state: "ERROR",
          error: "Missing to, subject, or body",
          endTime: new Date().toISOString(),
        },
      },
      { merge: true },
    );
    return;
  }

  processing.add(docId);
  const startedAt = new Date().toISOString();
  await docSnap.ref.set(
    {
      delivery: {
        state: "PROCESSING",
        startTime: startedAt,
        attempts: Number(data.delivery?.attempts || 0) + 1,
      },
    },
    { merge: true },
  );

  try {
    const from = getFromAddress();
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text: text || undefined,
      html: html || undefined,
    });
    const sentAt = new Date().toISOString();
    await docSnap.ref.set(
      {
        delivery: {
          state: "SUCCESS",
          startTime: startedAt,
          endTime: sentAt,
          messageId: info.messageId || null,
          attempts: Number(data.delivery?.attempts || 0) + 1,
        },
        emailSentAt: sentAt,
      },
      { merge: true },
    );
    await markInboxEmailSent(data.deleteRequestId, sentAt, data.inboxEntryId);
    log(`Sent mail ${docId} to ${to}`);
  } catch (err) {
    log(`Failed to send mail ${docId}`, err.message);
    await docSnap.ref.set(
      {
        delivery: {
          state: "ERROR",
          startTime: startedAt,
          endTime: new Date().toISOString(),
          error: err.message,
          attempts: Number(data.delivery?.attempts || 0) + 1,
        },
      },
      { merge: true },
    );
    await markInboxEmailFailed(data.deleteRequestId, err.message, data.inboxEntryId);
  } finally {
    processing.delete(docId);
  }
}

async function processPendingMail() {
  if (!firestore || !transporter) return;

  const snapshot = await firestore.collection(MAIL_COLLECTION).get();
  const pending = snapshot.docs.filter((docSnap) => {
    const state = docSnap.data()?.delivery?.state;
    return state !== "SUCCESS" && state !== "PROCESSING";
  });

  for (const docSnap of pending) {
    await processMailDoc(docSnap);
  }
}

function startMailListener() {
  if (!firestore || mailListener) return;

  mailListener = firestore.collection(MAIL_COLLECTION).onSnapshot(
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added" || change.type === "modified") {
          void processMailDoc(change.doc);
        }
      });
    },
    (err) => {
      log("Mail listener error", err.message);
    },
  );
}

async function sendAccountEmail(payload) {
  const to = String(payload?.to || "").trim();
  const subject = String(payload?.subject || "").trim();
  const text = String(payload?.text || "").trim();
  const html = String(payload?.html || "").trim();
  const deleteRequestId = String(payload?.deleteRequestId || "").trim();
  const inboxEntryId = String(payload?.inboxEntryId || "").trim();

  if (!to || !subject || (!text && !html)) {
    throw new Error("Missing to, subject, or body");
  }
  if (!transporter) {
    throw new Error(initError?.message || "SMTP not configured. Set SMTP_USER and SMTP_PASS on Render.");
  }

  const startedAt = new Date().toISOString();
  const info = await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject,
    text: text || undefined,
    html: html || undefined,
  });
  const sentAt = new Date().toISOString();

  if (firestore) {
    await firestore.collection(MAIL_COLLECTION).doc(`sent-${deleteRequestId || "manual"}-${Date.now()}`).set({
      to,
      message: { subject, text, html },
      deleteRequestId: deleteRequestId || null,
      delivery: {
        state: "SUCCESS",
        startTime: startedAt,
        endTime: sentAt,
        messageId: info.messageId || null,
        attempts: 1,
      },
      emailSentAt: sentAt,
      sentAt,
    });
  }

  if ((deleteRequestId || inboxEntryId) && firestore) {
    await markInboxEmailSent(deleteRequestId, sentAt, inboxEntryId);
  }

  log(`Sent mail directly to ${to}`);
  return { ok: true, sentAt, messageId: info.messageId || null };
}

async function initializeMailService() {
  if (initialized) return;
  initialized = true;

  try {
    transporter = buildTransporter();
    if (!transporter) {
      log("SMTP is not configured; queued admin emails will not be delivered.");
      return;
    }

    const serviceAccount = readServiceAccountFromEnv();
    if (!serviceAccount) {
      log("Firebase service account is not configured; mail queue will not run.");
      return;
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    firestore = admin.firestore();
    try {
      await transporter.verify();
    } catch (verifyError) {
      log("SMTP verify warning (will still try to send)", verifyError.message);
    }
    startMailListener();
    await processPendingMail();
    log("Mail service initialized");
  } catch (err) {
    initError = err;
    log("Failed to initialize mail service", err.message);
  }
}

module.exports = {
  initializeMailService,
  getMailStatus,
  isMailConfigured,
  processPendingMail,
  sendAccountEmail,
};
