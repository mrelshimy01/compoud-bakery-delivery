/*
 * MoharamBake Delivery / Supply PWA
 * READ ONLY - never writes to Google Sheets.
 *
 * Delivery users: today's active orders assigned to them.
 * Admin: all active orders.
 * Delivery: Day -> Slot -> Building -> Customer -> Order.
 * Supply: Day -> Slot -> consolidated product quantities.
 */

const API_URL = "https://script.google.com/macros/s/AKfycbyJUpdJ87zyVgUXrqXxh19EWCn_gFD2zj62bClt9BzGZT2Dpw02krNWQncduOwQvR-yFQ/exec";

const SESSION_KEY = "moharambake_delivery_session";

let session = null;
let orders = [];
let currentView = "delivery";

const $ = id => document.getElementById(id);


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

  return Number(value || 0)
    .toLocaleString("en-US", {
      maximumFractionDigits: 0
    }) + " EGP";

}


function emptyState(
  icon,
  title,
  message
) {

  return `
    <div class="empty-state">

      <div class="empty-state-icon">
        ${escapeHtml(icon)}
      </div>

      <h3>
        ${escapeHtml(title)}
      </h3>

      <p>
        ${escapeHtml(message)}
      </p>

    </div>
  `;

}


function showLoading(show) {

  const el = $("loading");

  if (el) {

    el.classList.toggle(
      "hidden",
      !show
    );

  }

}


function toast(message) {

  const el = $("toast");

  if (!el) return;

  el.textContent = message;

  el.classList.add("show");

  clearTimeout(
    toast.timer
  );

  toast.timer =
    setTimeout(
      () => {
        el.classList.remove(
          "show"
        );
      },
      3000
    );

}


function saveSession() {

  if (session) {

    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify(session)
    );

  } else {

    localStorage.removeItem(
      SESSION_KEY
    );

  }

}


function loadSession() {

  try {

    const saved =
      localStorage.getItem(
        SESSION_KEY
      );

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

/*
 * IMPORTANT:
 *
 * The Apps Script backend handles:
 *
 * deliveryLogin
 * deliveryOrders
 *
 * through doPost().
 *
 * Therefore deliveryOrders MUST use POST.
 */


async function apiLogin(
  username,
  password
) {

  const response =
    await fetch(
      API_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "text/plain;charset=utf-8"
        },

        body:
          JSON.stringify({
            action:
              "deliveryLogin",

            username:
              username,

            password:
              password
          }),

        cache:
          "no-store"
      }
    );


  if (!response.ok) {

    throw new Error(
      `Login request failed (${response.status}).`
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

  /*
   * DO NOT change this to GET.
   *
   * Your Apps Script only processes
   * deliveryOrders inside doPost().
   */

  const response =
    await fetch(
      API_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "text/plain;charset=utf-8"
        },

        body:
          JSON.stringify({

            action:
              "deliveryOrders",

            token:
              session.token

          }),

        cache:
          "no-store"
      }
    );


  if (!response.ok) {

    throw new Error(
      `Could not load orders (${response.status}).`
    );

  }


  const data =
    await response.json();


  if (!data.ok) {

    throw new Error(
      data.error ||
      "Unable to load orders."
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
    $("username")
      .value
      .trim();


  const password =
    $("password")
      .value;


  $("loginError")
    .textContent = "";


  const button =
    $("loginButton");


  button.disabled =
    true;


  button.textContent =
    "Logging in...";


  try {

    const result =
      await apiLogin(
        username,
        password
      );


    session = {

      token:
        result.token,

      user:
        result.user

    };


    saveSession();


    showApp();


    await refreshData();


  } catch (error) {

    $("loginError")
      .textContent =
        error.message ||
        "Unable to login.";


  } finally {

    button.disabled =
      false;

    button.textContent =
      "Login";

  }

}


function logout() {

  session =
    null;

  orders =
    [];


  saveSession();


  $("appScreen")
    .classList.add(
      "hidden"
    );


  $("loginScreen")
    .classList.remove(
      "hidden"
    );


  $("password")
    .value = "";

}


function showApp() {

  $("loginScreen")
    .classList.add(
      "hidden"
    );


  $("appScreen")
    .classList.remove(
      "hidden"
    );


  const userLabel =
    $("userLabel");


  const admin =
    isAdmin();


  userLabel.textContent =
    session?.user?.name ||
    "";


  userLabel.classList.toggle(
    "admin-label",
    admin
  );


  $("mainNav")
    .classList.remove(
      "hidden"
    );


  setView(
    "delivery"
  );

}


function isAdmin() {

  return (
    session?.user?.role ===
    "admin"
  );

}


/* =========================================================
   DATE HELPERS
========================================================= */

function pad2(value) {

  return String(
    value
  ).padStart(
    2,
    "0"
  );

}


function todayKey() {

  const now =
    new Date();


  return (
    now.getFullYear() +
    "-" +
    pad2(
      now.getMonth() + 1
    ) +
    "-" +
    pad2(
      now.getDate()
    )
  );

}


function dateKeyFromOrder(
  order
) {

  const direct =
    String(
      order?.deliveryDateKey ||
      ""
    ).trim();


  if (
    /^\d{4}-\d{2}-\d{2}$/
      .test(direct)
  ) {

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
   * yyyy-mm-dd
   */

  let match =
    value.match(
      /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/
    );


  if (match) {

    return (
      match[1] +
      "-" +
      pad2(match[2]) +
      "-" +
      pad2(match[3])
    );

  }


  /*
   * dd/mm/yyyy
   */

  match =
    value.match(
      /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/
    );


  if (match) {

    return (
      match[3] +
      "-" +
      pad2(match[2]) +
      "-" +
      pad2(match[1])
    );

  }


  /*
   * Normal browser parsing.
   */

  const parsed =
    new Date(
      value
    );


  if (
    !Number.isNaN(
      parsed.getTime()
    )
  ) {

    return (
      parsed.getFullYear() +
      "-" +
      pad2(
        parsed.getMonth() + 1
      ) +
      "-" +
      pad2(
        parsed.getDate()
      )
    );

  }


  /*
   * Example:
   *
   * Wed, Aug 19
   */

  match =
    value.match(
      /(?:MON|TUE|WED|THU|FRI|SAT|SUN)[A-Z]*,?\s+([A-Z]{3,9})\s+(\d{1,2})(?:,\s*(\d{4}))?/i
    );


  if (match) {

    const month =
      monthNumber(
        match[1]
      );


    if (month) {

      return (
        match[3] ||
        new Date()
          .getFullYear()
      ) +
      "-" +
      pad2(month) +
      "-" +
      pad2(match[2]);

    }

  }


  return "";

}


function monthNumber(
  value
) {

  const names = {

    jan: 1,
    january: 1,

    feb: 2,
    february: 2,

    mar: 3,
    march: 3,

    apr: 4,
    april: 4,

    may: 5,

    jun: 6,
    june: 6,

    jul: 7,
    july: 7,

    aug: 8,
    august: 8,

    sep: 9,
    september: 9,

    oct: 10,
    october: 10,

    nov: 11,
    november: 11,

    dec: 12,
    december: 12

  };


  return (
    names[
      String(
        value || ""
      ).toLowerCase()
    ] ||
    null
  );

}


function formatDayLabel(
  dateKey
) {

  if (
    !dateKey ||
    dateKey === "unknown"
  ) {

    return "Date not set";

  }


  const parts =
    dateKey.split("-");


  if (
    parts.length !== 3
  ) {

    return dateKey;

  }


  const date =
    new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2])
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return dateKey;

  }


  return date.toLocaleDateString(
    "en-US",
    {

      weekday:
        "long",

      month:
        "short",

      day:
        "numeric",

      year:
        "numeric"

    }
  );

}


/* =========================================================
   ACTIVE / TODAY FILTERING
========================================================= */

function isActiveOrder(
  order
) {

  return (
    String(
      order?.status ||
      ""
    )
      .trim()
      .toLowerCase() ===
    "active"
  );

}


function isTodayOrder(
  order
) {

  return (
    dateKeyFromOrder(order) ===
    todayKey()
  );

}


/*
 * Backend already filters delivery users by:
 *
 *   active
 *   assigned delivery man
 *   today's date
 *
 * The frontend applies the same active/today rule as
 * a safety layer.
 *
 * Admin sees every active order returned by the backend.
 */

function visibleOrders() {

  return orders

    .filter(
      isActiveOrder
    )

    .filter(
      order => {

        if (
          isAdmin()
        ) {

          return true;

        }


        return isTodayOrder(
          order
        );

      }
    );

}


/* =========================================================
   SLOT HELPERS
========================================================= */

function slotInfo(
  value
) {

  const raw =
    String(
      value || ""
    ).trim();


  if (!raw) {

    return {

      sort:
        99999,

      label:
        "No Delivery Slot"

    };

  }


  const match =
    raw.match(
      /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i
    );


  if (!match) {

    return {

      sort:
        99998,

      label:
        raw

    };

  }


  let hour =
    Number(
      match[1]
    );


  const minute =
    Number(
      match[2] ||
      0
    );


  const meridiem =
    String(
      match[3] ||
      ""
    )
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

    sort:
      hour * 60 +
      minute,

    label:
      raw

  };

}


/* =========================================================
   DELIVERY GROUPING
   Day -> Slot -> Building -> Orders
========================================================= */

function groupDeliveryOrders(
  list
) {

  const dayMap =
    {};


  list.forEach(
    order => {

      const dateKey =
        dateKeyFromOrder(
          order
        ) ||
        "unknown";


      if (
        !dayMap[dateKey]
      ) {

        dayMap[dateKey] = {

          dateKey:
            dateKey,

          orders:
            []

        };

      }


      dayMap[
        dateKey
      ].orders.push(
        order
      );

    }
  );


  return Object
    .values(
      dayMap
    )

    .sort(
      (
        a,
        b
      ) => {

        if (
          a.dateKey ===
          "unknown"
        ) {

          return 1;

        }


        if (
          b.dateKey ===
          "unknown"
        ) {

          return -1;

        }


        return a.dateKey
          .localeCompare(
            b.dateKey
          );

      }
    )

    .map(
      day => {

        const slotMap =
          {};


        day.orders.forEach(
          order => {

            const info =
              slotInfo(
                order.deliverySlot
              );


            const key =
              info.sort +
              "|" +
              info.label;


            if (
              !slotMap[key]
            ) {

              slotMap[key] = {

                sort:
                  info.sort,

                label:
                  info.label,

                orders:
                  []

              };

            }


            slotMap[
              key
            ].orders.push(
              order
            );

          }
        );


        const slots =
          Object
            .values(
              slotMap
            )

            .sort(
              (
                a,
                b
              ) =>
                a.sort -
                b.sort
            )

            .map(
              slot => {

                const buildingMap =
                  {};


                slot.orders.forEach(
                  order => {

                    const building =
                      String(
                        order.building ||
                        "Unspecified"
                      ).trim();


                    if (
                      !buildingMap[
                        building
                      ]
                    ) {

                      buildingMap[
                        building
                      ] = [];

                    }


                    buildingMap[
                      building
                    ].push(
                      order
                    );

                  }
                );


                const buildings =
                  Object
                    .keys(
                      buildingMap
                    )

                    .sort(
                      (
                        a,
                        b
                      ) =>
                        a.localeCompare(
                          b,
                          undefined,
                          {
                            numeric:
                              true
                          }
                        )
                    )

                    .map(
                      building => ({

                        building:
                          building,

                        orders:
                          buildingMap[
                            building
                          ]

                      })
                    );


                return {

                  ...slot,

                  buildings:
                    buildings

                };

              }
            );


        return {

          ...day,

          slots:
            slots

        };

      }
    );

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
      list.map(
        order =>
          [
            order.building ||
              "",

            order.apartment ||
              "",

            order.phone ||
              ""

          ].join("|")
      )
    );


  $("deliverySummary")
    .textContent =
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


  if (
    !list.length
  ) {

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
    groupDeliveryOrders(
      list
    );


  container.innerHTML =
    days
      .map(
        renderDeliveryDay
      )
      .join("");

}


function renderDeliveryDay(
  day
) {

  const total =
    day.orders.reduce(
      (
        sum,
        order
      ) =>
        sum +
        Number(
          order.total ||
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
            }

          </div>

        </div>


        <div class="day-total">

          ${money(total)}

        </div>

      </div>


      <div class="day-content">

        ${day.slots
          .map(
            renderDeliverySlot
          )
          .join("")}

      </div>

    </section>

  `;

}


function renderDeliverySlot(
  slot
) {

  const total =
    slot.orders.reduce(
      (
        sum,
        order
      ) =>
        sum +
        Number(
          order.total ||
          0
        ),
      0
    );


  return `

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
            }

          </div>

        </div>


        <div class="slot-total">

          ${money(total)}

        </div>

      </div>


      <div class="building-list">

        ${slot.buildings
          .map(
            renderBuilding
          )
          .join("")}

      </div>

    </section>

  `;

}


function renderBuilding(
  group
) {

  const total =
    group.orders.reduce(
      (
        sum,
        order
      ) =>
        sum +
        Number(
          order.total ||
          0
        ),
      0
    );


  return `

    <section class="building-card">

      <div class="building-header">

        <div>

          <div class="building-title">

            🏢 Building
            ${escapeHtml(
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
          .map(
            renderOrder
          )
          .join("")}

      </div>

    </section>

  `;

}


function renderOrder(
  order
) {

  const assigned =
    String(
      order.deliveryMan ||
      ""
    ).trim();


  const items =
    Array.isArray(
      order.items
    )

      ? order.items

      : [];


  return `

    <article class="order-card">

      <div class="order-top">

        <div>

          <div class="order-id">

            ${escapeHtml(
              order.orderId ||
              ""
            )}

          </div>


          <div class="customer-name">

            ${escapeHtml(
              order.name ||
              "Customer"
            )}

          </div>


          <div class="customer-apartment">

            Apartment
            ${escapeHtml(
              order.apartment ||
              "-"
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

                  📞
                  ${escapeHtml(
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
                        escapeHtml(
                          assigned
                        )

                      : "⚠ Unassigned"
                  }

                </div>

              `

              : ""
          }

        </div>


        <div class="order-price">

          ${money(
            order.total
          )}

        </div>

      </div>


      <div class="order-meta">

        ${
          order.deliveryType

            ? `

              <span class="meta-pill">

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

              <span class="meta-pill">

                📅
                ${escapeHtml(
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

            ? items
                .map(
                  item => `

                    <div class="order-item">

                      <span>

                        ${Number(
                          item.quantity ??
                          item.qty ??
                          0
                        )}
                        ×

                        ${escapeHtml(
                          item.product ||
                          item.name ||
                          "Product"
                        )}

                      </span>

                    </div>

                  `
                )
                .join("")

            : `

              <div class="no-items">

                No items found

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

function consolidateSupply(
  list
) {

  const dayMap =
    {};


  list.forEach(
    order => {

      const dateKey =
        dateKeyFromOrder(
          order
        ) ||
        "unknown";


      if (
        !dayMap[
          dateKey
        ]
      ) {

        dayMap[
          dateKey
        ] = {

          dateKey:
            dateKey,

          orders:
            [],

          slots:
            {}

        };

      }


      dayMap[
        dateKey
      ].orders.push(
        order
      );


      const info =
        slotInfo(
          order.deliverySlot
        );


      const slotKey =
        info.sort +
        "|" +
        info.label;


      if (
        !dayMap[
          dateKey
        ].slots[
          slotKey
        ]
      ) {

        dayMap[
          dateKey
        ].slots[
          slotKey
        ] = {

          sort:
            info.sort,

          label:
            info.label,

          orders:
            [],

          products:
            {}

        };

      }


      const slot =
        dayMap[
          dateKey
        ].slots[
          slotKey
        ];


      slot.orders.push(
        order
      );


      /*
       * Consolidate the ITEMS.
       *
       * Example:
       *
       * Order 1:
       * Item 1 = 10
       *
       * Order 2:
       * Item 1 = 20
       *
       * Supply:
       * Item 1 = 30
       */

      const items =
        Array.isArray(
          order.items
        )

          ? order.items

          : [];


      items.forEach(
        item => {

          const product =
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


          if (
            !product ||
            quantity <= 0
          ) {

            return;

          }


          if (
            !slot.products[
              product
            ]
          ) {

            slot.products[
              product
            ] = {

              product:
                product,

              quantity:
                0,

              orders:
                0

            };

          }


          slot.products[
            product
          ].quantity +=
            quantity;


          slot.products[
            product
          ].orders +=
            1;

        }
      );

    }
  );


  return Object
    .values(
      dayMap
    )

    .sort(
      (
        a,
        b
      ) => {

        if (
          a.dateKey ===
          "unknown"
        ) {

          return 1;

        }


        if (
          b.dateKey ===
          "unknown"
        ) {

          return -1;

        }


        return a.dateKey
          .localeCompare(
            b.dateKey
          );

      }
    )

    .map(
      day => ({

        ...day,

        slots:
          Object
            .values(
              day.slots
            )

            .sort(
              (
                a,
                b
              ) =>
                a.sort -
                b.sort
            )

            .map(
              slot => ({

                ...slot,

                products:
                  Object
                    .values(
                      slot.products
                    )

                    .sort(
                      (
                        a,
                        b
                      ) =>
                        a.product
                          .localeCompare(
                            b.product,
                            undefined,
                            {
                              numeric:
                                true
                            }
                          )
                    )

              })
            )

      })
    );

}


function renderSupply() {

  const list =
    visibleOrders();


  const container =
    $("supplyList");


  const totalItems =
    list.reduce(
      (
        sum,
        order
      ) =>

        sum +

        (
          Array.isArray(
            order.items
          )

            ? order.items.reduce(
                (
                  s,
                  item
                ) =>

                  s +
                  Number(
                    item.quantity ??
                    item.qty ??
                    0
                  ),

                0
              )

            : 0
        ),

      0
    );


  $("supplySummary")
    .textContent =

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


  if (
    !list.length
  ) {

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
    consolidateSupply(
      list
    );


  container.innerHTML =
    days
      .map(
        day => {

          const dayItemCount =
            day.slots.reduce(
              (
                sum,
                slot
              ) =>

                sum +

                slot.products.reduce(
                  (
                    s,
                    item
                  ) =>

                    s +
                    Number(
                      item.quantity ||
                      0
                    ),

                  0
                ),

              0
            );


          return `

            <section class="day-section">

              <div class="day-header">

                <div>

                  <div class="day-title">

                    📅
                    ${escapeHtml(
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
                    }

                    ·

                    ${dayItemCount}

                    items

                  </div>

                </div>


                <div class="day-total">

                  Supply

                </div>

              </div>


              <div class="day-content">

                ${day.slots
                  .map(
                    slot => `

                      <section
                        class="slot-block"
                      >

                        <div
                          class="slot-header"
                        >

                          <div>

                            <div
                              class="slot-title"
                            >

                              🕐
                              ${escapeHtml(
                                slot.label
                              )}

                            </div>

                            <div
                              class="slot-subtitle"
                            >

                              ${slot.orders.length}

                              ${
                                slot.orders.length === 1
                                  ? "order"
                                  : "orders"
                              }

                            </div>

                          </div>


                          <div
                            class="slot-total"
                          >

                            ${
                              slot.products
                                .reduce(
                                  (
                                    s,
                                    p
                                  ) =>
                                    s +
                                    Number(
                                      p.quantity ||
                                      0
                                    ),

                                  0
                                )
                            }

                            items

                          </div>

                        </div>


                        <div
                          class="supply-product-list"
                        >

                          ${
                            slot.products.length

                              ? slot.products
                                  .map(
                                    product => `

                                      <div
                                        class="supply-product"
                                      >

                                        <div>

                                          <span
                                            class="supply-product-name"
                                          >

                                            ${escapeHtml(
                                              product.product
                                            )}

                                          </span>


                                          <div
                                            class="supply-product-meta"
                                          >

                                            ${product.orders}

                                            ${
                                              product.orders === 1
                                                ? "order"
                                                : "orders"
                                            }

                                          </div>

                                        </div>


                                        <div
                                          class="supply-product-qty"
                                        >

                                          ${Number(
                                            product.quantity ||
                                            0
                                          )}

                                        </div>

                                      </div>

                                    `
                                  )
                                  .join("")

                              : emptyState(
                                  "📦",
                                  "No items",
                                  "No order items were returned for this slot."
                                )
                          }

                        </div>

                      </section>

                    `
                  )
                  .join("")}

              </div>

            </section>

          `;

        }
      )
      .join("");

}


/* =========================================================
   VIEW
========================================================= */

function setView(
  view
) {

  currentView =
    view;


  $("deliveryView")
    .classList.toggle(
      "hidden",
      view !==
        "delivery"
    );


  $("supplyView")
    .classList.toggle(
      "hidden",
      view !==
        "supply"
    );


  document
    .querySelectorAll(
      ".nav-button"
    )

    .forEach(
      button => {

        button.classList.toggle(
          "active",

          button.dataset.view ===
            view
        );

      }
    );

}


/* =========================================================
   REFRESH
========================================================= */

async function refreshData() {

  if (
    !session
  ) {

    return;

  }


  showLoading(
    true
  );


  try {

    const result =
      await apiGetOrders();


    /*
     * Backend already removes cancelled orders.
     *
     * We filter once more here as a safety layer.
     */

    orders =
      Array.isArray(
        result.orders
      )

        ? result.orders
            .filter(
              isActiveOrder
            )

        : [];


    renderDelivery();

    renderSupply();


    if (
      $("lastUpdated")
    ) {

      $("lastUpdated")
        .textContent =
          "Updated " +
          new Date()
            .toLocaleTimeString(
              [],
              {

                hour:
                  "2-digit",

                minute:
                  "2-digit"

              }
            );

    }


  } catch (
    error
  ) {

    console.error(
      "Refresh error:",
      error
    );


    /*
     * If token/session is invalid,
     * return to login.
     */

    if (
      /authentication|session expired|invalid authentication|user no longer exists/i
        .test(
          error.message ||
          ""
        )
    ) {

      session =
        null;


      saveSession();


      $("appScreen")
        .classList.add(
          "hidden"
        );


      $("loginScreen")
        .classList.remove(
          "hidden"
        );


      $("loginError")
        .textContent =
          error.message ||
          "Please login again.";


    } else {

      toast(
        error.message ||
        "Unable to load deliveries."
      );

    }


  } finally {

    showLoading(
      false
    );

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
    .querySelectorAll(
      ".nav-button"
    )

    .forEach(
      button => {

        button.addEventListener(
          "click",

          () => {

            setView(
              button.dataset.view
            );

          }
        );

      }
    );

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
