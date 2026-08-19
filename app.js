const API_URL =
  "https://script.google.com/macros/s/AKfycbzPTfZglgySam0cPP-fvg4YpBsbB54t-doRhTWgNaXTdFAdLLQh5Pc0dSAxYzr9J2CJxQ/exec";

let session = null;
let orders = [];
let supply = [];
let currentView = "delivery";

const $ = id => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
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

  toast.timer = setTimeout(() => {
    el.classList.remove("show");
  }, 3000);
}

function saveSession() {
  if (session) {
    localStorage.setItem(
      "moharambake_delivery_session",
      JSON.stringify(session)
    );
  } else {
    localStorage.removeItem(
      "moharambake_delivery_session"
    );
  }
}

function loadSession() {
  try {
    const value = localStorage.getItem(
      "moharambake_delivery_session"
    );

    return value
      ? JSON.parse(value)
      : null;

  } catch {
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
      "Content-Type":
        "text/plain;charset=utf-8"
    },

    body: JSON.stringify({
      action: "deliveryLogin",
      username,
      password
    })
  });

  if (!response.ok) {
    throw new Error(
      "Login request failed."
    );
  }

  const data =
    await response.json();

  if (!data.ok) {
    throw new Error(
      data.error ||
      "Invalid login."
    );
  }

  return data;
}


async function apiGetOrders() {

  const url =
    `${API_URL}?action=deliveryOrders&token=${encodeURIComponent(
      session.token
    )}`;

  const response =
    await fetch(url, {
      cache: "no-store"
    });

  if (!response.ok) {
    throw new Error(
      "Request failed."
    );
  }

  const data =
    await response.json();

  if (!data.ok) {
    throw new Error(
      data.error ||
      "Unable to load data."
    );
  }

  return data;
}


/* =========================================================
   LOGIN
========================================================= */

async function login(event) {

  event.preventDefault();

  const username =
    $("username").value.trim();

  const password =
    $("password").value;

  $("loginError").textContent =
    "";

  const button =
    $("loginButton");

  button.disabled = true;
  button.textContent =
    "Logging in...";

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
    button.textContent =
      "Login";
  }
}


function logout() {

  session = null;
  orders = [];
  supply = [];

  saveSession();

  $("appScreen")
    .classList.add("hidden");

  $("loginScreen")
    .classList.remove("hidden");

  $("password").value = "";
}


/* =========================================================
   APP
========================================================= */

function showApp() {

  $("loginScreen")
    .classList.add("hidden");

  $("appScreen")
    .classList.remove("hidden");

  $("userLabel").textContent =
    session.user.name;

  /*
   * IMPORTANT:
   *
   * Both Delivery and Supply are available.
   */
  $("mainNav")
    .classList.remove("hidden");

  setView("delivery");
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

    supply =
      Array.isArray(result.supply)
        ? result.supply
        : [];

    renderDelivery();

    renderSupply();

    $("lastUpdated")
      .textContent =
      `Updated ${new Date().toLocaleTimeString(
        [],
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      )}`;

  } catch (error) {

    toast(
      error.message ||
      "Unable to load deliveries."
    );

  } finally {

    showLoading(false);
  }
}


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


/* =========================================================
   DELIVERY SLOT GROUPING
========================================================= */

function groupByDeliverySlot(list) {

  const slots = {};

  list.forEach(order => {

    const slot =
      normalizeSlot(
        order.deliverySlot
      );

    if (!slots[slot.key]) {

      slots[slot.key] = {
        label: slot.label,
        orders: []
      };

    }

    slots[slot.key]
      .orders
      .push(order);
  });


  return Object.keys(slots)

    .sort(compareSlots)

    .map(key => ({

      key,

      label:
        slots[key].label,

      orders:
        slots[key].orders

    }));
}


function normalizeSlot(value) {

  const raw =
    String(value || "")
      .trim();

  if (!raw) {

    return {
      key: "zz-no-slot",
      label: "No Delivery Slot"
    };
  }


  /*
   * Handles examples such as:
   *
   * 8:00 PM - 10:00 PM
   * 08:00 - 10:00
   * 8 PM - 10 PM
   */

  const match =
    raw.match(
      /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i
    );


  if (!match) {

    return {
      key:
        "xx-" +
        raw.toLowerCase(),

      label:
        raw
    };
  }


  let hour =
    Number(match[1]);

  const minute =
    Number(match[2] || 0);

  const ampm =
    String(match[3] || "")
      .toUpperCase();


  if (
    ampm === "PM" &&
    hour < 12
  ) {
    hour += 12;
  }


  if (
    ampm === "AM" &&
    hour === 12
  ) {
    hour = 0;
  }


  const key =
    String(hour)
      .padStart(2, "0") +
    ":" +
    String(minute)
      .padStart(2, "0");


  return {
    key,
    label: raw
  };
}


function compareSlots(a, b) {

  const aNormal =
    /^\d{2}:\d{2}$/
      .test(a);

  const bNormal =
    /^\d{2}:\d{2}$/
      .test(b);


  if (
    aNormal &&
    !bNormal
  ) {
    return -1;
  }


  if (
    !aNormal &&
    bNormal
  ) {
    return 1;
  }


  return a.localeCompare(
    b,
    undefined,
    {
      numeric: true,
      sensitivity: "base"
    }
  );
}


/* =========================================================
   BUILDING GROUPING
========================================================= */

function groupByBuilding(list) {

  const buildings = {};

  list.forEach(order => {

    const building =
      order.building ||
      "Unspecified";


    if (!buildings[building]) {
      buildings[building] = [];
    }


    buildings[building]
      .push(order);
  });


  return Object.keys(buildings)

    .sort((a, b) =>
      a.localeCompare(
        b,
        undefined,
        {
          numeric: true
        }
      )
    )

    .map(building => ({

      building,

      orders:
        buildings[building]

    }));
}


/* =========================================================
   DELIVERY
========================================================= */

function renderDelivery() {

  const container =
    $("deliveryOrders");


  if (!orders.length) {

    $("deliverySummary")
      .textContent =
      "No active orders assigned to you.";


    container.innerHTML = `
      <div class="empty-state">

        <div class="empty-icon">
          🚚
        </div>

        <h3>
          No deliveries
        </h3>

        <p>
          There are currently no active
          orders assigned to you.
        </p>

      </div>
    `;

    return;
  }


  const slots =
    groupByDeliverySlot(
      orders
    );


  const customers =
    new Set(
      orders.map(order =>
        `${order.building}|${order.apartment}|${order.phone}`
      )
    ).size;


  $("deliverySummary")
    .textContent =
      `${orders.length} orders · ` +
      `${customers} customers · ` +
      `${slots.length} delivery slots`;


  container.innerHTML =
    slots
      .map(renderSlot)
      .join("");
}


/* =========================================================
   SLOT
========================================================= */

function renderSlot(slotGroup) {

  const slotTotal =
    slotGroup.orders.reduce(
      (sum, order) =>
        sum +
        Number(order.total || 0),
      0
    );


  const buildings =
    groupByBuilding(
      slotGroup.orders
    );


  return `
    <section class="slot-card">

      <div class="slot-header">

        <div>

          <div class="slot-title">
            🕐
            ${escapeHtml(
              slotGroup.label
            )}
          </div>

          <div class="slot-meta">

            ${slotGroup.orders.length}

            ${
              slotGroup.orders.length === 1
                ? "order"
                : "orders"
            }

          </div>

        </div>


        <div class="slot-total">
          ${money(slotTotal)}
        </div>

      </div>


      <div class="slot-buildings">

        ${
          buildings
            .map(
              renderBuilding
            )
            .join("")
        }

      </div>

    </section>
  `;
}


/* =========================================================
   BUILDING
========================================================= */

function renderBuilding(group) {

  const total =
    group.orders.reduce(
      (sum, order) =>
        sum +
        Number(order.total || 0),
      0
    );


  /*
   * Group orders by customer.
   *
   * Apartment + phone + name identify a customer
   * within a building.
   */

  const customers = {};


  group.orders.forEach(order => {

    const customerKey =
      [
        order.apartment || "",
        order.phone || "",
        order.name || ""
      ]
      .join("|")
      .toLowerCase();


    if (!customers[customerKey]) {
      customers[customerKey] = [];
    }


    customers[customerKey]
      .push(order);
  });


  const customerGroups =
    Object.keys(customers)

      .map(key => ({

        orders:
          customers[key],

        apartment:
          customers[key][0].apartment,

        name:
          customers[key][0].name,

        phone:
          customers[key][0].phone

      }))


      .sort((a, b) => {

        const apartmentCompare =
          String(
            a.apartment || ""
          )
            .localeCompare(
              String(
                b.apartment || ""
              ),
              undefined,
              {
                numeric: true
              }
            );


        if (
          apartmentCompare !== 0
        ) {
          return apartmentCompare;
        }


        return String(
          a.name || ""
        )
          .localeCompare(
            String(
              b.name || ""
            )
          );
      });


  return `
    <section class="building-card">

      <div class="building-header">

        <div>

          <div class="building-title">

            Building
            ${escapeHtml(
              group.building
            )}

          </div>


          <div class="building-meta">

            ${customerGroups.length}

            ${
              customerGroups.length === 1
                ? "customer"
                : "customers"
            }

            ·

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


      <div class="customer-list">

        ${
          customerGroups
            .map(
              renderCustomer
            )
            .join("")
        }

      </div>

    </section>
  `;
}


/* =========================================================
   CUSTOMER
========================================================= */

function renderCustomer(customer) {

  const customerTotal =
    customer.orders.reduce(
      (sum, order) =>
        sum +
        Number(order.total || 0),
      0
    );


  return `
    <div class="customer-card">

      <div class="customer-header">

        <div>

          <div class="customer-name">

            ${escapeHtml(
              customer.name ||
              "Customer"
            )}

          </div>


          <div class="customer-location">

            Apartment
            ${escapeHtml(
              customer.apartment ||
              "-"
            )}

          </div>


          ${
            customer.phone
              ? `
                <a
                  class="phone-link"
                  href="tel:${escapeHtml(
                    customer.phone
                  )}"
                >

                  📞
                  ${escapeHtml(
                    customer.phone
                  )}

                </a>
              `
              : ""
          }

        </div>


        <div class="customer-total">
          ${money(customerTotal)}
        </div>

      </div>


      <div class="customer-orders">

        ${
          customer.orders
            .map(
              renderOrder
            )
            .join("")
        }

      </div>

    </div>
  `;
}


/* =========================================================
   ORDER
========================================================= */

function renderOrder(order) {

  const items =
    order.items || [];


  return `
    <article class="order-card">

      <div class="order-header">

        <div>

          <div class="order-reference-top">

            Order
            ${escapeHtml(
              order.orderId
            )}

          </div>

        </div>


        <div class="order-total">

          ${money(
            order.total
          )}

        </div>

      </div>


      <div class="delivery-info">

        ${
          order.deliverySlot
            ? `
              <span>

                🕐
                ${escapeHtml(
                  order.deliverySlot
                )}

              </span>
            `
            : ""
        }


        ${
          order.deliveryType
            ? `
              <span>

                🚚
                ${escapeHtml(
                  order.deliveryType
                )}

              </span>
            `
            : ""
        }


        ${
          order.deliveryDate
            ? `
              <span>

                📅
                ${escapeHtml(
                  order.deliveryDate
                )}

              </span>
            `
            : ""
        }

      </div>


      <div class="items">

        ${
          items.length

            ? items
                .map(
                  item => `
                    <div class="item-row">

                      <span>

                        ${Number(
                          item.quantity || 0
                        )}

                        ×

                        ${escapeHtml(
                          item.product
                        )}

                      </span>

                    </div>
                  `
                )
                .join("")

            : `
              <div class="no-items">
                No active items
              </div>
            `
        }

      </div>

    </article>
  `;
}


/* =========================================================
   SUPPLY
========================================================= */

function renderSupply() {

  const container =
    $("supplyList");


  if (!supply.length) {

    container.innerHTML = `
      <div class="empty-state">

        <div class="empty-icon">
          🏭
        </div>

        <h3>
          Nothing to prepare
        </h3>

        <p>
          There are no active order items.
        </p>

      </div>
    `;

    return;
  }


  container.innerHTML = `

    <div class="supply-card">

      <div class="supply-header">

        <div>
          Product
        </div>

        <div>
          Required
        </div>

      </div>


      ${
        supply
          .map(
            item => `

              <div class="supply-row">

                <div>

                  <strong>

                    ${escapeHtml(
                      item.product
                    )}

                  </strong>


                  <small>

                    ${Number(
                      item.orders || 0
                    )}

                    ${
                      Number(
                        item.orders || 0
                      ) === 1
                        ? "order"
                        : "orders"
                    }

                  </small>

                </div>


                <strong
                  class="supply-quantity"
                >

                  ${Number(
                    item.quantity || 0
                  )}

                </strong>

              </div>

            `
          )
          .join("")
      }

    </div>
  `;
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
    .querySelectorAll(
      ".nav-button"
    )
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
      .classList.remove(
        "hidden"
      );

    $("appScreen")
      .classList.add(
        "hidden"
      );
  }
}


document.addEventListener(
  "DOMContentLoaded",
  init
);
