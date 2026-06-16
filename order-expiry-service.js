"use strict";

const admin = require("firebase-admin");
const { sendAccountEmail } = require("./mail-service");

function getFirestore() {
  if (!admin.apps.length) return null;
  return admin.firestore();
}

function formatOrderNumber(value) {
  if (value == null || value === "") return "";
  const raw = String(value).trim();
  if (!raw) return "";
  return raw.startsWith("#") ? raw : `#${raw}`;
}

async function archiveOrderConversationServer(firestore, orderId, order, reason) {
  const messagesSnap = await firestore
    .collection("orderChats")
    .doc(String(orderId))
    .collection("messages")
    .orderBy("createdAt", "asc")
    .get();
  const messages = messagesSnap.docs.map((entry) => ({
    id: entry.id,
    ...entry.data(),
  }));
  if (!messages.length) return;
  const now = new Date().toISOString();
  await firestore.collection("orderConversations").doc(String(orderId)).set(
    {
      orderId: String(orderId),
      orderNumber: order.orderNumber != null ? order.orderNumber : "",
      userId: String(order.userId || ""),
      userName: String(order.userName || ""),
      userEmail: String(order.userEmail || ""),
      marketId: String(order.marketId || ""),
      marketName: String(order.marketName || ""),
      driverName: String(order.driver?.name || ""),
      messages,
      messageCount: messages.length,
      archivedAt: now,
      archiveReason: String(reason || "archived"),
      updatedAt: now,
    },
    { merge: true },
  );
}

async function sendPaymentTimeoutEmail(order) {
  const email = String(order.userEmail || "").trim();
  if (!email) return { skipped: true, reason: "no_email" };

  const name = String(order.userName || "Customer").trim() || "Customer";
  const orderNo = formatOrderNumber(order.orderNumber);
  const subject = orderNo
    ? `Order ${orderNo} cancelled — payment not received`
    : "Your order was cancelled — payment not received";
  const text = `Hello ${name},

Your order${orderNo ? ` ${orderNo}` : ""} was automatically cancelled because payment was not completed within 20 minutes.

You can place a new order anytime from the app.

Pazar Fiyati`;

  const html = `
    <p>Hello ${name},</p>
    <p>Your order${orderNo ? ` <strong>${orderNo}</strong>` : ""} was automatically cancelled because payment was not completed within <strong>20 minutes</strong>.</p>
    <p>You can place a new order anytime from the app.</p>
    <p>Pazar Fiyati</p>
  `;

  await sendAccountEmail({ to: email, subject, text, html });
  return { sent: true };
}

async function cancelExpiredOrderDoc(docSnap) {
  const firestore = getFirestore();
  if (!firestore) throw new Error("Firestore not available on server");

  const orderId = docSnap.id;
  const order = docSnap.data() || {};
  if (order.paidAt || order.paymentMethod) return { cancelled: false, reason: "already_paid" };
  if (order.paymentCancellationProcessed) return { cancelled: false, reason: "already_processed" };

  const deadline = order.paymentDeadline ? new Date(order.paymentDeadline).getTime() : 0;
  if (!deadline || Date.now() <= deadline) {
    return { cancelled: false, reason: "not_expired" };
  }

  await docSnap.ref.set(
    {
      paymentCancellationProcessed: true,
      cancelledAt: new Date().toISOString(),
      cancelReason: "payment_timeout",
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  await archiveOrderConversationServer(firestore, orderId, order, "payment_timeout");

  let emailResult = { skipped: true };
  try {
    emailResult = await sendPaymentTimeoutEmail(order);
  } catch (error) {
    console.error("[OrderExpiry] Payment timeout email failed", orderId, error.message);
    emailResult = { error: error.message };
  }

  await docSnap.ref.delete();
  return { cancelled: true, orderId, email: emailResult };
}

async function processExpiredUnpaidOrders(options) {
  options = options || {};
  const firestore = getFirestore();
  if (!firestore) return { ok: false, processed: 0, reason: "firestore_unavailable" };

  const targetOrderId = String(options.orderId || "").trim();
  if (targetOrderId) {
    const docSnap = await firestore.collection("orders").doc(targetOrderId).get();
    if (!docSnap.exists) return { ok: true, processed: 0, results: [] };
    const status = String(docSnap.data()?.status || "").toLowerCase();
    if (status !== "awaiting-payment") {
      return { ok: true, processed: 0, results: [{ orderId: targetOrderId, cancelled: false, reason: "not_awaiting_payment" }] };
    }
    const result = await cancelExpiredOrderDoc(docSnap);
    return { ok: true, processed: result.cancelled ? 1 : 0, results: [result] };
  }

  const snapshot = await firestore
    .collection("orders")
    .where("status", "==", "awaiting-payment")
    .get();

  const results = [];
  for (const docSnap of snapshot.docs) {
    try {
      const result = await cancelExpiredOrderDoc(docSnap);
      if (result.cancelled) results.push(result);
    } catch (error) {
      console.error("[OrderExpiry] Cancel failed", docSnap.id, error.message);
      results.push({ orderId: docSnap.id, cancelled: false, error: error.message });
    }
  }

  return { ok: true, processed: results.filter((entry) => entry.cancelled).length, results };
}

module.exports = {
  processExpiredUnpaidOrders,
  cancelExpiredOrderDoc,
};
