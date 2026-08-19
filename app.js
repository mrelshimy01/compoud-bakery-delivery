const API_URL =
  "https://script.google.com/macros/s/AKfycby4q-Y3lUi5vftZnceZcfKlPP3C50dUnlxu4OpRi8SrKkHH29wefHVFrfQKVZce9xGWYg/exec";


let session = null;
let orders = [];
let supply = [];
let currentView = "delivery";


const $ = id =>
  document.getElementById(id);


/* =========================================================
   HELPERS
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
      .toLocaleString(
        "en-US",
        {
          maximumFractionDigits: 0
        }
      ) +
    " EGP"
  );

}


function showLoading(show) {

  $("loading")
    .classList
    .toggle(
      "hidden",
      !show
    );

}


function toast(message) {

  const element =
    $("toast");

  element.textContent =
    message;

  element.classList.add(
    "show"
  );

  clearTimeout(
    toast.timer
  );

  toast.timer =
    setTimeout(
      () => {

        element.classList.remove(
          "show"
        );

      },
      3000
    );

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

    const saved =
      localStorage.getItem(
        "moharambake_delivery_session"
      );

    if (!saved) {
      return null;
    }

    return JSON.parse(saved);

  } catch (error) {

    return null;

  }

}


/* =========================================================
   DATE HELPERS
========================================================= */

/*
  Returns today's date in local browser time as:

  YYYY-MM-DD
*/

function todayDateKey() {

  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      now.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;

}


/*
  Converts different date formats coming from
  Google Sheets / Apps Script into YYYY-MM-DD.

  Supported examples:

  2026-08-19
  8/19/2026
  08/19/2026
  Wed, Aug 19
  Wed, Aug 19, 2026
  Date objects serialized by Apps Script
*/

function normalizeDateKey(order) {

  if (!order) {
    return "unknown";
  }


  /*
    First preference:
    API-provided deliveryDateKey
  */

  const explicitKey =
    String(
      order.deliveryDateKey ||
      ""
    ).trim();


  if (
    /^\d{4}-\d{1,2}-\d{1,2}$/
      .test(explicitKey)
  ) {

    const parts =
      explicitKey.split("-");

    return (
      parts[0] +
      "-" +
      String(parts[1])
        .padStart(2, "0") +
      "-" +
      String(parts[2])
        .padStart(2, "0")
    );

  }


  /*
    Try deliveryDate.
  */

  const raw =
    String(
      order.deliveryDate ||
      order.date ||
      ""
    ).trim();


  if (!raw) {

    /*
      Sometimes the API may already provide
      createdAt/date fields.
    */

    const fallback =
      String(
        order.deliveryDateLabel ||
        ""
      ).trim();

    if (!fallback) {
      return "unknown";
    }

    return parseLooseDate(
      fallback
    );

  }


  return parseLooseDate(
    raw
  );

}


/*
  Parses common date strings.
*/

function parseLooseDate(value) {

  const text =
    String(
      value || ""
    ).trim();


  if (!text) {
    return "unknown";
  }


  /*
    YYYY-MM-DD
  */

  let match =
    text.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})/
    );


  if (match) {

    return (
      match[1] +
      "-" +
      String(match[2])
        .padStart(2, "0") +
      "-" +
      String(match[3])
        .padStart(2, "0")
    );

  }


  /*
    MM/DD/YYYY
  */

  match =
    text.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})/
    );


  if (match) {

    return (
      match[3] +
      "-" +
      String(match[1])
        .padStart(2, "0") +
      "-" +
      String(match[2])
        .padStart(2, "0")
    );

  }


  /*
    MM/DD/YY
  */

  match =
    text.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{2})/
    );


  if (match) {

    const year =
      2000 +
      Number(
        match[3]
      );

    return (
      year +
      "-" +
      String(match[1])
        .padStart(2, "0") +
      "-" +
      String(match[2])
        .padStart(2, "0")
    );

  }


  /*
    Google Sheets may return something like:

    "Thu, Aug 20, 2026"
  */

  match =
    text.match(
      /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+([A-Za-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?/i
    );


  if (match) {

    const monthNames = {

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


    const month =
      monthNames[
        String(
          match[1]
        ).toLowerCase()
      ];


    if (month) {

      /*
        If year is missing, use current year.
      */

      const year =
        Number(
          match[3] ||
          new Date()
            .getFullYear()
        );


      return (
        year +
        "-" +
        String(month)
          .padStart(2, "0") +
        "-" +
        String(
          Number(match[2])
        ).padStart(2, "0")
      );

    }

  }


  /*
    Last attempt:
    native Date parser.
  */

  const parsed =
    new Date(text);


  if (
    !Number.isNaN(
      parsed.getTime()
    )
  ) {

    return (
      parsed.getFullYear() +
      "-" +
      String(
        parsed.getMonth() + 1
      ).padStart(2, "0") +
      "-" +
      String(
        parsed.getDate()
      ).padStart(2, "0")
    );

  }


  return "unknown";

}


/*
  Make sure every order has a normalized
  deliveryDateKey before rendering.
*/

function normalizeOrder(order) {

  const normalized = {
    ...order
  };


  normalized.deliveryDateKey =
    normalizeDateKey(
      normalized
    );


  /*
    Normalize common numeric fields.
  */

  normalized.total =
    Number(
      normalized.total || 0
    );


  /*
    Ensure items is always an array.
  */

  if (
    !Array.isArray(
      normalized.items
    )
  ) {

    normalized.items = [];

  }


  return normalized;

}


/* =========================================================
   ORDER FILTERING
========================================================= */

function isActiveOrder(order) {

  const status =
    String(
      order.status ||
      ""
    )
      .trim()
      .toLowerCase();


  /*
    Only Active orders should appear.

    Anything explicitly cancelled,
    canceled, completed, delivered etc.
    is excluded.
  */

  if (
    status === "cancelled" ||
    status === "canceled" ||
    status === "completed" ||
    status === "delivered" ||
    status === "inactive"
  ) {

    return false;

  }


  /*
    If status exists, require Active.

    This prevents unknown/corrupt rows
    from accidentally appearing.
  */

  if (
    status &&
    status !== "active"
  ) {

    return false;

  }


  return true;

}


/*
  Delivery users:

  Only today's orders.

  Admin:

  All active orders.
*/

function filterOrdersForCurrentUser(
  source
) {

  const active =
    source
      .map(normalizeOrder)
      .filter(
        isActiveOrder
      );


  const isAdmin =
    session &&
    session.user &&
    session.user.role ===
      "admin";


  if (isAdmin) {

    return active;

  }


  const today =
    todayDateKey();


  return active.filter(
    order =>
      order.deliveryDateKey ===
      today
  );

}


/* =========================================================
   API
========================================================= */

async function apiLogin(
  username,
  password
) {

  const response =
    await fetch(
      API_URL,
      {

        method:
          "POST",

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

          })

      }
    );


  const data =
    await response.json();


  if (!data.ok) {

    throw new Error(
      data.error ||
      "Login failed."
    );

  }


  return data;

}


async function apiGetOrders() {

  const response =
    await fetch(
      API_URL,
      {

        method:
          "POST",

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
    $("username")
      .value
      .trim();


  const password =
    $("password")
      .value;


  $("loginError")
    .textContent =
    "";


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
      error.message;

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

  supply =
    [];


  saveSession();


  $("appScreen")
    .classList
    .add(
      "hidden"
    );


  $("loginScreen")
    .classList
    .remove(
      "hidden"
    );


  $("password")
    .value =
    "";

}


/* =========================================================
   APP
========================================================= */

function showApp() {

  $("loginScreen")
    .classList
    .add(
      "hidden"
    );


  $("appScreen")
    .classList
    .remove(
      "hidden"
    );


  $("userLabel")
    .textContent =
    session.user.name;


  $("mainNav")
    .classList
    .remove(
      "hidden"
    );


  if (
    session.user.role ===
    "admin"
  ) {

    $("userLabel")
      .classList
      .add(
        "admin-label"
      );

  } else {

    $("userLabel")
      .classList
      .remove(
        "admin-label"
      );

  }


  setView(
    "delivery"
  );

}


async function refreshData() {

  if (!session) {
    return;
  }


  showLoading(true);


  try {

    const result =
      await apiGetOrders();


    /*
      Normalize the API orders first.
    */

    const apiOrders =
      Array.isArray(
        result.orders
      )
        ? result.orders
        : [];


    const normalizedOrders =
      apiOrders
        .map(
          normalizeOrder
        )
        .filter(
          isActiveOrder
        );


    /*
      Delivery view.

      Admin:
        all active orders

      Delivery guy:
        today's active assigned orders
        as returned by the API
    */

    orders =
      filterOrdersForCurrentUser(
        normalizedOrders
      );


    /*
      IMPORTANT:

      Do NOT use result.supply here.

      The previous implementation depended on
      result.supply, but those objects were missing
      delivery date / items / order details.

      Supply now uses the same complete active
      order objects, so it has the complete item
      information.
    */

    supply =
      filterOrdersForCurrentUser(
        normalizedOrders
      );


    renderDelivery();

    renderSupply();


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


  } catch (error) {

    toast(
      error.message
    );

  } finally {

    showLoading(false);

  }

}


function setView(view) {

  currentView =
    view;


  $("deliveryView")
    .classList
    .toggle(
      "hidden",
      view !== "delivery"
    );


  $("supplyView")
    .classList
    .toggle(
      "hidden",
      view !== "supply"
    );


  document
    .querySelectorAll(
      ".nav-button"
    )
    .forEach(
      button => {

        button
          .classList
          .toggle(
            "active",
            button.dataset.view ===
              view
          );

      }
    );

}


/* =========================================================
   GROUPING
========================================================= */

function slotInfo(slot) {

  const text =
    String(
      slot || ""
    )
      .trim()
      .toUpperCase();


  const match =
    text.match(
      /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/
    );


  if (!match) {

    return {

      sort:
        99999,

      label:
        slot ||
        "No slot"

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
    match[3] ||
    "";


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
      slot

  };

}


function groupOrders(list) {

  const dayMap = {};


  list.forEach(
    rawOrder => {

      const order =
        normalizeOrder(
          rawOrder
        );


      const dateKey =
        order.deliveryDateKey ||
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
            []

        };

      }


      dayMap[
        dateKey
      ]
        .orders
        .push(
          order
        );

    }
  );


  return Object
    .values(
      dayMap
    )
    .sort(
      (a, b) => {

        /*
          Put unknown dates last.
        */

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


        return a.dateKey.localeCompare(
          b.dateKey
        );

      }
    )
    .map(
      day => {

        const slotMap = {};


        day.orders.forEach(
          order => {

            const info =
              slotInfo(
                order.deliverySlot
              );


            /*
              Include label in key so that
              malformed slots don't collapse
              together accidentally.
            */

            const key =
              String(
                info.sort
              ) +
              "|" +
              String(
                info.label || ""
              );


            if (
              !slotMap[
                key
              ]
            ) {

              slotMap[
                key
              ] = {

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
            ]
              .orders
              .push(
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
              (a, b) =>
                a.sort -
                b.sort
            )
            .map(
              slot => {

                const buildingMap = {};


                slot.orders.forEach(
                  order => {

                    const building =
                      String(
                        order.building ||
                        "Unspecified"
                      )
                        .trim();


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
                      (a, b) =>
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


function formatDayLabel(
  dateKey
) {

  if (
    !dateKey ||
    dateKey ===
      "unknown"
  ) {

    return "Unknown Date";

  }


  const parts =
    dateKey.split("-");


  if (
    parts.length !==
    3
  ) {

    return dateKey;

  }


  const date =
    new Date(
      Number(
        parts[0]
      ),
      Number(
        parts[1]
      ) - 1,
      Number(
        parts[2]
      )
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
   DELIVERY VIEW
========================================================= */

function renderDelivery() {

  const container =
    $("deliveryOrders");


  if (!orders.length) {

    $("deliverySummary")
      .textContent =
      "No active deliveries";


    container.innerHTML =
      emptyState(
        "🚚",
        "No active deliveries",
        session.user.role ===
          "admin"
          ? "There are no active orders."
          : "There are no active orders assigned to you today."
      );

    return;

  }


  const customerSet =
    new Set(
      orders.map(
        order =>
          [
            order.building,
            order.apartment,
            order.phone
          ].join("|")
      )
    );


  const days =
    groupOrders(
      orders
    );


  $("deliverySummary")
    .textContent =
      `${orders.length} ${
        orders.length === 1
          ? "order"
          : "orders"
      } · ${
        customerSet.size
      } ${
        customerSet.size === 1
          ? "customer"
          : "customers"
      }`;


  container.innerHTML =
    days
      .map(
        day =>
          renderDay(
            day,
            "delivery"
          )
      )
      .join("");

}


/* =========================================================
   SUPPLY VIEW
========================================================= */

function renderSupply() {

  const container =
    $("supplyList");


  if (!supply.length) {

    container.innerHTML =
      emptyState(
        "🏭",
        "Nothing to prepare",
        session.user.role ===
          "admin"
          ? "There are no active orders."
          : "There are no active orders assigned to you today."
      );

    return;

  }


  const days =
    groupOrders(
      supply
    );


  container.innerHTML =
    days
      .map(
        day =>
          renderDay(
            day,
            "supply"
          )
      )
      .join("");

}


/* =========================================================
   DAY
========================================================= */

function renderDay(
  day,
  mode
) {

  const total =
    day.orders.reduce(
      (sum, order) =>
        sum +
        Number(
          order.total || 0
        ),
      0
    );


  return `

    <section
      class="day-section"
    >

      <div
        class="day-header"
      >

        <div>

          <div
            class="day-title"
          >
            📅
            ${escapeHtml(
              formatDayLabel(
                day.dateKey
              )
            )}
          </div>

          <div
            class="day-subtitle"
          >
            ${day.orders.length}
            ${
              day.orders.length === 1
                ? "order"
                : "orders"
            }
          </div>

        </div>


        <div
          class="day-total"
        >
          ${money(total)}
        </div>

      </div>


      <div
        class="day-content"
      >

        ${
          day.slots
            .map(
              slot =>
                renderSlot(
                  slot,
                  mode
                )
            )
            .join("")
        }

      </div>

    </section>

  `;

}


/* =========================================================
   SLOT
========================================================= */

function renderSlot(
  slot,
  mode
) {

  const total =
    slot.orders.reduce(
      (sum, order) =>
        sum +
        Number(
          order.total || 0
        ),
      0
    );


  return `

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
              slot.label ||
              "No Delivery Slot"
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
          ${money(total)}
        </div>

      </div>


      <div
        class="building-list"
      >

        ${
          slot.buildings
            .map(
              building =>
                renderBuilding(
                  building,
                  mode
                )
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

function renderBuilding(
  group,
  mode
) {

  const total =
    group.orders.reduce(
      (sum, order) =>
        sum +
        Number(
          order.total || 0
        ),
      0
    );


  return `

    <section
      class="building-card"
    >

      <div
        class="building-header"
      >

        <div>

          <div
            class="building-title"
          >
            🏢 Building
            ${escapeHtml(
              group.building
            )}
          </div>

          <div
            class="building-subtitle"
          >
            ${group.orders.length}
            ${
              group.orders.length === 1
                ? "order"
                : "orders"
            }
          </div>

        </div>


        <div
          class="building-total"
        >
          ${money(total)}
        </div>

      </div>


      <div
        class="building-orders"
      >

        ${
          group.orders
            .map(
              order =>
                renderOrder(
                  order,
                  mode
                )
            )
            .join("")
        }

      </div>

    </section>

  `;

}


/* =========================================================
   ORDER
========================================================= */

function renderOrder(
  order,
  mode
) {

  const isAdmin =
    session &&
    session.user &&
    session.user.role ===
      "admin";


  const assigned =
    String(
      order.deliveryMan ||
      ""
    ).trim();


  return `

    <article
      class="order-card"
    >

      <div
        class="order-top"
      >

        <div>

          <div
            class="order-id"
          >
            ${escapeHtml(
              order.orderId ||
              ""
            )}
          </div>


          <div
            class="customer-name"
          >
            ${escapeHtml(
              order.name ||
              "Customer"
            )}
          </div>


          <div
            class="customer-apartment"
          >
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
            isAdmin
              ? `
                <div
                  class="
                    assignment
                    ${
                      assigned
                        ? "assigned"
                        : "unassigned"
                    }
                  "
                >
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


        <div
          class="order-price"
        >
          ${money(
            order.total
          )}
        </div>

      </div>


      ${
        mode ===
        "delivery"
          ? `
            <div
              class="order-meta"
            >

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

            </div>
          `
          : ""
      }


      <div
        class="order-items"
      >

        ${
          order.items &&
          order.items.length
            ? order.items
                .map(
                  item => `

                    <div
                      class="order-item"
                    >

                      <span>
                        ${Number(
                          item.quantity ||
                          0
                        )}
                        ×
                        ${escapeHtml(
                          item.product ||
                          "Product"
                        )}
                      </span>

                    </div>

                  `
                )
                .join("")
            : `
              <div
                class="no-items"
              >
                No items found
              </div>
            `
        }

      </div>

    </article>

  `;

}


/* =========================================================
   EMPTY
========================================================= */

function emptyState(
  icon,
  title,
  text
) {

  return `

    <div
      class="empty-state"
    >

      <div
        class="empty-icon"
      >
        ${icon}
      </div>

      <h2>
        ${escapeHtml(
          title
        )}
      </h2>

      <p>
        ${escapeHtml(
          text
        )}
      </p>

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
      .classList
      .remove(
        "hidden"
      );


    $("appScreen")
      .classList
      .add(
        "hidden"
      );

  }

}


document.addEventListener(
  "DOMContentLoaded",
  init
);
