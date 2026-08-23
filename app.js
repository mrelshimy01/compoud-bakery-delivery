/*
 * MoharamBake Delivery / Supply App
 *
 * This frontend READS from the existing Delivery Apps Script only.
 * It does not write to the Google Sheet.
 *
 * Current behavior:
 * - Delivery user: today's active orders assigned to that user.
 * - Admin: all active orders, with Delivery Man shown.
 * - Delivery: Day -> Time Slot -> Building -> Customer -> Order.
 * - Supply: Day -> Time Slot -> consolidated product quantities.
 * - Cancelled orders are never rendered.
 */

const API_URL =
  "https://script.google.com/macros/s/AKfycby4q-Y3lUi5vftZnceZcfKlPP3C50dUnlxu4OpRi8SrKkHH29wefHVFrfQKVZce9xGWYg/exec";

const SESSION_KEY =
  "moharambake_delivery_session";

let session = null;
let orders = [];
let currentView = "delivery";

const $ = id =>
  document.getElementById(id);


/* =========================================================
   BASIC HELPERS
========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function money(value) {
  return (
    Number(value || 0)
      .toLocaleString("en-US", {
        maximumFractionDigits: 0
      }) + " EGP"
  );
}

function showLoading(show) {
  const el = $("loading");
  if (el) {
    el.classList.toggle("hidden", !show);
  }
}

function toast(message) {
  const el = $("toast");
  if (!el) return;

  el.textContent = message;
  el.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    el.classList.remove("show");
  }, 3000);
}

function saveSession() {
  if (session) {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify(session)
    );
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function loadSession() {
  try {
    const saved =
      localStorage.getItem(SESSION_KEY);

    return saved
      ? JSON.parse(saved)
      : null;
  } catch (_) {
    return null;
  }
}


/* =========================================================
   API
========================================================= */

async function apiLogin(username, password) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "deliveryLogin",
      username,
      password
    })
  });

  if (!response.ok) {
    throw new Error(
      `Login request failed (${response.status}).`
    );
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(
      data.error || "Invalid login."
    );
  }

  return data;
}

async function apiGetOrders() {
  /*
   * GET is used for reading only.
   * Cache-busting is intentional so newly created orders
   * appear immediately after Refresh.
   */
  const url =
    `${API_URL}?action=deliveryOrders` +
    `&token=${encodeURIComponent(session.token)}` +
    `&_=${Date.now()}`;

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(
      `Could not load orders (${response.status}).`
    );
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(
      data.error || "Unable to load orders."
    );
  }

  return data;
}


/* =========================================================
   LOGIN / SESSION
========================================================= */

async function login(event) {
  event.preventDefault();

  const username =
    $("username").value.trim();

  const password =
    $("password").value;

  $("loginError").textContent = "";

  const button =
    $("loginButton");

  button.disabled = true;
  button.textContent = "Logging in...";

  try {
    const result =
      await apiLogin(
        username,
        password
      );

    session = {
      token: result.token,
      user: result.user
    };

    saveSession();
    showApp();

    await refreshData();

  } catch (error) {

    $("loginError").textContent =
      error.message ||
      "Unable to login.";

  } finally {

    button.disabled = false;
    button.textContent = "Login";
  }
}

function logout() {
  session = null;
  orders = [];

  saveSession();

  $("appScreen").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");

  $("password").value = "";
}

function showApp() {
  $("loginScreen").classList.add("hidden");
  $("appScreen").classList.remove("hidden");

  const userLabel =
    $("userLabel");

  const isAdmin =
    session?.user?.role === "admin";

  userLabel.textContent =
    session?.user?.name || "";

  userLabel.classList.toggle(
    "admin-label",
    isAdmin
  );

  $("mainNav").classList.remove("hidden");

  setView("delivery");
}


/* =========================================================
   DATE HANDLING
========================================================= */

function pad2(value) {
  return String(value).padStart(2, "0");
}

function todayKey() {
  const now = new Date();

  return [
    now.getFullYear(),
    pad2(now.getMonth() + 1),
    pad2(now.getDate())
  ].join("-");
}

/*
 * Converts the different date formats currently used by the
 * sheet/backend into YYYY-MM-DD when possible.
 */
function dateKeyFromOrder(order) {

  const direct =
    String(
      order?.deliveryDateKey ||
      ""
    ).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) {
    return direct;
  }

  const value =
    String(
      order?.deliveryDate ||
      ""
    ).trim();

  if (!value) {
    return "";
  }

  /*
   * 2026-08-19
   */
  const iso =
    value.match(
      /(\d{4})-(\d{2})-(\d{2})/
    );

  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  /*
   * Try normal browser date parsing:
   * "Wednesday, Aug 19, 2026"
   * "Aug 19, 2026"
   */
  const parsed =
    new Date(value);

  if (!Number.isNaN(parsed.getTime())) {
    return [
      parsed.getFullYear(),
      pad2(parsed.getMonth() + 1),
      pad2(parsed.getDate())
    ].join("-");
  }

  /*
   * If backend gives "Wed, Aug 19" without a year,
   * assume current year.
   */
  const short =
    value.match(
      /(?:MON|TUE|WED|THU|FRI|SAT|SUN)[A-Z]*,?\s+([A-Z]{3,9})\s+(\d{1,2})/i
    );

  if (short) {

    const month =
      new Date(
        `${short[1]} 1, 2000`
      ).getMonth();

    if (!Number.isNaN(month)) {
      return [
        new Date().getFullYear(),
        pad2(month + 1),
        pad2(Number(short[2]))
      ].join("-");
    }
  }

  return "";
}

function formatDayLabel(dateKey) {

  if (!dateKey) {
    return "Date not set";
  }

  const parts =
    dateKey.split("-");

  if (parts.length !== 3) {
    return dateKey;
  }

  const date =
    new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2])
    );

  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }

  return date.toLocaleDateString(
    "en-US",
    {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric"
    }
  );
}


/* =========================================================
   ACTIVE / TODAY FILTERING
========================================================= */

function isActiveOrder(order) {
  return (
    String(order?.status || "Active")
      .trim()
      .toLowerCase() === "active"
  );
}

function isAdmin() {
  return session?.user?.role === "admin";
}

function isTodayOrder(order) {
  return dateKeyFromOrder(order) === todayKey();
}

/*
 * Admin sees all active orders.
 * Delivery users see only today's active orders.
 *
 * The backend already scopes a delivery user's orders to their
 * assignment; this frontend additionally enforces today's view.
 */
function visibleOrders() {

  return orders
    .filter(isActiveOrder)
    .filter(order => {
      if (isAdmin()) {
        return true;
      }

      return isTodayOrder(order);
    });
}


/* =========================================================
   SLOT HELPERS
========================================================= */

function slotInfo(value) {

  const raw =
    String(value || "").trim();

  if (!raw) {
    return {
      sort: 99999,
      label: "No Delivery Slot"
    };
  }

  const match =
    raw.match(
      /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i
    );

  if (!match) {
    return {
      sort: 99998,
      label: raw
    };
  }

  let hour =
    Number(match[1]);

  const minute =
    Number(match[2] || 0);

  const meridiem =
    String(match[3] || "")
      .toUpperCase();

  if (
    meridiem === "PM" &&
    hour < 12
  ) {
    hour += 12;
  }

  if (
    meridiem === "AM" &&
    hour === 12
  ) {
    hour = 0;
  }

  return {
    sort: hour * 60 + minute,
    label: raw
  };
}


/* =========================================================
   DELIVERY GROUPING
   Day -> Slot -> Building -> Orders
========================================================= */

function groupDeliveryOrders(list) {

  const dayMap = {};

  list.forEach(order => {

    const dateKey =
      dateKeyFromOrder(order) ||
      "unknown";

    if (!dayMap[dateKey]) {
      dayMap[dateKey] = {
        dateKey,
        orders: []
      };
    }

    dayMap[dateKey].orders.push(order);
  });

  return Object
    .values(dayMap)
    .sort((a, b) => {

      if (a.dateKey === "unknown") return 1;
      if (b.dateKey === "unknown") return -1;

      return a.dateKey.localeCompare(
        b.dateKey
      );
    })
    .map(day => {

      const slotMap = {};

      day.orders.forEach(order => {

        const info =
          slotInfo(
            order.deliverySlot
          );

        const key =
          `${info.sort}|${info.label}`;

        if (!slotMap[key]) {
          slotMap[key] = {
            sort: info.sort,
            label: info.label,
            orders: []
          };
        }

        slotMap[key].orders.push(order);
      });

      const slots =
        Object
          .values(slotMap)
          .sort((a, b) =>
            a.sort - b.sort
          )
          .map(slot => {

            const buildingMap = {};

            slot.orders.forEach(order => {

              const building =
                String(
                  order.building ||
                  "Unspecified"
                ).trim();

              if (!buildingMap[building]) {
                buildingMap[building] = [];
              }

              buildingMap[building]
                .push(order);
            });

            const buildings =
              Object
                .keys(buildingMap)
                .sort((a, b) =>
                  a.localeCompare(
                    b,
                    undefined,
                    { numeric: true }
                  )
                )
                .map(building => ({
                  building,
                  orders:
                    buildingMap[building]
                }));

            return {
              ...slot,
              buildings
            };
          });

      return {
        ...day,
        slots
      };
    });
}


/* =========================================================
   DELIVERY RENDERING
========================================================= */

function renderDelivery() {

  const list =
    visibleOrders();

  const container =
    $("deliveryOrders");

  const customers =
    new Set(
      list.map(order =>
        [
          order.building || "",
          order.apartment || "",
          order.phone || ""
        ].join("|")
      )
    );

  $("deliverySummary").textContent =
    list.length
      ? `${list.length} ${
          list.length === 1
            ? "order"
            : "orders"
        } · ${customers.size} ${
          customers.size === 1
            ? "customer"
            : "customers"
        }`
      : (
          isAdmin()
            ? "No active orders"
            : "No active orders assigned to you today"
        );

  if (!list.length) {

    container.innerHTML =
      emptyState(
        "🚚",
        "No deliveries",
        isAdmin()
          ? "There are no active orders."
          : "There are no active orders assigned to you today."
      );

    return;
  }

  const days =
    groupDeliveryOrders(list);

  container.innerHTML =
    days
      .map(renderDeliveryDay)
      .join("");
}

function renderDeliveryDay(day) {

  const total =
    day.orders.reduce(
      (sum, order) =>
        sum +
        Number(order.total || 0),
      0
    );

  return `
    <section class="day-section">

      <div class="day-header">
        <div>
          <div class="day-title">
            📅 ${escapeHtml(
              formatDayLabel(day.dateKey)
            )}
          </div>
          <div class="day-subtitle">
            ${day.orders.length}
            ${
              day.orders.length === 1
                ? "order"
                : "orders"
            }
          </div>
        </div>

        <div class="day-total">
          ${money(total)}
        </div>
      </div>

      <div class="day-content">
        ${day.slots
          .map(renderDeliverySlot)
          .join("")}
      </div>

    </section>
  `;
}

function renderDeliverySlot(slot) {

  const total =
    slot.orders.reduce(
      (sum, order) =>
        sum +
        Number(order.total || 0),
      0
    );

  return `
    <section class="slot-block">

      <div class="slot-header">
        <div>
          <div class="slot-title">
            🕐 ${escapeHtml(slot.label)}
          </div>
          <div class="slot-subtitle">
            ${slot.orders.length}
            ${
              slot.orders.length === 1
                ? "order"
                : "orders"
            }
          </div>
        </div>

        <div class="slot-total">
          ${money(total)}
        </div>
      </div>

      <div class="building-list">
        ${slot.buildings
          .map(renderBuilding)
          .join("")}
      </div>

    </section>
  `;
}

function renderBuilding(group) {

  const total =
    group.orders.reduce(
      (sum, order) =>
        sum +
        Number(order.total || 0),
      0
    );

  return `
    <section class="building-card">

      <div class="building-header">
        <div>
          <div class="building-title">
            🏢 Building ${escapeHtml(
              group.building
            )}
          </div>
          <div class="building-subtitle">
            ${group.orders.length}
            ${
              group.orders.length === 1
                ? "order"
                : "orders"
            }
          </div>
        </div>

        <div class="building-total">
          ${money(total)}
        </div>
      </div>

      <div class="building-orders">
        ${group.orders
          .map(renderOrder)
          .join("")}
      </div>

    </section>
  `;
}

function renderOrder(order) {

  const assigned =
    String(
      order.deliveryMan ||
      ""
    ).trim();

  const items =
    Array.isArray(order.items)
      ? order.items
      : [];

  return `
    <article class="order-card">

      <div class="order-top">

        <div>
          <div class="order-id">
            ${escapeHtml(
              order.orderId || ""
            )}
          </div>

          <div class="customer-name">
            ${escapeHtml(
              order.name || "Customer"
            )}
          </div>

          <div class="customer-apartment">
            Apartment ${escapeHtml(
              order.apartment || "-"
            )}
          </div>

          ${
            order.phone
              ? `
                <a
                  class="phone"
                  href="tel:${escapeHtml(
                    order.phone
                  )}"
                >
                  📞 ${escapeHtml(
                    order.phone
                  )}
                </a>
              `
              : ""
          }

          ${
            isAdmin()
              ? `
                <div class="assignment ${
                  assigned
                    ? "assigned"
                    : "unassigned"
                }">
                  ${
                    assigned
                      ? "👤 Assigned to " +
                        escapeHtml(assigned)
                      : "⚠ Unassigned"
                  }
                </div>
              `
              : ""
          }
        </div>

        <div class="order-price">
          ${money(order.total)}
        </div>

      </div>

      <div class="order-meta">

        ${
          order.deliveryType
            ? `
              <span class="meta-pill">
                🚚 ${escapeHtml(
                  order.deliveryType
                )}
              </span>
            `
            : ""
        }

        ${
          order.deliveryDate
            ? `
              <span class="meta-pill">
                📅 ${escapeHtml(
                  order.deliveryDate
                )}
              </span>
            `
            : ""
        }

      </div>

      <div class="order-items">

        ${
          items.length
            ? items.map(item => `
                <div class="order-item">
                  <span>
                    ${Number(
                      item.quantity ||
                      item.qty ||
                      0
                    )} ×
                    ${escapeHtml(
                      item.product ||
                      item.name ||
                      "Product"
                    )}
                  </span>
                </div>
              `).join("")
            : `
              <div class="no-items">
                No active items found
              </div>
            `
        }

      </div>

    </article>
  `;
}


/* =========================================================
   SUPPLY CONSOLIDATION
   Day -> Slot -> Product totals
========================================================= */

function consolidateSupply(list) {

  const dayMap = {};

  list.forEach(order => {

    const dateKey =
      dateKeyFromOrder(order) ||
      "unknown";

    if (!dayMap[dateKey]) {
      dayMap[dateKey] = {
        dateKey,
        orders: [],
        slots: {}
      };
    }

    dayMap[dateKey].orders.push(order);

    const info =
      slotInfo(
        order.deliverySlot
      );

    const slotKey =
      `${info.sort}|${info.label}`;

    if (!dayMap[dateKey].slots[slotKey]) {
      dayMap[dateKey].slots[slotKey] = {
        sort: info.sort,
        label: info.label,
        orders: [],
        products: {}
      };
    }

    const slot =
      dayMap[dateKey].slots[slotKey];

    slot.orders.push(order);

    /*
     * IMPORTANT:
     * Consolidation is calculated from the order items
     * belonging to ACTIVE orders, not from the backend's
     * raw "supply" array. This prevents cancelled items
     * from leaking into Supply and ensures every product
     * quantity is aggregated correctly.
     */
    const items =
      Array.isArray(order.items)
        ? order.items
        : [];

    items.forEach(item => {

      const name =
        String(
          item.product ||
          item.name ||
          ""
        ).trim();

      const quantity =
        Number(
          item.quantity ??
          item.qty ??
          0
        );

      if (!name || quantity <= 0) {
        return;
      }

      if (!slot.products[name]) {
        slot.products[name] = {
          product: name,
          quantity: 0,
          orders: 0
        };
      }

      slot.products[name].quantity +=
        quantity;

      slot.products[name].orders +=
        1;
    });
  });

  return Object
    .values(dayMap)
    .sort((a, b) => {

      if (a.dateKey === "unknown") return 1;
      if (b.dateKey === "unknown") return -1;

      return a.dateKey.localeCompare(
        b.dateKey
      );
    })
    .map(day => {

      const slots =
        Object
          .values(day.slots)
          .sort((a, b) =>
            a.sort - b.sort
          )
          .map(slot => ({
            ...slot,
            products:
              Object
                .values(slot.products)
                .sort((a, b) =>
                  a.product.localeCompare(
                    b.product,
                    undefined,
                    { numeric: true }
                  )
                )
          }));

      return {
        ...day,
        slots
      };
    });
}

function renderSupply() {

  const list =
    visibleOrders();

  const container =
    $("supplyList");

  const totalItems =
    list.reduce(
      (sum, order) =>
        sum +
        (Array.isArray(order.items)
          ? order.items.reduce(
              (s, item) =>
                s +
                Number(
                  item.quantity ??
                  item.qty ??
                  0
                ),
              0
            )
          : 0),
      0
    );

  $("supplySummary").textContent =
    list.length
      ? `${list.length} ${
          list.length === 1
            ? "order"
            : "orders"
        } · ${totalItems} items to prepare`
      : (
          isAdmin()
            ? "No active orders"
            : "No active orders assigned to you today"
        );

  if (!list.length) {

    container.innerHTML =
      emptyState(
        "🏭",
        "Nothing to prepare",
        isAdmin()
          ? "There are no active orders."
          : "There are no active orders assigned to you today."
      );

    return;
  }

  const days =
    consolidateSupply(list);

  container.innerHTML =
    days
      .map(day => {

        const dayItemCount =
          day.slots.reduce(
            (sum, slot) =>
              sum +
              slot.products.reduce(
                (s, item) =>
                  s +
                  Number(item.quantity || 0),
                0
              ),
            0
          );

        return `
          <section class="day-section">

            <div class="day-header">
              <div>
                <div class="day-title">
                  📅 ${escapeHtml(
                    formatDayLabel(
                      day.dateKey
                    )
                  )}
                </div>
                <div class="day-subtitle">
                  ${day.orders.length}
                  ${
                    day.orders.length === 1
                      ? "order"
                      : "orders"
                  } ·
                  ${dayItemCount} items
                </div>
              </div>
            </div>

            <div class="day-content">

              ${day.slots
                .map(slot => `
                  <section class="slot-block">

                    <div class="slot-header">
                      <div>
                        <div class="slot-title">
                          🕐 ${escapeHtml(
                            slot.label
                          )}
                        </div>
                        <div class="slot-subtitle">
                          ${slot.orders.length}
                          ${
                            slot.orders.length === 1
                              ? "order"
                              : "orders"
                          } ·
                          ${slot.products.length}
                          ${
                            slot.products.length === 1
                              ? "product"
                              : "products"
                          }
                        </div>
                      </div>
                    </div>

                    <div class="supply-slot-products">

                      ${
                        slot.products.length
                          ? slot.products
                              .map(item => `
                                <div class="supply-product">

                                  <div>
                                    <div class="supply-product-name">
                                      ${escapeHtml(
                                        item.product
                                      )}
                                    </div>

                                    <div class="supply-product-meta">
                                      Required across
                                      ${item.orders}
                                      ${
                                        item.orders === 1
                                          ? "order"
                                          : "orders"
                                      }
                                    </div>
                                  </div>

                                  <div class="supply-product-qty">
                                    ${Number(
                                      item.quantity || 0
                                    )}
                                  </div>

                                </div>
                              `)
                              .join("")
                          : `
                              <div class="empty-state">
                                <div class="empty-icon">🥖</div>
                                <p>No active items found.</p>
                              </div>
                            `
                      }

                    </div>

                  </section>
                `)
                .join("")}

            </div>
          </section>
        `;
      })
      .join("");
}


/* =========================================================
   VIEW / REFRESH
========================================================= */

function setView(view) {

  currentView = view;

  $("deliveryView")
    .classList.toggle(
      "hidden",
      view !== "delivery"
    );

  $("supplyView")
    .classList.toggle(
      "hidden",
      view !== "supply"
    );

  document
    .querySelectorAll(".nav-button")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.view === view
      );
    });
}

async function refreshData() {

  if (!session) {
    return;
  }

  showLoading(true);

  try {

    const result =
      await apiGetOrders();

    orders =
      Array.isArray(result.orders)
        ? result.orders
        : [];

    /*
     * We intentionally do NOT use result.supply for the
     * Supply rendering. Supply is consolidated locally
     * from the active order items above.
     */

    renderDelivery();
    renderSupply();

    $("lastUpdated").textContent =
      "Updated " +
      new Date().toLocaleTimeString(
        [],
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      );

  } catch (error) {

    console.error(
      "Refresh error:",
      error
    );

    toast(
      error.message ||
      "Unable to load deliveries."
    );

  } finally {

    showLoading(false);
  }
}


/* =========================================================
   EVENTS
========================================================= */

function setupEvents() {

  $("loginForm")
    .addEventListener(
      "submit",
      login
    );

  $("logoutButton")
    .addEventListener(
      "click",
      logout
    );

  $("refreshButton")
    .addEventListener(
      "click",
      refreshData
    );

  document
    .querySelectorAll(".nav-button")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {
          setView(
            button.dataset.view
          );
        }
      );

    });
}


/* =========================================================
   INIT
========================================================= */

async function init() {

  setupEvents();

  session =
    loadSession();

  if (
    session &&
    session.token &&
    session.user
  ) {

    showApp();
    await refreshData();

  } else {

    $("loginScreen")
      .classList.remove("hidden");

    $("appScreen")
      .classList.add("hidden");
  }
}

document.addEventListener(
  "DOMContentLoaded",
  init
);
