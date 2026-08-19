const API_URL =
  "https://script.google.com/macros/s/AKfycbyUjlXAF_HOpLfT7q320Px_mKG9LwzllauZ_CnefQUpcxJIKDEzLXIlGYddklSIxYz9mA/exec";


let session = null;

let orders = [];

let supply = [];

let currentView = "delivery";


const $ = id =>
  document.getElementById(id);


/* =========================================================
   HELPERS
========================================================= */

function escapeHtml(
  value
) {

  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


function money(
  value
) {

  return (
    Number(
      value || 0
    )
      .toLocaleString(
        "en-US",
        {
          maximumFractionDigits: 0
        }
      ) +
    " EGP"
  );

}


function showLoading(
  show
) {

  $("loading")
    .classList
    .toggle(
      "hidden",
      !show
    );

}


function toast(
  message
) {

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
      JSON.stringify(
        session
      )
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


    return JSON.parse(
      saved
    );

  } catch (
    error
  ) {

    return null;

  }

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


  if (!response.ok) {

    throw new Error(
      "Login request failed."
    );

  }


  if (!data.ok) {

    throw new Error(
      data.error ||
      "Invalid login."
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


  if (!response.ok) {

    throw new Error(
      "Unable to load deliveries."
    );

  }


  if (!data.ok) {

    throw new Error(
      data.error ||
      "Unable to load deliveries."
    );

  }


  return data;

}


/* =========================================================
   LOGIN
========================================================= */

async function login(
  event
) {

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

  } catch (
    error
  ) {

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


  showLoading(
    true
  );


  try {

    const result =
      await apiGetOrders();


    orders =
      Array.isArray(
        result.orders
      )
        ? result.orders
        : [];


    supply =
      Array.isArray(
        result.supply
      )
        ? result.supply
        : [];


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

  } catch (
    error
  ) {

    toast(
      error.message ||
      "Unable to refresh."
    );

  } finally {

    showLoading(
      false
    );

  }

}


function setView(
  view
) {

  currentView =
    view;


  $("deliveryView")
    .classList
    .toggle(
      "hidden",
      view !==
        "delivery"
    );


  $("supplyView")
    .classList
    .toggle(
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
   DELIVERY GROUPING
========================================================= */

function getSlotKey(
  slot
) {

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
        9999,

      label:
        slot ||
        "No Delivery Slot"
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


  const ampm =
    match[3] ||
    "";


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


  return {

    sort:
      hour * 60 +
      minute,

    label:
      slot

  };

}


function groupBySlot(
  list
) {

  const groups =
    {};


  list.forEach(
    order => {

      const info =
        getSlotKey(
          order.deliverySlot
        );


      const key =
        String(
          info.sort
        );


      if (!groups[key]) {

        groups[key] = {

          sort:
            info.sort,

          label:
            info.label,

          orders:
            []

        };

      }


      groups[key]
        .orders
        .push(
          order
        );

    }
  );


  return Object
    .values(
      groups
    )
    .sort(
      (
        a,
        b
      ) =>
        a.sort -
        b.sort
    );

}


function groupByBuilding(
  list
) {

  const groups =
    {};


  list.forEach(
    order => {

      const building =
        String(
          order.building ||
          "Unspecified"
        )
          .trim();


      if (
        !groups[building]
      ) {

        groups[building] =
          [];

      }


      groups[building]
        .push(
          order
        );

    }
  );


  return Object
    .keys(
      groups
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
          groups[building]

      })
    );

}


function groupByCustomer(
  list
) {

  const groups =
    {};


  list.forEach(
    order => {

      const key =
        [
          order.apartment ||
            "",

          order.phone ||
            "",

          order.name ||
            ""

        ]
          .join("|")
          .toLowerCase();


      if (
        !groups[key]
      ) {

        groups[key] =
          [];

      }


      groups[key]
        .push(
          order
        );

    }
  );


  return Object
    .values(
      groups
    )
    .sort(
      (
        a,
        b
      ) => {

        const apartmentA =
          String(
            a[0].apartment ||
            ""
          );


        const apartmentB =
          String(
            b[0].apartment ||
            ""
          );


        return apartmentA
          .localeCompare(
            apartmentB,
            undefined,
            {
              numeric:
                true
            }
          );

      }
    );

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
      "No active deliveries";


    container.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">
          🚚
        </div>

        <h2>
          No active deliveries
        </h2>

        <p>
          There are currently no
          active orders for this account.
        </p>

      </div>

    `;

    return;

  }


  const slots =
    groupBySlot(
      orders
    );


  const customerKeys =
    new Set(
      orders.map(
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
      `${orders.length} ${
        orders.length === 1
          ? "order"
          : "orders"
      } · ` +
      `${customerKeys.size} ${
        customerKeys.size === 1
          ? "customer"
          : "customers"
      } · ` +
      `${slots.length} ${
        slots.length === 1
          ? "slot"
          : "slots"
      }`;


  container.innerHTML =
    slots
      .map(
        renderSlot
      )
      .join("");

}


function renderSlot(
  slot
) {

  const total =
    slot.orders
      .reduce(
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


  const buildings =
    groupByBuilding(
      slot.orders
    );


  return `

    <section
      class="slot-section"
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
                ? "delivery"
                : "deliveries"
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

function renderBuilding(
  group
) {

  const total =
    group.orders
      .reduce(
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


  const customers =
    groupByCustomer(
      group.orders
    );


  return `

    <section
      class="building-card"
    >

      <header
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
            ${customers.length}
            ${
              customers.length === 1
                ? "customer"
                : "customers"
            }
          </div>

        </div>


        <div
          class="building-total"
        >
          ${money(total)}
        </div>

      </header>


      <div
        class="customers"
      >

        ${
          customers
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

function renderCustomer(
  ordersForCustomer
) {

  const first =
    ordersForCustomer[0];


  const total =
    ordersForCustomer
      .reduce(
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

    <div
      class="customer-card"
    >

      <div
        class="customer-header"
      >

        <div>

          <div
            class="customer-name"
          >
            ${escapeHtml(
              first.name ||
              "Customer"
            )}
          </div>

          <div
            class="customer-apartment"
          >
            Apartment
            ${escapeHtml(
              first.apartment ||
              "-"
            )}
          </div>

          ${
            first.phone
              ? `

                <a
                  class="phone"
                  href="tel:${escapeHtml(
                    first.phone
                  )}"
                >
                  📞
                  ${escapeHtml(
                    first.phone
                  )}
                </a>

              `
              : ""
          }

        </div>


        <div
          class="customer-total"
        >
          ${money(total)}
        </div>

      </div>


      <div
        class="customer-orders"
      >

        ${
          ordersForCustomer
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

function renderOrder(
  order
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
    )
      .trim();


  const items =
    Array.isArray(
      order.items
    )
      ? order.items
      : [];


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
            Order
            ${escapeHtml(
              order.orderId
            )}
          </div>


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
                      ? "👤 " +
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


      <div
        class="order-items"
      >

        ${
          items.length
            ? items
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

      <div
        class="empty-state"
      >

        <div
          class="empty-icon"
        >
          🏭
        </div>

        <h2>
          Nothing to prepare
        </h2>

        <p>
          There are no active
          order items.
        </p>

      </div>

    `;

    return;

  }


  const totalUnits =
    supply.reduce(
      (
        sum,
        item
      ) =>
        sum +
        Number(
          item.quantity ||
          0
        ),
      0
    );


  container.innerHTML = `

    <div
      class="supply-summary"
    >

      <strong>
        ${supply.length}
        ${
          supply.length === 1
            ? "product"
            : "products"
        }
      </strong>

      <span>
        ${totalUnits}
        total units
      </span>

    </div>


    <div
      class="supply-card"
    >

      <div
        class="supply-header"
      >

        <span>
          Product
        </span>

        <span>
          Required
        </span>

      </div>


      ${
        supply
          .map(
            item => `

              <div
                class="supply-row"
              >

                <div>

                  <div
                    class="supply-product"
                  >
                    ${escapeHtml(
                      item.product
                    )}
                  </div>

                  <div
                    class="supply-orders"
                  >
                    ${Number(
                      item.orders ||
                      0
                    )}
                    ${
                      Number(
                        item.orders ||
                        0
                      ) === 1
                        ? "order"
                        : "orders"
                    }
                  </div>

                </div>


                <div
                  class="supply-quantity"
                >
                  ${Number(
                    item.quantity ||
                    0
                  )}
                </div>

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
