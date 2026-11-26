# 🫧 Aquart Laundry — Smart Workflow & Order Tracking System

A modern, responsive, enterprise-grade web application for commercial and self-service laundry station operations built with standard web technologies (**HTML5, CSS3, and Vanilla JavaScript**). Designed to run client-side with zero external internet dependencies and zero build steps, fully compatible with **XAMPP Apache** and any modern web browser.

---

## 🌟 Key Modules & Features

### 1. 📱 Customer Portal & Live Order Tracker (`index.html` & `tracker.html`)
- **Aquart Service & Pricing Catalog**:
  - Precision vector SVG icons (replacing cartoon emojis) with complete commercial laundry care details:
    - *Wash • Dry • Fold*: ₱35 / kg (Everyday clothes, triple-rinse cycle, sealed packaging)
    - *Wash • Dry • Press*: ₱55 / kg (Executive steam pressing, hangers, dust covers)
    - *Dry Cleaning Special Care*: ₱120 / load (Eco-friendly solvent care for suits, gowns, Barongs)
    - *Comforter & Heavy Blankets*: ₱65 / kg (Heavy-duty wash/dry for King/Queen duvets)
- **Live 6-Stage Order Lifecycle Tracker**:
  - `Reserved` ➔ `Received` ➔ `Washing` ➔ `Drying` ➔ `Folding` ➔ `Ready for Pickup` ➔ `Completed`
  - Real-time lookup by Job Order Number (e.g., `JO-2026-1081`, `JO-2026-1082`, `JO-2026-1083`).
  - Native simulated QR Code camera scanner modal.
- **Priority Drop-off Slot Reservation**:
  - Select service, estimated weight, date, and preferred drop-off window.
  - Automatically generates an instant priority counter pass ticket with an offline QR code and copyable Job Order ID.
- **Interactive Price Estimator & Doorstep Pickup**:
  - Real-time weight slider with add-on toggles (fabric softener, oxygen bleach, express rush, doorstep delivery).
  - 1-click transfer to doorstep pickup request form.
- **Station Directory & Customer Contact Desk (`#contact-section`)**:
  - Central Hub details: J.P. Laurel Avenue, Bajada, Davao City.
  - Landline hotlines `(082) 298-5432`, mobile lines, operating hours (Mon-Sun), and interactive message inquiry form with store persistence.
- **Navigation Scroll-Spy & Smooth Navigation**:
  - Responsive navbar with dynamic active state highlighting for Home, Reserve Slot, Track Order, Pricing, Estimator, and Contact Us.
  - Professional customer presentation: direct links to staff portals removed from public tracking views.

---

### 2. 🔐 Authentication & Role-Based Access Control (`login.html`)
- **Admin-Managed Employee Provisioning**:
  - Public self-registration is disabled for privacy and business integrity.
  - Only the Station Administrator has authority to provision and revoke employee accounts.
- **Strict Route Guarding**:
  - Immediate head-level display suppression (`<style id="auth-guard-style">html { display: none !important; }</style>`) prevents flash-of-unauthorized-content.
  - Unauthorized direct URL pasting immediately redirects to `login.html`.
  - Cashier staff attempting to navigate to `admin.html` are blocked and redirected to `staff.html`.
- **Pre-Configured Default Demo Credentials**:
  - **Station Supervisor / Admin**: `admin@aquartlaundry.ph` / `admin123`
  - **Cashier / Counter Staff**: `staff@aquartlaundry.ph` / `staff123`
  - 1-click credential quick-fill chips for swift presentation testing.

---

### 3. 🧺 Staff & Cashier Order Processing Terminal (`staff.html`)
- **Counter Order Intake & POS Billing**:
  - Auto-generated sequential Job Order numbers (`JO-2026-XXXX`).
  - Live billing computation, add-ons, cash tendered, and exact change calculation.
- **One-Click Order Workflow Progression**:
  - One-click buttons: `Start Washing` ➔ `Move to Dryer` ➔ `Start Folding` ➔ `Ready for Pickup!` ➔ `Claim & Complete`.
  - Automatic inventory deduction when washing begins (detergent, fabric softener, polybags).
- **Consumables & Live Supply Tank Grid**:
  - Visual gauge cards for Eco Liquid Detergent, Fabric Softener, Color Bleach, Dryer Sheets, and Polybags.
  - Real-time low-stock alerts and quick-refill modal.
- **Digital & Printable Thermal Receipt**:
  - Formatted 80mm thermal receipt featuring Aquart Central Hub branding, itemized charges, payment status badges, and an offline Job Order QR code generated via `js/qrcode.min.js`.
- **Automated SMS Notification Simulator**:
  - Dispatches simulated SMS notifications with Web Audio chimes when orders reach "Ready for Pickup" or "Claimed".

---

### 4. 📊 Manager & Admin Analytics Dashboard (`admin.html`)
- **Executive Revenue Metrics & High-DPI Canvas Charts**:
  - Gross Revenue, Processed Volume (kg), Active Orders, and Accounts Receivable.
  - Interactive 7-day revenue performance bar chart and services distribution doughnut chart.
- **Employee & Staff Account Management**:
  - Real-time table listing all employee accounts, roles, corporate emails, and active statuses.
  - **+ Add New Employee Modal**: Provision cashier or supervisor credentials on the fly.
  - Role badge styling and account deletion protection (admin cannot delete their own active login account).
- **Master Inventory Management**:
  - Stock levels, minimum warning thresholds, unit costs, and quick restock actions.
- **Customer CRM**:
  - Customer lifetime spend, total visits, and contact directory.

---

## 🗄️ Database Architecture (`database/aquart_laundry.sql`)

While the application operates completely offline and client-side using browser `localStorage` for zero-configuration presentations, a production-grade MySQL schema is provided in `database/aquart_laundry.sql`:

- **Database Name**: `aquart_laundry` (Charset: `utf8mb4_unicode_ci`)
- **Core Relational Tables**:
  1. `users` (RBAC accounts, role enum, status, credentials)
  2. `inventory` (Chemical and packaging supply tracking, thresholds, cost per unit)
  3. `orders` (Job Order intake, customer info, weights, add-ons, payments, status lifecycle)
  4. `order_status_history` (Audit log of status updates with timestamps and responsible employee)
  5. `inquiries` (Contact Us form submissions from landing page)
  6. `pickup_requests` (Doorstep pickup and delivery online requests)
- **Reporting Views**:
  - `vw_daily_revenue_summary` (Aggregated daily sales, volume in kg, receivables)
  - `vw_inventory_reorder_alerts` (Automatic low-stock threshold queries)

---

## 🚀 How to Run & Test

### Option 1: Via Local XAMPP Apache
1. Confirm files are inside `C:\xampp\htdocs\Laundry`.
2. Start **Apache** in your **XAMPP Control Panel**.
3. Open in your web browser:
   - **Customer Landing & Tracker**: [http://localhost/Laundry/index.html](http://localhost/Laundry/index.html)
   - **Mobile Deep-Link Tracker**: [http://localhost/Laundry/tracker.html?jo=JO-2026-1081](http://localhost/Laundry/tracker.html?jo=JO-2026-1081)
   - **Staff & Admin Login**: [http://localhost/Laundry/login.html](http://localhost/Laundry/login.html)
   - **Staff Cashier Terminal**: [http://localhost/Laundry/staff.html](http://localhost/Laundry/staff.html)
   - **Admin Management Portal**: [http://localhost/Laundry/admin.html](http://localhost/Laundry/admin.html)

### Option 2: Via Built-in PHP Development Server (Port 8088)
```powershell
php -S localhost:8088 -t C:\xampp\htdocs\Laundry
```
Navigate to `http://localhost:8088/index.html` or `http://localhost:8088/login.html`.

---

## 📁 Directory Structure

```
c:\xampp\htdocs\Laundry\
├── index.html                   # Customer Portal, Service Catalog, Estimator, Contact Us
├── tracker.html                 # Customer Mobile Tracker (No Staff links)
├── login.html                   # Staff & Supervisor Authentication & RBAC Entry
├── staff.html                   # Cashier & Laundry Technician Terminal & POS
├── admin.html                   # Executive Analytics, Inventory, & Employee Management
├── database\
│   └── aquart_laundry.sql       # MySQL Database Schema, Seed Data, & Reporting Views
├── css\
│   └── style.css                # Master Design System, Badges, Modals, & Thermal Print CSS
└── js\
    ├── qrcode.min.js            # Standalone offline QR code generator (no internet needed)
    ├── store.js                 # Central Data Store, RBAC, Calculations, & Web Audio
    ├── app.js                   # Landing Page Logic, Nav Scroll-Spy, & Contact Form
    ├── staff.js                 # Cashier Workflow, POS, Inventory Deductions, Receipts
    └── admin.js                 # Analytics Charts, Employee Management, Inventory Restock
```

---

## 🛡️ SQA Verification Checklist
- [x] Brand consistency (**Aquart Laundry** with subtitle **SMART WORKFLOW & TRACKING**).
- [x] Public self-registration removed; admin employee creation modal implemented.
- [x] Public tracker and landing page have no exposed "Staff Portal" buttons.
- [x] Service catalog modernized with crisp SVG vector icons instead of cartoon emojis.
- [x] Public navbar links highlight correctly on click and via scroll-spy.
- [x] Strict RBAC route guards prevent unauthenticated or unauthorized URL direct access.
- [x] Customer contact inquiries are captured with toast notifications and stored in data state.
- [x] Zero external CDN or internet dependency for QR codes (`js/qrcode.min.js` runs client-side).
- [x] MySQL database script provided for instructor examination (`database/aquart_laundry.sql`).
