---
name: laundry-dev-sqa
description: >-
  Standardized SQA, architecture standards, UI/UX guidelines, and bug-fixing protocol for the FreshWave Laundry Station web application.
  Use this skill whenever implementing features, refactoring, fixing bugs, auditing POS billing calculations, modifying order lifecycles, thermal receipt generation, inventory controls, or customer tracking in the Laundry project, or when asked to "activate skill laundry-dev-sqa".
---

# FreshWave Laundry Engineering & SQA Protocol (SKILL)

This skill provides the mandatory engineering, quality assurance (SQA), and UI/UX protocol for developing, maintaining, and testing features in **FreshWave Laundry Station** — a responsive, client-side web application for laundry station management, customer tracking, cashier POS operations, and administrative analytics.

---

## 1. Pre-Flight Inspection (Run Before Touching Code)

Before writing or modifying any code in FreshWave Laundry, perform this 4-point impact check:

1. **Target Architecture & Module Isolation:**
   - **Central Data Store (`js/store.js`):** Contains `LaundryStore`, `STORAGE_KEYS`, `LAUNDRY_SERVICES`, `ADD_ONS`, `ORDER_STATUSES`, business calculations, inventory logic, and Web Audio chime engine. All data mutations must flow through `LaundryStore`.
   - **Customer Portal (`index.html`, `js/app.js`):** Public tracking, price estimator, slot reservations, and pickup/delivery requests. Never expose staff actions or unformatted raw order data here.
   - **Mobile Tracking View (`tracker.html`):** Lightweight standalone view designed for mobile phones and direct QR scan links (`tracker.html?jo=...`).
   - **Staff & Cashier Dashboard (`staff.html`, `js/staff.js`):** Fast job order entry, status stepper advancement, supply consumption, thermal receipt modal, and simulated SMS logs.
   - **Manager & Admin Dashboard (`admin.html`, `js/admin.js`):** High-DPI canvas charts (revenue, services), supply inventory thresholds, restock modal, and CRM customer records.
   - **Design System & Print Engine (`css/style.css`):** Shared CSS tokens, responsive layouts, glassmorphism UI, status badges, and `@media print` thermal receipt styling.

2. **Data Schema & LocalStorage Resilience:**
   - Any modification to order, inventory, customer, or notification structures must maintain backward compatibility with existing `localStorage` keys.
   - Never call `localStorage.clear()` indiscriminately; use `LaundryStore.resetDefaults()` or targeted key updates.
   - Always validate numbers with `Number()` or `parseFloat()` and fallback safely (`|| 0`) to prevent `NaN` leaking into billing or charts.

3. **Cross-Tab Synchronization Check:**
   - The application relies on multi-tab cashier & customer workflows. Changes in `staff.js` or `app.js` that update orders or inventory must trigger `window.dispatchEvent(new CustomEvent('freshwave_order_updated', ...))` and update `freshwave_orders_sync` in `localStorage` to notify other open tabs via `window.addEventListener('storage', ...)`.

4. **Console Baseline:**
   - Verify browser DevTools console is free from JavaScript uncaught exceptions, missing element query selector errors, and canvas rendering errors.

---

## 2. Core Pillars & Implementation Standards

### A. Order Lifecycle State Machine
Orders must strictly advance through valid sequential statuses:
`reserved` ➔ `received` ➔ `washing` ➔ `drying` ➔ `folding` ➔ `ready` ➔ `completed`

- **Automatic History Logging:** Every status change must append a `{ status, timestamp, note }` entry to `order.history`.
- **Timestamp Tracking:**
  - `ready`: Sets `readyAt` timestamp and automatically triggers an SMS notification log and audio chime.
  - `completed`: Sets `completedAt` timestamp and handles final payment collection if unpaid.
- **Auto Inventory Deduction:**
  - Transitioning an order to `washing` must invoke `LaundryStore.deductSuppliesForOrder(order)` (e.g., deducting liquid detergent, fabric conditioner, and packaging bags).

### B. Financial, POS Billing & Estimation Precision
- **Service Pricing Model:**
  - `wash-dry-fold`: ₱35/kg (Min 5kg = ₱175)
  - `wash-dry-press`: ₱55/kg (Min 4kg = ₱220)
  - `dry-cleaning`: ₱120/load (Special care)
  - `heavy-comforter`: ₱65/kg (Min 4kg = ₱260)
- **Add-On Rates:**
  - Downy Fabcon: +₱20
  - Oxygen Bleach: +₱25
  - Express Rush: +₱50
  - Eco Laundry Bag: +₱25
- **Mathematical Integrity:**
  - Round all monetary amounts to 2 decimal places (`.toFixed(2)`).
  - Bill calculation: `Math.max(weight, minKg) * pricePerKg + addOnsTotal`.
  - Cash tendered must equal or exceed `totalAmount`; `change = cashTendered - totalAmount`. Never allow negative change.

### C. Inventory Management & Safety Alerts
- Every supply item must define `stock`, `minStock`, and `unit`.
- When `stock <= minStock`, UI must display a **⚠️ Low Stock Warning** badge and highlight in the Admin inventory table.
- Stock adjustments must validate that deduction does not drive inventory below zero without staff confirmation.

### D. Real-Time Tracking & Offline QR Code Integration
- **Direct Link Support:** Query parameter `?jo=JO-XXXX` in `index.html` or `tracker.html` must instantly auto-populate and display the stepper without requiring manual clicks.
- **Offline QR Code Generation:** Use the local `QRCode` library (`js/qrcode.min.js`). Never depend on external Google Charts or third-party web APIs that fail when offline or on local networks.
- **QR Target:** Encodes the absolute or relative mobile tracking URL: `tracker.html?jo=${order.id}`.

### E. Digital Thermal Receipt Printing
- Must render cleanly on standard 58mm and 80mm thermal receipt roll printers.
- Ensure `@media print` rules hide sidebars, buttons, modals backdrops, and navigation bars, leaving only the receipt container (`#receipt-print-area`).
- Include: Job Order QR code, date/time, customer details, itemized billing breakdown, payment status (`PAID` / `UNPAID`), and pickup claim policy.

### F. Web Audio Chime & Notification Engine
- **Audio Context Resilience:** Browsers restrict auto-play until user interaction. Wrap all `AudioContext` calls with a check and resume state on first user click.
- **SMS Simulation:** Generate realistic notification messages with customer name, Job Order ID, current stage, and direct tracking URL. Store log in `freshwave_notifications`.

---

## 3. UI/UX Design System & Ergonomics

FreshWave is designed for busy laundry shop environments (bright lighting, fast-paced cashiering, and mobile customer access):

- **Color Palette & Visual Tokens:**
  - Primary Accent: Fresh Ocean Blue (`#0ea5e9`, `#0284c7`)
  - Status Success: Emerald Green (`#10b981`, `#059669`)
  - Status Warning/Drying: Warm Amber (`#f59e0b`)
  - Status Active/Washing: Cyan Glow (`#06b6d4`)
  - Backgrounds: Clean Crisp Slate (`#0f172a`, `#1e293b` for dark elements; `#f8fafc` for customer cards)
- **Touch & Accessibility:**
  - Interactive buttons and status chips must have a minimum touch target of **44x44 px**.
  - High visual contrast on status stepper icons and timeline nodes.
- **Keyboard Shortcuts (Cashier Mode):**
  - Pressing `F2` or clicking `+ New Order` opens the quick order entry modal.
  - Pressing `Esc` closes open modals.

---

## 4. Cross-Tab & Multi-Device Sync Protocol

1. **Storage Event Handling:**
   - Both `app.js` and `staff.js` must listen to the window `storage` event.
   - When an order is updated in the Staff tab, open customer tracker tabs must update their progress stepper in real-time.
2. **Heartbeat Sync:**
   - Maintain a background sync timestamp (`freshwave_orders_sync`) so tabs with active timers or focus state refresh data without hard reloads.

---

## 5. Post-Flight Quality Gate (Mandatory Verification)

After every feature addition, bug fix, or UI refactoring, execute these verification checks:

1. **Console Zero-Error Check:**
   - Open DevTools on `index.html`, `staff.html`, `admin.html`, and `tracker.html`. Confirm 0 JavaScript errors or unhandled promises.
2. **Billing Math Audit:**
   - Test regular calculation (e.g., 6kg Wash-Dry-Fold + Fabcon = `(6 * 35) + 20 = ₱230.00`).
   - Test minimum weight enforcement (e.g., 3kg Wash-Dry-Fold billed at minimum 5kg = `(5 * 35) = ₱175.00`).
3. **Status Stepper & Stock Deduction Test:**
   - Create a test order ➔ Advance to `Washing` ➔ Verify inventory counts for detergent, fabcon, and bags decrease by 1 unit in Admin ➔ Advance to `Ready for Pickup` ➔ Confirm SMS log created and chime audio triggers.
4. **Thermal Receipt Print Preview:**
   - Trigger the receipt modal and trigger `Print Receipt` (`window.print()`). Verify that print preview contains only the receipt, without page layout chrome.
5. **URL Deep Link Verification:**
   - Open `tracker.html?jo=JO-2026-101` in a new window. Verify it loads and highlights the order without manual interaction.
