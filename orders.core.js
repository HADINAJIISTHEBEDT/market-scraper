(function () {
  "use strict";

  if (!window.FIREBASE_CONFIG || !window.MarketsConfig || !window.OrderLifecycle) {
    var list = document.getElementById("ordersList");
    if (list) list.innerHTML = '<p class="empty-msg" style="color:#b91c1c">Config missing from this folder.</p>';
    return;
  }
  if (typeof firebase === "undefined") {
    var list2 = document.getElementById("ordersList");
    if (list2) list2.innerHTML = '<p class="empty-msg" style="color:#b91c1c">Firebase failed to load.</p>';
    return;
  }

  const OL = window.OrderLifecycle;
  const getMarketLabel = window.MarketsConfig.getMarketLabel;
  const ORDER_STATUSES = OL.ORDER_STATUSES;
  const normalizeOrderStatus = OL.normalizeOrderStatus;
  const orderNumberDisplay = OL.orderNumberDisplay;
  const groupItemsByCategory = OL.groupItemsByCategory;
  const computeOrderTotal = OL.computeOrderTotal || function (items) {
    return (Array.isArray(items) ? items : []).reduce(function (sum, item) {
      if (item && item.available === false) return sum;
      return sum + (Number(item.price) || 0) * (Number(item.qty) || 1);
    }, 0);
  };
  const isOrderClosed = OL.isOrderClosed;
  const isOrderCommunicationActive = OL.isOrderCommunicationActive;
  const hasAssignedDriver = OL.hasAssignedDriver;
  const orderChatCollection = OL.orderChatCollection;
  const writeOrderInboxNotifications = OL.writeOrderInboxNotifications;
  const resolveChatSenderDisplayName = OL.resolveChatSenderDisplayName;
  const chatRoleClass = OL.chatRoleClass || function (role) {
    if (role === "driver") return "driver";
    if (role === "market") return "market";
    return "customer";
  };
  const isCustomerChatActive = OL.isCustomerChatActive || function (order) {
    return !isOrderClosed(order && order.status);
  };
  const isAwaitingPayment = OL.isAwaitingPayment || function () { return false; };
  const isOrderPaid = OL.isOrderPaid || function () { return false; };
  const paymentDeadlinePassed = OL.paymentDeadlinePassed || function () { return false; };
  const PAYMENT_TIMEOUT_MS = OL.PAYMENT_TIMEOUT_MS || 20 * 60 * 1000;
  const buildDualLocationMapHtml = OL.buildDualLocationMapHtml || function () { return { html: "", openUrl: "" }; };
  const getOrderCustomerLocation = OL.getOrderCustomerLocation || function () { return null; };
  const isDeliveryChatActive = OL.isDeliveryChatActive || function () { return false; };
  const archiveOrderConversation = OL.archiveOrderConversation || function () { return Promise.resolve(); };
  const MAIL_API_BASE = "https://market-scraper-0k36.onrender.com";

  const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(window.FIREBASE_CONFIG);
  const db = firebase.firestore();
  const auth = firebase.auth ? firebase.auth() : null;
  try { db.settings({ experimentalForceLongPolling: true, merge: true }); } catch (e) {}

  const I18N = {
    tr: {
      pageTitle: "Siparislerim",
      searchLink: "Arama",
      cartLink: "Sepet",
      noOrders: "Henuz siparis yok.",
      loadingOrders: "Siparisler yukleniyor...",
      loadError: "Siparisler yuklenemedi. Sayfayi yenileyin veya tekrar giris yapin.",
      startShopping: "Alisverise basla",
      orderNumber: "Siparis no",
      waiting: "Siparis inceleniyor",
      awaitingPayment: "Odeme bekleniyor",
      preparing: "Hazirlaniyor",
      onTheWay: "Yolda",
      arrived: "Teslim edildi",
      available: "Mevcut",
      unavailable: "Yok",
      driver: "Surucu",
      driverPhone: "Surucu tel",
      trackDriver: "Surucuyu haritada ac",
      driverWaiting: "Surucu konumu henuz paylasilmadi",
      voiceCall: "Sesli ara",
      videoCall: "Goruntulu ara",
      chatTitle: "Admin destegi",
      chatWithDelivery: "Teslimat sohbeti",
      chatPlaceholder: "Admin'e mesaj yazin...",
      chatDisabled: "Siparis kapandi — sohbet devre disi",
      chatWaiting: "Admin ile siparis hakkinda yazisabilirsiniz",
      send: "Gonder",
      market: "Market",
      unknown: "Bilinmiyor",
      payNowTitle: "Odeme gerekli",
      payNowHelp: "Market tum urunleri onayladi. Devam etmek icin 20 dakika icinde odeme yapin.",
      payTimeLeft: "Kalan sure",
      payNow: "Ode ve devam et",
      payCash: "Kapida nakit",
      payCard: "Kart",
      cardName: "Kart uzerindeki isim",
      cardLast4: "Kart son 4 hane",
      cardExpiry: "Son kullanma",
      orderDeletedNoPay: "Siparisiniz odeme yapilmadigi icin silindi (20 dakika sure).",
      historyTitle: "Gecmis siparisler",
      feedbackTitle: "Teslimat geri bildirimi",
      feedbackPlaceholder: "Teslimat deneyiminizi paylasin...",
      feedbackSend: "Gonder",
      feedbackThanks: "Geri bildiriminiz icin tesekkurler!",
      feedbackPrompt: "Teslimat tamamlandi. Lutfen geri bildiriminizi gonderin.",
      orderClosed: "Siparis kapatildi",
    },
    en: {
      pageTitle: "My Orders",
      searchLink: "Search",
      cartLink: "Cart",
      noOrders: "No orders yet.",
      loadingOrders: "Loading orders...",
      loadError: "Could not load orders. Refresh the page or sign in again.",
      startShopping: "Start shopping",
      orderNumber: "Order no",
      waiting: "Waiting / reviewing",
      awaitingPayment: "Awaiting payment",
      preparing: "Preparing",
      onTheWay: "On the way",
      arrived: "Arrived",
      available: "Available",
      unavailable: "Unavailable",
      driver: "Driver",
      driverPhone: "Driver phone",
      trackDriver: "Open driver on map",
      driverWaiting: "Driver location not shared yet",
      voiceCall: "Voice call",
      videoCall: "Video call",
      chatTitle: "Admin support",
      chatWithDelivery: "Delivery chat",
      chatPlaceholder: "Message admin...",
      chatDisabled: "Order closed — chat disabled",
      chatWaiting: "You can message admin about this order",
      send: "Send",
      market: "Market",
      unknown: "Unknown",
      payNowTitle: "Payment required",
      payNowHelp: "The market confirmed all items. Pay within 20 minutes to continue.",
      payTimeLeft: "Time left",
      payNow: "Pay and continue",
      payCash: "Cash on delivery",
      payCard: "Card",
      cardName: "Name on card",
      cardLast4: "Last 4 digits",
      cardExpiry: "Expiry",
      orderDeletedNoPay: "Your order was deleted because you did not pay within 20 minutes.",
      historyTitle: "Order history",
      feedbackTitle: "Delivery feedback",
      feedbackPlaceholder: "Share your delivery experience...",
      feedbackSend: "Send",
      feedbackThanks: "Thank you for your feedback!",
      feedbackPrompt: "Delivery complete. Please send your feedback.",
      orderClosed: "Order closed",
    },
    ar: {
      pageTitle: "طلباتي",
      searchLink: "البحث",
      cartLink: "السلة",
      noOrders: "لا توجد طلبات بعد.",
      loadingOrders: "جاري تحميل الطلبات...",
      loadError: "تعذر تحميل الطلبات. حدّث الصفحة أو سجّل الدخول مرة أخرى.",
      startShopping: "ابدأ التسوق",
      orderNumber: "رقم الطلب",
      waiting: "قيد المراجعة",
      awaitingPayment: "في انتظار الدفع",
      preparing: "قيد التحضير",
      onTheWay: "في الطريق",
      arrived: "تم التسليم",
      available: "متوفر",
      unavailable: "غير متوفر",
      driver: "السائق",
      driverPhone: "هاتف السائق",
      trackDriver: "فتح السائق على الخريطة",
      driverWaiting: "لم يتم مشاركة موقع السائق بعد",
      voiceCall: "مكالمة صوتية",
      videoCall: "مكالمة فيديو",
      chatTitle: "دعم الإدارة",
      chatWithDelivery: "محادثة التسليم",
      chatPlaceholder: "اكتب رسالة للإدارة...",
      chatDisabled: "تم إغلاق الطلب — الدردشة معطلة",
      chatWaiting: "يمكنك مراسلة الإدارة حول هذا الطلب",
      send: "إرسال",
      market: "السوق",
      unknown: "غير معروف",
      payNowTitle: "الدفع مطلوب",
      payNowHelp: "أكد السوق جميع المنتجات. ادفع خلال 20 دقيقة للمتابعة.",
      payTimeLeft: "الوقت المتبقي",
      payNow: "ادفع وتابع",
      payCash: "نقداً عند التسليم",
      payCard: "بطاقة",
      cardName: "الاسم على البطاقة",
      cardLast4: "آخر 4 أرقام",
      cardExpiry: "تاريخ الانتهاء",
      orderDeletedNoPay: "تم حذف طلبك لأنك لم تدفع خلال 20 دقيقة.",
      historyTitle: "سجل الطلبات",
      feedbackTitle: "ملاحظات التسليم",
      feedbackPlaceholder: "شارك تجربة التسليم...",
      feedbackSend: "إرسال",
      feedbackThanks: "شكراً على ملاحظاتك!",
      feedbackPrompt: "اكتمل التسليم. يرجى إرسال ملاحظاتك.",
      orderClosed: "تم إغلاق الطلب",
    },
  };

  const userName = localStorage.getItem("user_name");
  const userUid = localStorage.getItem("user_uid");
  const userEmail = String(localStorage.getItem("user_email") || "").trim().toLowerCase();
  let currentLang = localStorage.getItem("app_lang") || "tr";
  let ordersUnsubscribe = null;
  let triedEmailFallback = false;
  let currentOrders = [];
  const chatUnsubscribers = new Map();

  function t(key) {
    return (I18N[currentLang] && I18N[currentLang][key]) || I18N.tr[key] || key;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
    });
  }

  function applyLanguage() {
    document.documentElement.lang = currentLang;
    document.documentElement.dir = currentLang === "ar" ? "rtl" : "ltr";
    document.getElementById("langSelect").value = currentLang;
    document.getElementById("pageTitle").textContent = t("pageTitle");
    document.getElementById("searchLink").textContent = t("searchLink");
    document.getElementById("cartLink").textContent = t("cartLink");
    document.title = t("pageTitle");
    if (userName) document.getElementById("userGreet").textContent = userName;
  }

  function statusLabel(status) {
    if (isOrderClosed(status)) return t("orderClosed");
    const normalized = normalizeOrderStatus(status);
    return {
      waiting: t("waiting"),
      "awaiting-payment": t("awaitingPayment"),
      preparing: t("preparing"),
      "on-the-way": t("onTheWay"),
      arrived: t("arrived"),
    }[normalized] || normalized;
  }

  function statusClass(status) {
    if (isOrderClosed(status)) return "status-closed";
    return "status-" + normalizeOrderStatus(status || "waiting").replace(/\s+/g, "-");
  }

  function formatPrice(price) {
    return Number(price || 0).toFixed(2).replace(".", ",") + " TL";
  }

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("tr-TR") + " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  }

  function renderTrack(status) {
    if (isOrderClosed(status)) {
      return '<div class="status-track">' +
        ORDER_STATUSES.map(function (s) {
          return '<div class="track-step done">' + escapeHtml(statusLabel(s)) + "</div>";
        }).join("") +
        '<div class="track-step done">' + escapeHtml(t("orderClosed")) + "</div></div>";
    }
    const current = ORDER_STATUSES.indexOf(normalizeOrderStatus(status));
    return '<div class="status-track">' +
      ORDER_STATUSES.map(function (s, i) {
        return '<div class="track-step ' + (i < current ? "done" : i === current ? "active" : "") + '">' +
          escapeHtml(statusLabel(s)) + "</div>";
      }).join("") +
      "</div>";
  }

  function driverHtml(order) {
    const driver = order.driver || {};
    const loc = order.driverLocation;
    const normalized = normalizeOrderStatus(order.status);
    const closed = isOrderClosed(order.status);
    const commActive = isOrderCommunicationActive(order);
    const customerLoc = getOrderCustomerLocation(order);
    const map = buildDualLocationMapHtml(customerLoc, loc, {
      liveBadge: loc && loc.lat != null && order.trackingActive ? t("trackDriver") : "",
    });
    let track = "";
    if (map.html) {
      track =
        map.html +
        (loc && loc.updatedAt
          ? '<div class="order-date">' + escapeHtml(formatDate(loc.updatedAt)) + "</div>"
          : "") +
        (map.openUrl
          ? '<a href="' + escapeHtml(map.openUrl) + '" target="_blank" rel="noopener">' + escapeHtml(t("trackDriver")) + "</a>"
          : "");
    } else if (customerLoc) {
      const url = "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent(customerLoc.lat + "," + customerLoc.lng);
      track = '<a href="' + url + '" target="_blank" rel="noopener">' + escapeHtml(t("trackDriver")) + "</a>";
    } else {
      track = "<div>" + escapeHtml(t("driverWaiting")) + "</div>";
    }
    const phoneDisplay = driver.phone ? escapeHtml(driver.phone) : escapeHtml(t("unknown"));
    let callRow = "";
    if (commActive) {
      callRow =
        '<div class="call-row">' +
        '<button class="btn-call" type="button" data-order-action="voice-call" data-order-id="' +
        escapeHtml(order.id) + '">' + escapeHtml(t("voiceCall")) + "</button>" +
        '<button class="btn-video" type="button" data-order-action="video-call" data-order-id="' +
        escapeHtml(order.id) + '">' + escapeHtml(t("videoCall")) + "</button></div>";
    }
    return (
      '<div class="driver-box">' +
      "<strong>" + escapeHtml(t("driver")) + ":</strong> " +
      escapeHtml(driver.name || t("unknown")) + "<br>" +
      '<span class="driver-phone">' + escapeHtml(t("driverPhone")) + ": " + phoneDisplay + "</span><br>" +
      '<span class="status-badge ' + statusClass(closed ? "closed" : normalized) + '">' +
        escapeHtml(statusLabel(order.status)) + "</span><br>" +
      track + callRow +
      "</div>"
    );
  }

  function feedbackHtml(order) {
    if (!isOrderClosed(order.status)) return "";
    if (order.feedbackSubmitted) {
      return '<div class="feedback-box feedback-thanks">' + escapeHtml(t("feedbackThanks")) + "</div>";
    }
    var prompt = order.feedbackRequested
      ? '<div class="feedback-title" style="color:#166534;">' + escapeHtml(t("feedbackPrompt")) + "</div>"
      : "";
    return (
      prompt +
      '<div class="feedback-box">' +
      '<div class="feedback-title">' + escapeHtml(t("feedbackTitle")) + "</div>" +
      '<textarea class="feedback-input" id="feedback-input-' + escapeHtml(order.id) + '" placeholder="' +
      escapeHtml(t("feedbackPlaceholder")) + '"></textarea>' +
      '<button class="btn-send" type="button" data-order-action="submit-feedback" data-order-id="' +
      escapeHtml(order.id) + '">' + escapeHtml(t("feedbackSend")) + "</button>" +
      "</div>"
    );
  }

  function chatRoleClassLocal(role) {
    if (chatRoleClass) return chatRoleClass(role);
    if (role === "driver") return "driver";
    if (role === "market") return "market";
    if (role === "admin") return "admin";
    return "customer";
  }

  function chatPanelHtml(order) {
    const closed = isOrderClosed(order.status);
    const chatActive = isCustomerChatActive(order);
    const deliveryChat = isDeliveryChatActive(order);
    const title = deliveryChat ? t("chatWithDelivery") : t("chatTitle");
    if (closed) {
      return (
        '<div class="chat-panel chat-disabled">' +
        '<div class="order-date" style="padding:10px;">' + escapeHtml(t("chatDisabled")) + "</div>" +
        '<div class="chat-messages" id="chat-messages-' + escapeHtml(order.id) + '"></div></div>'
      );
    }
    if (!chatActive) {
      return (
        '<div class="chat-panel chat-disabled">' +
        '<div class="order-date" style="padding:10px;">' + escapeHtml(t("chatWaiting")) + "</div></div>"
      );
    }
    return (
      '<div class="chat-panel">' +
      '<div class="order-date" style="padding:10px 10px 0;">' + escapeHtml(title) + "</div>" +
      '<div class="chat-messages" id="chat-messages-' + escapeHtml(order.id) + '"></div>' +
      '<div class="chat-compose">' +
      '<input class="chat-input" id="chat-input-' + escapeHtml(order.id) + '" placeholder="' +
        escapeHtml(t("chatPlaceholder")) + '" />' +
      '<button class="btn-send" type="button" data-order-action="send-chat" data-order-id="' +
        escapeHtml(order.id) + '">' + escapeHtml(t("send")) + "</button>" +
      "</div></div>"
    );
  }

  function paymentPanelHtml(order) {
    if (!isAwaitingPayment(order) || isOrderPaid(order)) return "";
    const deadline = order.paymentDeadline ? new Date(order.paymentDeadline).getTime() : Date.now() + PAYMENT_TIMEOUT_MS;
    const mins = Math.max(0, Math.ceil((deadline - Date.now()) / 60000));
    const preferred = String(order.preferredPaymentMethod || order.paymentSummary?.type || "cash").toLowerCase();
    const cashSelected = preferred !== "card" ? " selected" : "";
    const cardSelected = preferred === "card" ? " selected" : "";
    const summary = order.paymentSummary || {};
    return (
      '<div class="payment-panel">' +
      "<h3>" + escapeHtml(t("payNowTitle")) + "</h3>" +
      '<p class="pay-hint">' + escapeHtml(t("payNowHelp")) + " " + escapeHtml(t("payTimeLeft")) + ": " + mins + " min</p>" +
      '<div class="pay-method-grid">' +
      '<label class="pay-method-option' + cashSelected + '" data-pay-option="cash" data-order-id="' + escapeHtml(order.id) + '">' +
      '<input type="radio" name="pay-' + escapeHtml(order.id) + '" value="cash"' + (preferred !== "card" ? " checked" : "") + ">" +
      '<span>💵</span><span>' + escapeHtml(t("payCash")) + "</span></label>" +
      '<label class="pay-method-option' + cardSelected + '" data-pay-option="card" data-order-id="' + escapeHtml(order.id) + '">' +
      '<input type="radio" name="pay-' + escapeHtml(order.id) + '" value="card"' + (preferred === "card" ? " checked" : "") + ">" +
      '<span>💳</span><span>' + escapeHtml(t("payCard")) + "</span></label>" +
      "</div>" +
      '<div id="card-fields-' + escapeHtml(order.id) + '" class="pay-card-fields' + (preferred === "card" ? " visible" : "") + '">' +
      '<input class="pay-field" id="pay-name-' + escapeHtml(order.id) + '" placeholder="' + escapeHtml(t("cardName")) + '" value="' + escapeHtml(summary.cardholderName || "") + '" />' +
      '<input class="pay-field" id="pay-last4-' + escapeHtml(order.id) + '" placeholder="' + escapeHtml(t("cardLast4")) + '" maxlength="4" inputmode="numeric" value="' + escapeHtml(summary.last4 || "") + '" />' +
      '<input class="pay-field" id="pay-expiry-' + escapeHtml(order.id) + '" placeholder="' + escapeHtml(t("cardExpiry")) + '" value="' + escapeHtml(summary.expiry || "") + '" />' +
      "</div>" +
      '<button class="btn-pay" type="button" data-order-action="pay-order" data-order-id="' +
      escapeHtml(order.id) + '">' + escapeHtml(t("payNow")) + "</button>" +
      "</div>"
    );
  }

  function renderChatMessages(orderId, messages) {
    const root = document.getElementById("chat-messages-" + orderId);
    if (!root) return;
    const order = currentOrders.find(function (entry) { return entry.id === orderId; });
    root.innerHTML = messages.filter(function (msg) {
      return String(msg.senderRole || "").toLowerCase() !== "market";
    }).map(function (msg) {
      const role = chatRoleClassLocal(msg.senderRole);
      const senderLabel = resolveChatSenderDisplayName
        ? resolveChatSenderDisplayName(msg, order, {
          getMarketLabel: getMarketLabel,
          adminLabel: "Admin",
          driverLabel: t("driver"),
          unknownLabel: t("unknown"),
        })
        : (msg.senderName || t("unknown"));
      return (
        '<div class="chat-msg ' + role + '">' +
        '<div class="chat-msg-meta">' + escapeHtml(senderLabel) + " · " +
        escapeHtml(formatDate(msg.createdAt)) + "</div>" +
        "<div>" + escapeHtml(msg.text || "") + "</div></div>"
      );
    }).join("");
    root.scrollTop = root.scrollHeight;
  }

  function bindChatListener(order) {
    const orderId = order.id;
    if (chatUnsubscribers.has(orderId)) return;
    if (!isCustomerChatActive(order) && !isOrderClosed(order.status)) return;
    const unsub = orderChatCollection(db, orderId)
      .orderBy("createdAt", "asc")
      .onSnapshot(function (snapshot) {
        const messages = snapshot.docs.map(function (entry) {
          return Object.assign({ id: entry.id }, entry.data());
        });
        renderChatMessages(orderId, messages);
      });
    chatUnsubscribers.set(orderId, unsub);
  }

  function clearChatListeners(activeOrderIds) {
    chatUnsubscribers.forEach(function (unsub, orderId) {
      if (!activeOrderIds.has(orderId)) {
        unsub();
        chatUnsubscribers.delete(orderId);
      }
    });
  }

  function sendChatMessage(orderId) {
    const order = currentOrders.find(function (entry) { return entry.id === orderId; });
    if (!order || !isCustomerChatActive(order)) return;
    const input = document.getElementById("chat-input-" + orderId);
    const text = String(input && input.value || "").trim();
    if (!text) return;
    orderChatCollection(db, orderId).add({
      senderId: userUid,
      senderRole: "customer",
      senderName: userName || t("unknown"),
      text: text,
      createdAt: new Date().toISOString(),
    }).then(function () {
      if (input) input.value = "";
    }).catch(function (error) {
      console.error("Chat send failed", error);
    });
  }

  function startInAppCall(orderId, mode) {
    const order = currentOrders.find(function (entry) { return entry.id === orderId; });
    if (!order || !isOrderCommunicationActive(order)) return;
    if (!window.InAppCall) return;
    window.InAppCall.open({
      orderId: orderId,
      displayName: userName || t("unknown"),
      mode: mode === "voice" ? "voice" : "video",
      title: mode === "voice" ? t("voiceCall") : t("videoCall"),
      callerRole: "customer",
      localId: userUid || "",
      meta: {
        orderNumber: order.orderNumber != null ? order.orderNumber : "",
        marketId: order.marketId || "",
        marketName: getMarketLabel(order.marketId || order.marketName),
        driverName: order.driver && order.driver.name ? order.driver.name : "",
        customerName: userName || t("unknown"),
        customerPhoto: order.userPhoto || localStorage.getItem("user_photo") || "",
        driverPhoto: "",
      },
    }).catch(function (error) {
      console.error("In-app call failed", error);
    });
  }

  function syncCustomerCallWatch() {
    if (!window.InAppCall || !window.InAppCall.syncWatch || !userUid) return;
    var activeIds = currentOrders
      .filter(function (order) { return isOrderCommunicationActive(order); })
      .map(function (order) { return order.id; });
    window.InAppCall.syncWatch({
      orderIds: activeIds,
      localId: userUid,
      localRole: "customer",
      displayName: userName || t("unknown"),
    });
  }

  function submitFeedback(orderId) {
    const input = document.getElementById("feedback-input-" + orderId);
    const text = String(input && input.value || "").trim();
    if (!text) return;
    const order = currentOrders.find(function (entry) { return entry.id === orderId; });
    if (!order) return;
    const now = new Date().toISOString();
    const button = document.querySelector('[data-order-action="submit-feedback"][data-order-id="' + orderId + '"]');
    if (button) button.disabled = true;

    db.collection("orders").doc(orderId).update({
      feedback: text,
      feedbackSubmitted: true,
      feedbackAt: now,
      updatedAt: now,
    }).then(function () {
      return writeOrderInboxNotifications(db, {
        inboxType: "order_feedback",
        orderId: orderId,
        orderNumber: order.orderNumber != null ? order.orderNumber : "",
        marketId: order.marketId || "",
        marketName: order.marketName || getMarketLabel(order.marketId),
        message: text,
        userName: userName || t("unknown"),
        userEmail: localStorage.getItem("user_email") || "",
      });
    }).catch(function (error) {
      console.error("Feedback submit failed", error);
      if (button) button.disabled = false;
    });
  }

  function sortOrdersDesc(orders) {
    return orders.slice().sort(function (a, b) {
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
  }

  function showOrdersStatus(html) {
    const root = document.getElementById("ordersList");
    if (root) root.innerHTML = html;
  }

  function showLoadingOrders() {
    showOrdersStatus('<p class="empty-msg">' + escapeHtml(t("loadingOrders")) + "</p>");
  }

  function showOrdersLoadError(error) {
    console.error("Orders listener failed", error);
    const detail = error && error.message ? ": " + error.message : "";
    showOrdersStatus(
      '<p class="empty-msg" style="color:#b91c1c">' + escapeHtml(t("loadError")) +
      escapeHtml(detail) + '<br><a href="login.html">' + escapeHtml(t("startShopping")) + "</a></p>"
    );
  }

  function mapOrderDocs(docs) {
    return docs.map(function (doc) {
      return Object.assign({ id: doc.id }, doc.data());
    });
  }

  function payOrder(orderId) {
    const order = currentOrders.find(function (entry) { return entry.id === orderId; });
    if (!order || !isAwaitingPayment(order) || isOrderPaid(order)) return;
    const methodInput = document.querySelector('input[name="pay-' + orderId + '"]:checked');
    const method = methodInput ? methodInput.value : "cash";
    const now = new Date().toISOString();
    const payload = {
      paymentMethod: method,
      paidAt: now,
      paymentStatus: "paid",
      status: "preparing",
      updatedAt: now,
    };
    if (method === "card") {
      payload.paymentSummary = {
        type: "card",
        cardholderName: document.getElementById("pay-name-" + orderId)?.value.trim() || "",
        last4: document.getElementById("pay-last4-" + orderId)?.value.trim() || "",
        expiry: document.getElementById("pay-expiry-" + orderId)?.value.trim() || "",
      };
    }
    const button = document.querySelector('[data-order-action="pay-order"][data-order-id="' + orderId + '"]');
    if (button) button.disabled = true;
    db.collection("orders").doc(orderId).update(payload).catch(function (error) {
      console.error("Payment failed", error);
      if (button) button.disabled = false;
    });
  }

  function processPaymentTimeouts(orders) {
    orders.forEach(function (order) {
      if (!isAwaitingPayment(order) || isOrderPaid(order) || !paymentDeadlinePassed(order)) return;
      const key = "payment_deleted_" + order.id;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      fetch(MAIL_API_BASE + "/process-expired-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok) throw new Error(data.error || "Cancel failed");
          if (data.processed) alert(t("orderDeletedNoPay"));
        });
      }).catch(function (error) {
        console.error("Payment timeout cancel failed", error);
        archiveOrderConversation(db, order.id, order, "payment_timeout").finally(function () {
          return db.collection("orders").doc(order.id).delete();
        }).then(function () {
          alert(t("orderDeletedNoPay"));
        }).catch(function (fallbackError) {
          console.error("Payment timeout fallback delete failed", fallbackError);
          sessionStorage.removeItem(key);
        });
      });
    });
  }

  function renderOrderCard(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    const itemsHtml = groupItemsByCategory(items).map(function (group) {
      const rows = group.entries.map(function (entry) {
        const item = entry.item;
        const available = item.available !== false;
        const lineTotal = available ? (Number(item.price) || 0) * (Number(item.qty) || 1) : 0;
        return (
          '<div class="order-item-row' + (available ? "" : " item-unavailable") + '">' +
          "<span>" + escapeHtml(item.name) + " x " + (item.qty || 1) + "</span>" +
          "<span>" +
          '<span class="avail-badge ' + (available ? "avail-yes" : "avail-no") + '">' +
          escapeHtml(available ? t("available") : t("unavailable")) + "</span> " +
          formatPrice(lineTotal) +
          "</span></div>"
        );
      }).join("");
      return '<div class="item-category-block"><div class="item-category-title">' +
        escapeHtml(group.category) + "</div>" + rows + "</div>";
    }).join("");

    const normalizedStatus = normalizeOrderStatus(order.status);
    const showDriver = hasAssignedDriver(order) || (normalizedStatus !== "waiting" && normalizedStatus !== "awaiting-payment");
    const orderNo = orderNumberDisplay(order);

    return (
      '<div class="order-card">' +
      '<div class="order-header">' +
      "<div>" +
      (orderNo ? '<div class="order-date"><strong>' + escapeHtml(t("orderNumber")) + ":</strong> " +
        escapeHtml(orderNo) + "</div>" : "") +
      '<div class="order-date">' + escapeHtml(formatDate(order.createdAt)) + "</div>" +
      '<div class="order-date">' + escapeHtml(t("market")) + ": " +
        escapeHtml(getMarketLabel(order.marketId || order.marketName)) + "</div>" +
      '<span class="status-badge ' + statusClass(order.status) + '">' +
        escapeHtml(statusLabel(order.status)) + "</span></div>" +
      '<div class="order-total">' + formatPrice(computeOrderTotal(items)) + "</div></div>" +
      '<div class="order-items">' + itemsHtml + "</div>" +
      renderTrack(order.status) +
      paymentPanelHtml(order) +
      (showDriver ? driverHtml(order) : "") +
      chatPanelHtml(order) +
      feedbackHtml(order) +
      "</div>"
    );
  }

  function renderOrders(orders) {
    try {
    currentOrders = sortOrdersDesc(orders);
    processPaymentTimeouts(currentOrders);
    const root = document.getElementById("ordersList");
    if (!root) return;
    if (!currentOrders.length) {
      root.innerHTML = '<p class="empty-msg">' + escapeHtml(t("noOrders")) + '<br><a href="index.html">' +
        escapeHtml(t("startShopping")) + "</a></p>";
      clearChatListeners(new Set());
      return;
    }

    const activeOrders = currentOrders.filter(function (order) { return !isOrderClosed(order.status); });
    const historyOrders = currentOrders.filter(function (order) { return isOrderClosed(order.status); });
    const activeIds = new Set(currentOrders.map(function (order) { return order.id; }));
    let html = activeOrders.map(renderOrderCard).join("");
    if (historyOrders.length) {
      html += '<h2 style="font-size:20px;margin:28px 0 12px;">' + escapeHtml(t("historyTitle")) + "</h2>";
      html += historyOrders.map(renderOrderCard).join("");
    }
    root.innerHTML = html;

    activeOrders.forEach(function (order) {
      document.querySelectorAll('[data-pay-option][data-order-id="' + order.id + '"]').forEach(function (label) {
        label.addEventListener("click", function () {
          const value = label.getAttribute("data-pay-option") || "cash";
          const orderId = label.getAttribute("data-order-id") || "";
          document.querySelectorAll('[data-pay-option][data-order-id="' + orderId + '"]').forEach(function (el) {
            el.classList.toggle("selected", el.getAttribute("data-pay-option") === value);
          });
          const radio = document.querySelector('input[name="pay-' + orderId + '"][value="' + value + '"]');
          if (radio) radio.checked = true;
          const cardFields = document.getElementById("card-fields-" + orderId);
          if (cardFields) cardFields.classList.toggle("visible", value === "card");
        });
      });
    });

    clearChatListeners(activeIds);
    currentOrders.forEach(function (order) {
      if (isCustomerChatActive(order) || isOrderClosed(order.status)) {
        bindChatListener(order);
      }
    });
    syncCustomerCallWatch();
    } catch (error) {
      showOrdersLoadError(error);
    }
  }

  function loadOrdersFromServer() {
    var idTokenPromise = Promise.resolve("");
    if (auth) {
      idTokenPromise = Promise.resolve().then(function () {
        if (auth.currentUser) return auth.currentUser.getIdToken(true);
        return new Promise(function (resolve) {
          var done = false;
          var unsub = auth.onAuthStateChanged(function (user) {
            if (done) return;
            done = true;
            try { unsub(); } catch (e) {}
            if (!user) {
              resolve("");
              return;
            }
            user.getIdToken(true).then(resolve).catch(function () { resolve(""); });
          });
          setTimeout(function () {
            if (done) return;
            done = true;
            try { unsub(); } catch (e) {}
            resolve("");
          }, 2500);
        });
      }).catch(function () { return ""; });
    }
    return idTokenPromise.then(function (idToken) {
      var sessionToken = localStorage.getItem("server_session_token") || "";
      if (!idToken && !sessionToken) {
        throw new Error("Sign in again to load orders.");
      }
      return fetch("/my-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken: idToken || "",
          uid: userUid || "",
          sessionToken: sessionToken,
        }),
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok || data.ok === false) {
            throw new Error(data.error || ("Server orders failed (" + response.status + ")"));
          }
          return Array.isArray(data.orders) ? data.orders : [];
        });
      });
    });
  }

  function attachOrdersListener(field, value, onEmpty) {
    if (ordersUnsubscribe) {
      ordersUnsubscribe();
      ordersUnsubscribe = null;
    }
    if (!value) {
      renderOrders([]);
      return;
    }
    ordersUnsubscribe = db.collection("orders").where(field, "==", value).onSnapshot(
      function (snapshot) {
        const orders = mapOrderDocs(snapshot.docs);
        if (!orders.length) {
          loadOrdersFromServer().then(function (serverOrders) {
            if (serverOrders.length) {
              renderOrders(serverOrders);
              return;
            }
            if (typeof onEmpty === "function") {
              onEmpty();
              return;
            }
            renderOrders([]);
          }).catch(function () {
            if (typeof onEmpty === "function") {
              onEmpty();
              return;
            }
            renderOrders([]);
          });
          return;
        }
        renderOrders(orders);
      },
      function (error) {
        db.collection("orders").where(field, "==", value).get()
          .then(function (snapshot) {
            const orders = mapOrderDocs(snapshot.docs);
            if (!orders.length) {
              return loadOrdersFromServer().then(function (serverOrders) {
                if (serverOrders.length) {
                  renderOrders(serverOrders);
                  return;
                }
                if (typeof onEmpty === "function") {
                  onEmpty();
                  return;
                }
                renderOrders([]);
              });
            }
            renderOrders(orders);
          })
          .catch(function (fallbackError) {
            loadOrdersFromServer().then(function (serverOrders) {
              renderOrders(serverOrders);
            }).catch(function (serverError) {
              showOrdersLoadError(serverError || fallbackError || error);
            });
          });
      }
    );
  }

  function startOrdersListener() {
    showLoadingOrders();
    if (!userUid && !userEmail) {
      window.location.href = "login.html";
      return;
    }
    if (userUid) {
      attachOrdersListener("userId", userUid, function () {
        if (triedEmailFallback || !userEmail) {
          renderOrders([]);
          return;
        }
        triedEmailFallback = true;
        attachOrdersListener("userEmail", userEmail);
      });
      return;
    }
    attachOrdersListener("userEmail", userEmail);
  }

  function bindEvents() {
    document.getElementById("langSelect").addEventListener("change", function (event) {
      currentLang = String(event.target.value || "tr");
      localStorage.setItem("app_lang", currentLang);
      applyLanguage();
      renderOrders(currentOrders);
    });

    document.body.addEventListener("click", function (event) {
      const button = event.target.closest("[data-order-action]");
      if (!button) return;
      if (button.dataset.orderAction === "send-chat") {
        sendChatMessage(button.dataset.orderId || "");
      } else if (button.dataset.orderAction === "submit-feedback") {
        submitFeedback(button.dataset.orderId || "");
      } else if (button.dataset.orderAction === "pay-order") {
        payOrder(button.dataset.orderId || "");
      } else if (button.dataset.orderAction === "video-call") {
        startInAppCall(button.dataset.orderId || "", "video");
      } else if (button.dataset.orderAction === "voice-call") {
        startInAppCall(button.dataset.orderId || "", "voice");
      }
    });

    document.body.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      const input = event.target.closest(".chat-input");
      if (!input || !input.id.startsWith("chat-input-")) return;
      event.preventDefault();
      sendChatMessage(input.id.replace("chat-input-", ""));
    });
  }

  function boot() {
    if (!userUid && !userEmail) {
      window.location.href = "login.html";
      return;
    }
    if (window.FeatureAccess && !window.FeatureAccess.guardPage()) return;
    applyLanguage();
    bindEvents();
    startOrdersListener();
  }

  var settingsReady = window.AppSettings && window.AppSettings.ready
    ? window.AppSettings.ready()
    : Promise.resolve();
  Promise.race([
    settingsReady,
    new Promise(function (resolve) { setTimeout(resolve, 2500); }),
  ]).finally(boot);
})();
