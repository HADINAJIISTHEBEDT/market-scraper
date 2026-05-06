importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyA4ZmYg5sTs4gU1Nm25s7of6oqJ4xGpR28",
  authDomain: "st-business-86a9b.firebaseapp.com",
  projectId: "st-business-86a9b",
  storageBucket: "st-business-86a9b.firebasestorage.app",
  messagingSenderId: "472603409840",
  appId: "1:472603409840:web:30127c81e74c3b3c4e2a75",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const data = payload.data || {};

  self.registration.showNotification(notification.title || "Dessert Cafe Manager", {
    body: notification.body || "Timer finished!",
    tag: data.tag || "dessert-timer",
    vibrate: [200, 100, 200],
    data: { url: data.url || "/" },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    }),
  );
});
