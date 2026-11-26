---
description: Software Quality Assurance (SQA), Architecture Standards, and Engineering Protocols for FreshWave Laundry Station
globs: "**/*.{html,js,css}"
---

# FreshWave Laundry SQA & Standardization Rules

Welcome to the Software Quality Assurance (SQA) and Standardization Rules for **FreshWave Laundry Station** — Modern Laundry Operations, Tracking, and Cashier POS Platform. These rules enforce strict architectural discipline, calculation precision, offline LocalStorage resilience, print fidelity, and production reliability.

---

## 1. Code Quality & Architectural Standards

### Architecture Layering (Separation of Concerns)
FreshWave follows a clean, modular structure:
- **Presentation & Customer Layer (`index.html`, `tracker.html`, `js/app.js`):** Responsive customer tracking, price estimator, and pickup request forms. Keeps customer actions strictly read-only or self-service.
- **Operations & Cashier Layer (`staff.html`, `js/staff.js`):** High-speed cashier Job Order creation, status progression, supply deduction, and thermal receipt generation.
- **Administration & Reporting Layer (`admin.html`, `js/admin.js`):** High-DPI canvas charts for revenue performance, low-stock threshold monitoring, and customer CRM.
- **Centralized Data & Engine Layer (`js/store.js`):** Single source of truth (`LaundryStore`) for `localStorage` persistence, pricing models, inventory mutations, status validation, and Web Audio API chime sounds.
- **Design System & Print Engine (`css/style.css`):** Consistent color palettes, dark & light themes, glassmorphism cards, responsive layouts, and `@media print` thermal receipt styling.

### Strict Coding Policy
- **Zero-Console-Error Standard:** Applications must run without unhandled runtime exceptions, missing DOM elements, or canvas context errors.
- **Safe Type Casting & Sanitization:**
  - Always sanitize numeric values using `Number()` or `parseFloat()` and fallback safely (e.g. `Number(val) || 0`).
  - Sanitize user strings before inserting into innerHTML (use `textContent` or escape utilities).
- **No Uncontrolled Global Mutex:** Mutate data exclusively via `LaundryStore` methods to ensure data consistency and cross-tab sync triggers.

---

## 2. FreshWave Core Feature Standards

FreshWave features must adhere to domain-specific contracts:

1. **Job Order Lifecycle State Machine:**
   - Valid sequence: `reserved` ➔ `received` ➔ `washing` ➔ `drying` ➔ `folding` ➔ `ready` ➔ `completed`.
   - Never skip statuses without explicit administrative override.
   - Status transitions must append a structured history log (`{ status, timestamp, note }`).
2. **Pricing & POS Calculation Precision:**
   - Every service must enforce its minimum load requirement (e.g. minimum 5kg for Wash-Dry-Fold @ ₱35/kg = ₱175).
   - Add-on fees (fabcon, color-safe bleach, rush fee, eco bag) must be itemized and mathematically verifiable.
   - Cash tendered calculation: `change = cashTendered - totalAmount`. Change must never be negative.
3. **Inventory Auto-Deduction & Stock Alert Thresholds:**
   - Moving an order to `washing` automatically deducts liquid detergent, fabric conditioner, and packaging bags.
   - Items with `stock <= minStock` must trigger high-visibility **⚠️ Low Stock Warning** indicators in the Admin Dashboard.
4. **Thermal Receipt Printing Protocol:**
   - Receipts must render cleanly on 58mm and 80mm thermal paper widths.
   - `@media print` styles must hide all navigation bars, sidebars, modals backdrops, and action buttons, leaving only `#receipt-print-area`.
   - Each printed receipt must include an offline-rendered QR code linking directly to `tracker.html?jo=JO-XXXX`.
5. **Real-time Mobile Tracking & QR Code Lookup:**
   - Deep linking via `?jo=...` parameter must instantly auto-display the order stepper.
   - Standalone QR generation must use the bundled offline library (`js/qrcode.min.js`) with zero external CDN dependencies.
6. **Web Audio Chime & Simulated SMS Dispatch:**
   - Browsers require user interaction before playing audio via Web Audio API. Always resume `AudioContext` inside user-initiated events.
   - Log outgoing SMS notifications to `freshwave_notifications` with customer name, order ID, and direct tracking link.

---

## 3. UI/UX Design System & Cashier Ergonomics

- **Color Palette:**
  - Primary Brand Accent: Fresh Ocean Blue (`#0ea5e9`, `#0284c7`)
  - Emerald Success: `#10b981`
  - Warning / Drying: `#f59e0b`
  - Deep Navy Slate: `#0f172a`, `#1e293b`
- **Touch & Accessibility:**
  - Minimum touch target: **44x44 px** for all interactive buttons and chips.
  - Clear visual contrast for status stepper icons and timeline checkpoints.
- **Cashier Ergonomics:**
  - Support keyboard shortcut `F2` for opening the **New Order** modal.
  - Support `Esc` key to dismiss modals.

---

## 4. LocalStorage & Multi-Tab Synchronization

- **Sync Architecture:**
  - Updates in one tab must notify other open tabs via the `window.addEventListener('storage', ...)` event.
  - Heartbeat sync timestamp (`freshwave_orders_sync`) ensures tabs in the background stay refreshed when focused.
- **Data Protection:**
  - Ensure fallback default data (`INITIAL_ORDERS`, `INITIAL_INVENTORY`, `INITIAL_CUSTOMERS`) is cleanly seeded if storage is initialized.

---

## 5. Testing & SQA Verification Protocols

Before submitting or releasing code:
1. **Console Baseline:**
   - Verify 0 console errors across all pages: `index.html`, `staff.html`, `admin.html`, and `tracker.html`.
2. **Order Lifecycle & Inventory Test:**
   - Create a test order ➔ transition to `washing` ➔ verify inventory supply decrements ➔ transition to `ready` ➔ verify SMS notification and audio chime.
3. **Calculation Verification:**
   - Validate weight calculations, add-ons sum, tender/change math, and daily revenue canvas chart aggregation.
4. **Print Verification:**
   - Preview receipt print mode to ensure proper 58mm/80mm layout without unwanted UI artifacts.
