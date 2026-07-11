"use strict";

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

function readServiceAccount() {
  const rawJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (rawJson) return JSON.parse(rawJson);

  const rawBase64 = String(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "").trim();
  if (rawBase64) {
    return JSON.parse(Buffer.from(rawBase64, "base64").toString("utf8"));
  }

  const keyPath =
    String(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "").trim() ||
    path.join(__dirname, "serviceAccountKey.json");

  if (fs.existsSync(keyPath)) {
    return JSON.parse(fs.readFileSync(keyPath, "utf8"));
  }

  return null;
}

async function commitBatch(firestore, ops) {
  const batch = firestore.batch();
  ops.forEach(({ ref, type, data }) => {
    if (type === "delete") batch.delete(ref);
    else batch.set(ref, data, { merge: true });
  });
  await batch.commit();
}

async function deleteAllUsers() {
  if (!process.argv.includes("--confirm")) {
    console.error("Refusing to run without --confirm");
    console.error("Usage: node delete-all-users.js --confirm");
    process.exit(1);
  }

  const serviceAccount = readServiceAccount();
  if (!serviceAccount) {
    console.error("Missing service account. Place serviceAccountKey.json in project root or set FIREBASE_SERVICE_ACCOUNT_JSON.");
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }

  const firestore = admin.firestore();
  const snapshot = await firestore.collection("users").get();
  if (snapshot.empty) {
    console.log("No users found in Firestore.");
    return;
  }

  const now = new Date().toISOString();
  const deletedBy = "delete-all-users.js";
  let deleted = 0;
  let batchOps = [];

  for (const docSnap of snapshot.docs) {
    const user = docSnap.data() || {};
    batchOps.push({
      type: "set",
      ref: firestore.collection("deletedAccounts").doc(docSnap.id),
      data: {
        forceLogout: true,
        deletedAt: now,
        deletedBy,
        email: user.email || "",
        name: user.name || "",
        address: "",
        phone: "",
        profileCleared: true,
        bulkDelete: true,
      },
    });
    batchOps.push({ type: "delete", ref: docSnap.ref });

    if (batchOps.length >= 400) {
      await commitBatch(firestore, batchOps);
      deleted += batchOps.filter((op) => op.type === "delete").length;
      batchOps = [];
      console.log(`Deleted ${deleted}/${snapshot.size}...`);
    }
  }

  if (batchOps.length) {
    await commitBatch(firestore, batchOps);
    deleted += batchOps.filter((op) => op.type === "delete").length;
  }

  console.log(`Done. Removed ${deleted} user profile(s) from Firestore.`);
  console.log("Firebase Auth accounts were not removed — only Firestore user documents.");
}

deleteAllUsers().catch((error) => {
  console.error("Delete all users failed:", error);
  process.exit(1);
});
