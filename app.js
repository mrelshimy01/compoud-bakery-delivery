const API_URL =
  "https://script.google.com/macros/s/AKfycbyUjlXAF_HOpLfT7q320Px_mKG9LwzllauZ_CnefQUpcxJIKDEzLXIlGYddklSIxYz9mA/exec";

let session = null;
let orders = [];
let supply = [];

const $ = id => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function money(value) {
  return `${Number(value || 0).toFixed(0)} EGP`;
}

function showLoading(show) {
  $("loading").classList.toggle("hidden", !show);
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 3000);
}

function saveSession() {
  if (session) localStorage.setItem("moharambake_delivery_session", JSON.stringify(session));
  else localStorage.removeItem("moharambake_delivery_session");
}

function loadSession() {
  try {
    const value = localStorage.getItem("moharambake_delivery_session");
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

async function apiLogin(username, password) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "deliveryLogin", username, password })
  });
  if (!response.ok) throw new Error("Login request failed.");
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "Invalid login.");
  return data;
}

async function apiGetOrders() {
  const url = `${API_URL}?action=deliveryOrders&token=${encodeURIComponent(session.token)}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Request failed.");
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "Unable to load data.");
  return data;
}

async function login(event) {
  event.preventDefault();
  const username = $("username").value.trim();
  const password = $("password").value;
  $("loginError").textContent = "";

  const button = $("loginButton");
  button.disabled = true;
  button.textContent = "Logging in...";

  try {
    const result = await apiLogin(username, password);
    session = { token: result.token, user: result.user };
    saveSession();
    showApp();
    await refreshData();
  } catch (error) {
    $("loginError").textContent = error.message || "Unable to login.";
  } finally {
    button.disabled = false;
    button.textContent = "Login";
  }
}

function logout() {
  session = null;
  orders = [];
  supply = [];
  saveSession();
  $("appScreen").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
  $("password").value = "";
}

function showApp() {
  $("loginScreen").classList.add("hidden");
  $("appScreen").classList.remove("hidden");
  $("userLabel").textContent = session.user.name;

  if (session.user.role === "supply") {
    $("mainNav").classList.remove("hidden");
  } else {
    $("mainNav").classList.add("hidden");
    setView("delivery");
  }
}

async function refreshData() {
  if (!session) return;
  showLoading(true);

  try {
    const result = await apiGetOrders();
    orders = Array.isArray(result.orders) ? result.orders : [];
    supply = Array.isArray(result.supply) ? result.supply : [];
    renderDelivery();
    renderSupply();
    $("lastUpdated").textContent =
      `Updated ${new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}`;
  } catch (error) {
    toast(error.message || "Unable to load deliveries.");
  } finally {
    showLoading(false);
  }
}

function setView(view) {
  $("deliveryView").classList.toggle("hidden", view !== "delivery");
  $("supplyView").classList.toggle("hidden", view !== "supply");
  document.querySelectorAll(".nav-button").forEach(button =>
    button.classList.toggle("active", button.dataset.view === view)
  );
}

function groupByBuilding(list) {
  const groups = {};
  list.forEach(order => {
    const building = order.building || "Unspecified";
    if (!groups[building]) groups[building] = [];
    groups[building].push(order);
  });
  return Object.keys(groups)
    .sort((a,b) => a.localeCompare(b, undefined, {numeric:true}))
    .map(building => ({building, orders:groups[building]}));
}

function renderDelivery() {
  const container = $("deliveryOrders");

  if (!orders.length) {
    $("deliverySummary").textContent = "No active orders assigned to you.";
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🚚</div><h3>No deliveries</h3><p>There are currently no active orders assigned to you.</p></div>`;
    return;
  }

  const buildings = groupByBuilding(orders);
  const customers = new Set(orders.map(o => `${o.building}|${o.apartment}`)).size;
  $("deliverySummary").textContent =
    `${orders.length} orders · ${customers} customers · ${buildings.length} buildings`;
  container.innerHTML = buildings.map(renderBuilding).join("");
}

function renderBuilding(group) {
  const total = group.orders.reduce((sum,o) => sum + Number(o.total || 0), 0);
  const apartments = {};
  group.orders.forEach(order => {
    const key = order.apartment || "Unspecified";
    if (!apartments[key]) apartments[key] = [];
    apartments[key].push(order);
  });

  return `<section class="building-card">
    <div class="building-header">
      <div><div class="building-title">Building ${escapeHtml(group.building)}</div>
      <div class="building-meta">${group.orders.length} ${group.orders.length === 1 ? "order" : "orders"}</div></div>
      <div class="building-total">${money(total)}</div>
    </div>
    <div class="apartment-list">
      ${Object.keys(apartments).sort((a,b) => a.localeCompare(b,undefined,{numeric:true}))
        .map(a => renderApartment(a, apartments[a])).join("")}
    </div>
  </section>`;
}

function renderApartment(apartment, list) {
  return `<div class="apartment-card">
    <div class="apartment-header"><span class="apartment-label">Apartment</span><strong>${escapeHtml(apartment)}</strong></div>
    ${list.map(renderOrder).join("")}
  </div>`;
}

function renderOrder(order) {
  const items = order.items || [];
  return `<article class="order-card">
    <div class="order-header">
      <div><h3>${escapeHtml(order.name)}</h3>
      <a class="phone-link" href="tel:${escapeHtml(order.phone)}">📞 ${escapeHtml(order.phone)}</a></div>
      <div class="order-total">${money(order.total)}</div>
    </div>
    <div class="delivery-info">
      <span>🕐 ${escapeHtml(order.deliverySlot || "No slot")}</span>
      ${order.deliveryType ? `<span>🚚 ${escapeHtml(order.deliveryType)}</span>` : ""}
      ${order.deliveryDate ? `<span>📅 ${escapeHtml(order.deliveryDate)}</span>` : ""}
    </div>
    <div class="items">
      ${items.length ? items.map(item =>
        `<div class="item-row">${Number(item.quantity || 0)} × ${escapeHtml(item.product)}</div>`
      ).join("") : `<div class="no-items">No active items</div>`}
    </div>
    <div class="order-reference">Order: ${escapeHtml(order.orderId)}</div>
  </article>`;
}

function renderSupply() {
  const container = $("supplyList");

  if (!supply.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🏭</div><h3>Nothing to prepare</h3><p>There are no active order items.</p></div>`;
    return;
  }

  container.innerHTML = `<div class="supply-card">
    <div class="supply-header"><div>Product</div><div>Required</div></div>
    ${supply.map(item => `<div class="supply-row">
      <div><strong>${escapeHtml(item.product)}</strong><small>${item.orders} ${item.orders === 1 ? "order" : "orders"}</small></div>
      <strong class="supply-quantity">${Number(item.quantity || 0)}</strong>
    </div>`).join("")}
  </div>`;
}

function setupEvents() {
  $("loginForm").addEventListener("submit", login);
  $("logoutButton").addEventListener("click", logout);
  $("refreshButton").addEventListener("click", refreshData);
  document.querySelectorAll(".nav-button").forEach(button =>
    button.addEventListener("click", () => setView(button.dataset.view))
  );
}

async function init() {
  setupEvents();
  session = loadSession();

  if (session?.token && session?.user) {
    showApp();
    await refreshData();
  } else {
    $("loginScreen").classList.remove("hidden");
    $("appScreen").classList.add("hidden");
  }
}

document.addEventListener("DOMContentLoaded", init);
