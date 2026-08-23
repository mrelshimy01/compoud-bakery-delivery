# MoharamBake Delivery App — v4.2

## What changed

### Delivery
- Delivery users see only today's active orders assigned to them.
- Every order now has a **✓ Mark as Delivered** button.
- The button is shown only to delivery users, not Admin.
- The user must confirm before marking an order delivered.
- The request is authenticated by the Apps Script token.
- The backend verifies that the order is:
  - Active
  - Assigned to the logged-in delivery user
- The Orders sheet Status cell is changed to exactly `Delivered`.
- After success, the app refreshes and the delivered order disappears from the active delivery list.

### Supply
- Existing Supply consolidation is preserved:
  Day → Time Slot → consolidated products.

### Caching
- `index.html` loads `app.js?v=4.2.0`.
- Service-worker cache is bumped to v3.
- Google Apps Script API responses are not cached.

## IMPORTANT: update the Apps Script backend

The ZIP contains:

`apps-script/Code.gs`

Copy the complete contents of that file into the Google Apps Script project that serves the Delivery API.

Then deploy a **new version of the same Web App deployment** (or create a new deployment if that is your established process).

The frontend `API_URL` is already pointing to the current Apps Script deployment URL from the existing project. If you create a different deployment URL, update `API_URL` at the top of `app.js`.

## Google Sheet requirement

The `Orders` sheet must contain:
- `Order ID`
- `Status`
- `Delivery Man`

The backend detects these columns by header name and does not depend on their exact column letters.

## Delivery flow

1. Delivery man logs in.
2. Opens Delivery.
3. Finds the order.
4. Taps **✓ Mark as Delivered**.
5. Confirms.
6. Apps Script verifies the user and assignment.
7. Orders → Status becomes `Delivered`.
8. The app refreshes.
9. The delivered order is removed from the active list.

## Admin

Admin can still view active orders, but cannot mark them delivered from this UI.


## v4.2 — Admin Mark as Delivered

- Admin accounts can now use **Mark as Delivered** on active orders.
- Delivery users remain restricted to orders assigned to them.
- The backend still changes only the `Status` cell to `Delivered`.
- Admin can mark any active order, regardless of delivery-man assignment.
- Frontend and service-worker cache versions were bumped to ensure the new button/behavior loads.


## v4.3 — Admin Delivered Authorization Fix

The Apps Script authorization for `markDelivered` explicitly allows the `admin` role to mark any active order as `Delivered`, while delivery users remain restricted to their assigned orders. Deploy the updated Apps Script as a new version.

## v4.4 — Phone Install Button

The login page now includes **Download on your phone**.

- Android / Chrome: uses the native `beforeinstallprompt` install flow when available.
- iPhone / iPad: shows Safari instructions for Share → Add to Home Screen.
- Other browsers: shows generic installation guidance.
- Added 192px and 512px PNG manifest icons and an Apple touch icon to improve PWA installation support.
- Backend behavior is unchanged from v4.3.
