/************************************************************
 * MOHARAMBAKE DELIVERY APP
 *
 * READ ORDERS + DELIVERY STATUS UPDATE
 *
 * DELIVERY USER:
 *   - Today's orders only
 *   - Orders assigned to that delivery man only
 *
 * ADMIN:
 *   - All active orders
 *   - All delivery men
 *   - All dates
 *
 * IMPORTANT:
 *   Delivery users can write only the Status of their own active assigned orders to "Delivered".
 ************************************************************/


/* =========================================================
   CONFIG
========================================================= */

const SPREADSHEET_ID =
  "1y3FMn3N_sq8GqSjlSpyobkoIdAWINkPyAYPTMYVkpjg";

const ORDERS_SHEET_NAME = "Orders";
const ORDER_ITEMS_SHEET_NAME = "OrderItems";

const TIMEZONE = "Africa/Cairo";


/* =========================================================
   USERS
========================================================= */

const DELIVERY_USERS = {

  admin: {
    name: "Admin",
    password: "admin123",
    role: "admin"
  },

  ahmed: {
    name: "Ahmed",
    password: "1234",
    role: "delivery"
  },

  mohamed: {
    name: "Mohamed",
    password: "5678",
    role: "delivery"
  }

};


/* =========================================================
   WEB APP
========================================================= */

function doGet(e) {

  return jsonResponse({
    ok: true,
    service: "MoharamBake Delivery API",
    version: "4.0"
  });

}


function doPost(e) {

  try {

    const body =
      parseRequestBody(e);

    const action =
      String(
        body.action || ""
      ).trim();


    if (action === "deliveryLogin") {

      return jsonResponse(
        deliveryLogin(body)
      );

    }


    if (action === "deliveryOrders") {

      return jsonResponse(
        getDeliveryData(
          body.token
        )
      );

    }


    if (action === "markDelivered") {

      return jsonResponse(
        markOrderDelivered(
          body.token,
          body.orderId
        )
      );

    }


    return jsonResponse({

      ok: false,

      error:
        "Unknown POST action: " +
        action

    });


  } catch (error) {

    return jsonResponse({

      ok: false,

      error:
        error.message ||
        String(error)

    });

  }

}


/* =========================================================
   REQUEST
========================================================= */

function parseRequestBody(e) {

  if (
    !e ||
    !e.postData ||
    !e.postData.contents
  ) {

    return {};

  }


  try {

    return JSON.parse(
      e.postData.contents
    );

  } catch (error) {

    return {};

  }

}


/* =========================================================
   LOGIN
========================================================= */

function deliveryLogin(payload) {

  const username =
    String(
      payload.username || ""
    )
      .trim()
      .toLowerCase();


  const password =
    String(
      payload.password || ""
    );


  const user =
    DELIVERY_USERS[
      username
    ];


  if (
    !user ||
    String(user.password) !==
      password
  ) {

    throw new Error(
      "Invalid login credentials."
    );

  }


  const issuedAt =
    Date.now();


  const tokenPayload = {

    username:
      username,

    name:
      user.name,

    role:
      user.role,

    issuedAt:
      issuedAt,

    expiresAt:
      issuedAt +
      12 * 60 * 60 * 1000

  };


  return {

    ok: true,

    token:
      createSignedToken(
        tokenPayload
      ),

    user: {

      username:
        username,

      name:
        user.name,

      role:
        user.role

    },

    expiresAt:
      tokenPayload.expiresAt

  };

}


/* =========================================================
   TOKEN
========================================================= */

function getTokenSecret() {

  const properties =
    PropertiesService
      .getScriptProperties();


  let secret =
    properties.getProperty(
      "DELIVERY_TOKEN_SECRET"
    );


  if (!secret) {

    secret =
      Utilities.getUuid() +
      "-" +
      Utilities.getUuid();


    properties.setProperty(
      "DELIVERY_TOKEN_SECRET",
      secret
    );

  }


  return secret;

}


function createSignedToken(
  payload
) {

  const encoded =
    Utilities
      .base64EncodeWebSafe(
        JSON.stringify(payload)
      );


  const signature =
    Utilities
      .base64EncodeWebSafe(

        Utilities
          .computeHmacSha256Signature(
            encoded,
            getTokenSecret()
          )

      );


  return (
    encoded +
    "." +
    signature
  );

}


function verifyToken(token) {

  if (!token) {

    throw new Error(
      "Authentication required."
    );

  }


  const parts =
    String(token).split(".");


  if (
    parts.length !== 2
  ) {

    throw new Error(
      "Invalid authentication token."
    );

  }


  const encoded =
    parts[0];

  const suppliedSignature =
    parts[1];


  const expectedSignature =
    Utilities
      .base64EncodeWebSafe(

        Utilities
          .computeHmacSha256Signature(
            encoded,
            getTokenSecret()
          )

      );


  if (
    suppliedSignature !==
    expectedSignature
  ) {

    throw new Error(
      "Invalid authentication token."
    );

  }


  const payload =
    JSON.parse(

      Utilities
        .newBlob(
          Utilities
            .base64DecodeWebSafe(
              encoded
            )
        )
        .getDataAsString()

    );


  if (
    !payload.expiresAt ||
    Date.now() >
      Number(payload.expiresAt)
  ) {

    throw new Error(
      "Session expired. Please login again."
    );

  }


  const username =
    String(
      payload.username || ""
    )
      .trim()
      .toLowerCase();


  const user =
    DELIVERY_USERS[
      username
    ];


  if (!user) {

    throw new Error(
      "User no longer exists."
    );

  }


  return {

    username:
      username,

    name:
      user.name,

    role:
      user.role

  };

}


/* =========================================================
   MARK ORDER DELIVERED
   ---------------------------------------------------------
   Delivery users and Admin can mark orders as delivered.

   Security rules:
   1. Token must be valid.
   2. Order must exist.
   3. Order must currently be "Active".
   4. Delivery users must be assigned to the order.
   5. Admin can update any active order.
   6. Only the Status cell is changed to "Delivered".
========================================================= */

function markOrderDelivered(
  token,
  orderId
) {

  const user =
    verifyToken(token);


  const id =
    String(
      orderId || ""
    ).trim();


  if (!id) {

    throw new Error(
      "Order ID is required."
    );

  }


  /*
   * Prevent two delivery actions from updating
   * the same sheet at the same time.
   */

  const lock =
    LockService.getScriptLock();


  lock.waitLock(10000);


  try {

    const spreadsheet =
      SpreadsheetApp
        .openById(
          SPREADSHEET_ID
        );


    const ordersSheet =
      spreadsheet
        .getSheetByName(
          ORDERS_SHEET_NAME
        );


    if (!ordersSheet) {

      throw new Error(
        "Orders sheet not found."
      );

    }


    const values =
      ordersSheet
        .getDataRange()
        .getValues();


    if (
      values.length < 2
    ) {

      throw new Error(
        "Order not found."
      );

    }


    const headers =
      buildHeaderMap(
        values[0]
      );


    /*
     * Required columns.
     */

    const orderIdIndex =
      findHeaderIndex(
        headers,
        [
          "order id",
          "orderid",
          "order_id"
        ]
      );


    const statusIndex =
      findHeaderIndex(
        headers,
        [
          "status",
          "order status"
        ]
      );


    const deliveryManIndex =
      findHeaderIndex(
        headers,
        [
          "delivery man",
          "deliveryman",
          "delivery person",
          "assigned delivery man",
          "assigned delivery"
        ]
      );


    if (
      orderIdIndex < 0
    ) {

      throw new Error(
        "Order ID column not found."
      );

    }


    if (
      statusIndex < 0
    ) {

      throw new Error(
        "Status column not found."
      );

    }


    if (
      deliveryManIndex < 0
    ) {

      throw new Error(
        "Delivery Man column not found."
      );

    }


    /*
     * Find the exact order row.
     */

    let rowNumber =
      -1;

    let rowData =
      null;


    for (
      let i = 1;
      i < values.length;
      i++
    ) {

      const row =
        values[i];


      const currentId =
        String(
          row[
            orderIdIndex
          ] || ""
        ).trim();


      if (
        currentId === id
      ) {

        rowNumber =
          i + 1;

        rowData =
          row;

        break;

      }

    }


    if (
      rowNumber < 0
    ) {

      throw new Error(
        "Order not found."
      );

    }


    /*
     * Verify the current order status.
     */

    const currentStatus =
      String(
        rowData[
          statusIndex
        ] || ""
      )
        .trim()
        .toLowerCase();


    if (
      currentStatus !== "active"
    ) {

      throw new Error(
        "This order is no longer active."
      );

    }


    /*
     * CRITICAL SECURITY CHECK:
     *
     * A delivery user can only update an order
     * assigned to that delivery user.
     */

    const assigned =
      String(
        rowData[
          deliveryManIndex
        ] || ""
      ).trim();


    /*
     * Delivery users may only mark their own assigned orders.
     * Admin may mark any active order.
     */
    if (
      user.role !== "admin" &&
      !deliveryMatchesUser(
        assigned,
        user
      )
    ) {

      throw new Error(
        "This order is not assigned to you."
      );

    }


    /*
     * Update ONLY the Status cell.
     */

    ordersSheet
      .getRange(
        rowNumber,
        statusIndex + 1
      )
      .setValue(
        "Delivered"
      );


    SpreadsheetApp
      .flush();


    return {

      ok: true,

      orderId:
        id,

      status:
        "Delivered"

    };

  } finally {

    lock.releaseLock();

  }

}


/* =========================================================
   HEADER INDEX
========================================================= */

function findHeaderIndex(
  headerMap,
  possibleHeaders
) {

  for (
    let i = 0;
    i < possibleHeaders.length;
    i++
  ) {

    const key =
      normalizeHeader(
        possibleHeaders[i]
      );


    if (
      Object.prototype
        .hasOwnProperty
        .call(
          headerMap,
          key
        )
    ) {

      return headerMap[key];

    }

  }


  return -1;

}


/* =========================================================
   MAIN API
========================================================= */

function getDeliveryData(token) {

  const user =
    verifyToken(token);


  const isAdmin =
    user.role === "admin";


  const spreadsheet =
    SpreadsheetApp
      .openById(
        SPREADSHEET_ID
      );


  const ordersSheet =
    spreadsheet
      .getSheetByName(
        ORDERS_SHEET_NAME
      );


  const itemsSheet =
    spreadsheet
      .getSheetByName(
        ORDER_ITEMS_SHEET_NAME
      );


  if (!ordersSheet) {

    throw new Error(
      "Orders sheet not found."
    );

  }


  if (!itemsSheet) {

    throw new Error(
      "OrderItems sheet not found."
    );

  }


  /*
   * =======================================================
   * READ ORDERS
   * =======================================================
   */

  const ordersValues =
    ordersSheet
      .getDataRange()
      .getValues();


  if (
    ordersValues.length < 2
  ) {

    return {

      ok: true,

      user:
        user,

      isAdmin:
        isAdmin,

      today:
        getTodayKey(),

      orders:
        [],

      supply:
        []

    };

  }


  const orderHeaders =
    buildHeaderMap(
      ordersValues[0]
    );


  /*
   * =======================================================
   * READ ORDER ITEMS
   * =======================================================
   */

  const itemsValues =
    itemsSheet
      .getDataRange()
      .getValues();


  const itemHeaders =
    itemsValues.length
      ? buildHeaderMap(
          itemsValues[0]
        )
      : {};


  /*
   * Build:
   *
   * itemsByOrder[orderId] = [...]
   */

  const itemsByOrder = {};


  for (
    let i = 1;
    i < itemsValues.length;
    i++
  ) {

    const row =
      itemsValues[i];


    const orderId =
      String(
        getCell(
          row,
          itemHeaders,
          [
            "order id",
            "orderid",
            "order_id"
          ]
        ) || ""
      ).trim();


    if (!orderId) {
      continue;
    }


    const product =
      String(
        getCell(
          row,
          itemHeaders,
          [
            "product",
            "product name"
          ]
        ) || ""
      ).trim();


    const productId =
      String(
        getCell(
          row,
          itemHeaders,
          [
            "product id",
            "productid",
            "product_id"
          ]
        ) || ""
      ).trim();


    const quantity =
      toNumber(
        getCell(
          row,
          itemHeaders,
          [
            "quantity",
            "qty"
          ]
        )
      );


    const price =
      toNumber(
        getCell(
          row,
          itemHeaders,
          [
            "price"
          ]
        )
      );


    const total =
      toNumber(
        getCell(
          row,
          itemHeaders,
          [
            "total"
          ]
        )
      );


    /*
     * Don't filter item status here.
     *
     * The ORDER status determines whether the
     * complete order is active/cancelled.
     */

    const item = {

      product:
        product,

      productId:
        productId,

      quantity:
        quantity,

      price:
        price,

      total:
        total

    };


    if (
      !itemsByOrder[
        orderId
      ]
    ) {

      itemsByOrder[
        orderId
      ] = [];

    }


    itemsByOrder[
      orderId
    ].push(
      item
    );

  }


  /*
   * =======================================================
   * BUILD ACTIVE ORDERS
   * =======================================================
   */

  const activeOrders = [];


  for (
    let i = 1;
    i < ordersValues.length;
    i++
  ) {

    const row =
      ordersValues[i];


    const orderId =
      String(
        getCell(
          row,
          orderHeaders,
          [
            "order id",
            "orderid",
            "order_id"
          ]
        ) || ""
      ).trim();


    if (!orderId) {
      continue;
    }


    /*
     * -------------------------------------------------------
     * STATUS
     * -------------------------------------------------------
     */

    const status =
      String(
        getCell(
          row,
          orderHeaders,
          [
            "status",
            "order status"
          ]
        ) || ""
      )
        .trim()
        .toLowerCase();


    /*
     * CRITICAL:
     *
     * ONLY ACTIVE ORDERS ARE ALLOWED THROUGH.
     *
     * Cancelled orders never enter activeOrders.
     */

    if (
      status !== "active"
    ) {

      continue;

    }


    /*
     * -------------------------------------------------------
     * DELIVERY MAN
     * -------------------------------------------------------
     */

    const deliveryMan =
      String(
        getCell(
          row,
          orderHeaders,
          [
            "delivery man",
            "deliveryman",
            "delivery person",
            "assigned delivery man",
            "assigned delivery"
          ]
        ) || ""
      ).trim();


    /*
     * -------------------------------------------------------
     * DELIVERY DATE
     * -------------------------------------------------------
     */

    const rawDeliveryDate =
      getCell(
        row,
        orderHeaders,
        [
          "delivery date"
        ]
      );


    const dateKey =
      getDateKey(
        rawDeliveryDate
      );


    /*
     * -------------------------------------------------------
     * DELIVERY USER FILTER
     * -------------------------------------------------------
     */

    if (!isAdmin) {

      /*
       * Must be assigned.
       */

      if (
        !deliveryMatchesUser(
          deliveryMan,
          user
        )
      ) {

        continue;

      }


      /*
       * Must be TODAY.
       */

      if (
        dateKey !==
        getTodayKey()
      ) {

        continue;

      }

    }


    /*
     * -------------------------------------------------------
     * OTHER FIELDS
     * -------------------------------------------------------
     */

    const deliverySlot =
      String(
        getCell(
          row,
          orderHeaders,
          [
            "delivery slot"
          ]
        ) || ""
      ).trim();


    const building =
      String(
        getCell(
          row,
          orderHeaders,
          [
            "building",
            "building number"
          ]
        ) || ""
      ).trim();


    const apartment =
      String(
        getCell(
          row,
          orderHeaders,
          [
            "apartment",
            "apartment number"
          ]
        ) || ""
      ).trim();


    const customerName =
      String(
        getCell(
          row,
          orderHeaders,
          [
            "name",
            "customer name"
          ]
        ) || ""
      ).trim();


    const phone =
      String(
        getCell(
          row,
          orderHeaders,
          [
            "phone",
            "mobile",
            "mobile number"
          ]
        ) || ""
      ).trim();


    const total =
      toNumber(
        getCell(
          row,
          orderHeaders,
          [
            "total"
          ]
        )
      );


    const deliveryType =
      String(
        getCell(
          row,
          orderHeaders,
          [
            "delivery type"
          ]
        ) || ""
      ).trim();


    /*
     * -------------------------------------------------------
     * ITEMS
     * -------------------------------------------------------
     */

    const orderItems =
      itemsByOrder[
        orderId
      ] || [];


    /*
     * -------------------------------------------------------
     * CREATE ORDER
     * -------------------------------------------------------
     */

    activeOrders.push({

      orderId:
        orderId,

      createdAt:
        formatValue(
          getCell(
            row,
            orderHeaders,
            [
              "created at",
              "createdat"
            ]
          )
        ),

      name:
        customerName,

      phone:
        phone,

      deliveryType:
        deliveryType,

      deliveryDate:
        formatDeliveryDate(
          rawDeliveryDate
        ),

      deliveryDateKey:
        dateKey,

      deliverySlot:
        deliverySlot,

      total:
        total,

      status:
        "Active",

      userId:
        String(
          getCell(
            row,
            orderHeaders,
            [
              "user id",
              "userid",
              "user_id"
            ]
          ) || ""
        ).trim(),

      update:
        formatValue(
          getCell(
            row,
            orderHeaders,
            [
              "update"
            ]
          )
        ),

      building:
        building,

      apartment:
        apartment,

      deliveryMan:
        deliveryMan,

      items:
        orderItems

    });

  }


  /*
   * =======================================================
   * SORT
   *
   * DATE
   *   ↓
   * SLOT
   *   ↓
   * BUILDING
   *   ↓
   * APARTMENT
   * =======================================================
   */

  activeOrders.sort(
    function(a, b) {

      const dateCompare =
        String(
          a.deliveryDateKey
        ).localeCompare(
          String(
            b.deliveryDateKey
          )
        );


      if (
        dateCompare !== 0
      ) {

        return dateCompare;

      }


      const slotCompare =
        compareSlots(
          a.deliverySlot,
          b.deliverySlot
        );


      if (
        slotCompare !== 0
      ) {

        return slotCompare;

      }


      const buildingCompare =
        String(
          a.building || ""
        ).localeCompare(
          String(
            b.building || ""
          ),
          undefined,
          {
            numeric:
              true
          }
        );


      if (
        buildingCompare !== 0
      ) {

        return buildingCompare;

      }


      return String(
        a.apartment || ""
      ).localeCompare(
        String(
          b.apartment || ""
        ),
        undefined,
        {
          numeric:
            true
        }
      );

    }
  );


  /*
   * =======================================================
   * VERY IMPORTANT
   *
   * Supply = SAME activeOrders.
   *
   * No second filtering.
   * No second status check.
   * No second dataset.
   *
   * This guarantees:
   *
   * Delivery = Supply = same active orders.
   * =======================================================
   */

  return {

    ok: true,

    user:
      user,

    isAdmin:
      isAdmin,

    today:
      getTodayKey(),

    orders:
      activeOrders,

    supply:
      activeOrders

  };

}


/* =========================================================
   DELIVERY USER MATCH
========================================================= */

function deliveryMatchesUser(
  assigned,
  user
) {

  const a =
    String(
      assigned || ""
    )
      .trim()
      .toLowerCase();


  const username =
    String(
      user.username || ""
    )
      .trim()
      .toLowerCase();


  const name =
    String(
      user.name || ""
    )
      .trim()
      .toLowerCase();


  return (
    a === username ||
    a === name
  );

}


/* =========================================================
   HEADER MAP
========================================================= */

function normalizeHeader(
  value
) {

  return String(
    value || ""
  )
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      " "
    );

}


function buildHeaderMap(
  headers
) {

  const map = {};


  headers.forEach(
    function(
      header,
      index
    ) {

      const key =
        normalizeHeader(
          header
        );


      if (key) {

        map[key] =
          index;

      }

    }
  );


  return map;

}


function getCell(
  row,
  headerMap,
  possibleHeaders
) {

  for (
    let i = 0;
    i < possibleHeaders.length;
    i++
  ) {

    const key =
      normalizeHeader(
        possibleHeaders[i]
      );


    if (
      Object.prototype
        .hasOwnProperty
        .call(
          headerMap,
          key
        )
    ) {

      return row[
        headerMap[key]
      ];

    }

  }


  return "";

}


/* =========================================================
   DATE
========================================================= */

function getTodayKey() {

  return Utilities
    .formatDate(
      new Date(),
      TIMEZONE,
      "yyyy-MM-dd"
    );

}


function getDateKey(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return "";

  }


  /*
   * Google Sheets DATE CELL
   */

  if (
    Object.prototype
      .toString
      .call(value) ===
      "[object Date]"
  ) {

    if (
      isNaN(
        value.getTime()
      )
    ) {

      return "";

    }


    return Utilities
      .formatDate(
        value,
        TIMEZONE,
        "yyyy-MM-dd"
      );

  }


  const text =
    String(value)
      .trim();


  /*
   * yyyy-mm-dd
   */

  let match =
    text.match(
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
   * dd/mm/yyyy OR mm/dd/yyyy
   *
   * In Egypt, Google Sheets normally uses
   * day/month/year.
   */

  match =
    text.match(
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/
    );


  if (match) {

    const first =
      Number(match[1]);

    const second =
      Number(match[2]);

    const year =
      Number(match[3]);


    /*
     * If one number is > 12,
     * it clearly tells us which is the month.
     */

    let day;
    let month;


    if (
      first > 12
    ) {

      day =
        first;

      month =
        second;

    } else {

      /*
       * Default Egyptian format:
       * DD/MM/YYYY
       */

      day =
        first;

      month =
        second;

    }


    return (
      year +
      "-" +
      pad2(month) +
      "-" +
      pad2(day)
    );

  }


  /*
   * Google-formatted text such as:
   *
   * Wed, Aug 19
   *
   * or:
   *
   * Wed, Aug 19, 2026
   */

  match =
    text.match(
      /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?/i
    );


  if (match) {

    const month =
      monthNumber(
        match[1]
      );


    const day =
      Number(
        match[2]
      );


    const year =
      match[3]
        ? Number(match[3])
        : Number(
            Utilities
              .formatDate(
                new Date(),
                TIMEZONE,
                "yyyy"
              )
          );


    if (
      month &&
      day
    ) {

      return (
        year +
        "-" +
        pad2(month) +
        "-" +
        pad2(day)
      );

    }

  }


  /*
   * Generic Date parse.
   */

  const parsed =
    new Date(text);


  if (
    !isNaN(
      parsed.getTime()
    )
  ) {

    return Utilities
      .formatDate(
        parsed,
        TIMEZONE,
        "yyyy-MM-dd"
      );

  }


  return "";

}


function monthNumber(
  month
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
        month || ""
      )
        .toLowerCase()
    ] ||
    null
  );

}


function formatDeliveryDate(
  value
) {

  const key =
    getDateKey(value);


  if (!key) {

    return "";

  }


  const parts =
    key.split("-");


  const date =
    new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2])
    );


  return date.toLocaleDateString(
    "en-US",
    {
      weekday:
        "short",

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
   SLOT
========================================================= */

function compareSlots(
  a,
  b
) {

  const aa =
    slotToMinutes(a);

  const bb =
    slotToMinutes(b);


  if (
    aa === null &&
    bb === null
  ) {

    return String(
      a || ""
    ).localeCompare(
      String(
        b || ""
      )
    );

  }


  if (
    aa === null
  ) {

    return 1;

  }


  if (
    bb === null
  ) {

    return -1;

  }


  return aa - bb;

}


function slotToMinutes(
  value
) {

  const text =
    String(
      value || ""
    )
      .trim()
      .toUpperCase();


  const match =
    text.match(
      /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/
    );


  if (!match) {

    return null;

  }


  let hour =
    Number(
      match[1]
    );


  const minute =
    Number(
      match[2] || 0
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


  return (
    hour * 60 +
    minute
  );

}


/* =========================================================
   NUMBER / FORMAT
========================================================= */

function toNumber(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return 0;

  }


  const result =
    Number(
      String(value)
        .replace(
          /,/g,
          ""
        )
        .replace(
          /EGP/gi,
          ""
        )
        .trim()
    );


  return isNaN(result)
    ? 0
    : result;

}


function formatValue(
  value
) {

  if (
    Object.prototype
      .toString
      .call(value) ===
      "[object Date]"
  ) {

    if (
      isNaN(
        value.getTime()
      )
    ) {

      return "";

    }


    return Utilities
      .formatDate(
        value,
        TIMEZONE,
        "yyyy-MM-dd HH:mm"
      );

  }


  return String(
    value || ""
  );

}


function pad2(
  value
) {

  return String(
    value
  ).padStart(
    2,
    "0"
  );

}


/* =========================================================
   RESPONSE
========================================================= */

function jsonResponse(
  data
) {

  return ContentService
    .createTextOutput(
      JSON.stringify(
        data
      )
    )
    .setMimeType(
      ContentService
        .MimeType
        .JSON
    );

}