-- ============================================================================
-- AQUART LAUNDRY (SMART WORKFLOW & TRACKING SYSTEM)
-- Complete Production Database Schema & Seed Data
-- Target Database: MySQL 5.7+ / MySQL 8.0+ / MariaDB 10.4+
-- Charset: utf8mb4 / Collation: utf8mb4_unicode_ci
-- Central Hub: J.P. Laurel Avenue, Bajada, Davao City
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `aquart_laundry` 
  DEFAULT CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE `aquart_laundry`;

-- ----------------------------------------------------------------------------
-- 1. USERS & STAFF CREDENTIALS TABLE (RBAC)
-- Role-based access control for Admins & Cashier Staff
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `order_status_history`;
DROP TABLE IF EXISTS `orders`;
DROP TABLE IF EXISTS `inventory`;
DROP TABLE IF EXISTS `inquiries`;
DROP TABLE IF EXISTS `pickup_requests`;
DROP TABLE IF EXISTS `users`;

CREATE TABLE `users` (
  `id` VARCHAR(50) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(100) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL COMMENT 'Bcrypt or SHA256 hashed password in production',
  `role` ENUM('admin', 'staff') NOT NULL DEFAULT 'staff',
  `phone` VARCHAR(30) DEFAULT NULL,
  `status` ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
  `last_login` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_users_role` (`role`),
  INDEX `idx_users_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. CONSUMABLES & INVENTORY TABLE
-- Real-time stock levels, replenishment limits, and auto-deduction
-- ----------------------------------------------------------------------------
CREATE TABLE `inventory` (
  `id` VARCHAR(50) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `category` ENUM('detergent', 'softener', 'bleach', 'dryer_sheet', 'packaging', 'other') NOT NULL,
  `quantity` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `unit` VARCHAR(20) NOT NULL COMMENT 'Liters, Loads, Sheets, Bags, etc.',
  `min_threshold` DECIMAL(10, 2) NOT NULL DEFAULT 5.00 COMMENT 'Trigger level for low stock alert',
  `max_capacity` DECIMAL(10, 2) NOT NULL DEFAULT 100.00,
  `cost_per_unit` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `last_restocked` DATETIME DEFAULT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_inv_category` (`category`),
  INDEX `idx_inv_quantity` (`quantity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. ORDERS TABLE (JOB ORDERS & WALK-IN / ONLINE BOOKINGS)
-- Tracks billing, weights, garment instructions, and 6-stage lifecycle
-- ----------------------------------------------------------------------------
CREATE TABLE `orders` (
  `id` VARCHAR(50) NOT NULL COMMENT 'Format: JO-YYYY-NNNN e.g. JO-2026-0001',
  `customer_name` VARCHAR(100) NOT NULL,
  `customer_phone` VARCHAR(30) NOT NULL,
  `customer_email` VARCHAR(100) DEFAULT NULL,
  `service_type` VARCHAR(50) NOT NULL COMMENT 'wash-dry-fold, wash-dry-press, dry-cleaning, heavy-comforter',
  `weight` DECIMAL(6, 2) NOT NULL DEFAULT 1.00 COMMENT 'Actual measured weight in kg',
  `pickup_delivery` ENUM('walkin', 'pickup', 'delivery', 'both') NOT NULL DEFAULT 'walkin',
  `customer_address` TEXT DEFAULT NULL,
  `detergent_type` VARCHAR(50) NOT NULL DEFAULT 'Standard Eco Liquid',
  `softener_type` VARCHAR(50) NOT NULL DEFAULT 'Ocean Breeze (Default)',
  `bleach_type` VARCHAR(50) NOT NULL DEFAULT 'None',
  `fold_preference` VARCHAR(50) NOT NULL DEFAULT 'Folded neatly in bags',
  `special_instructions` TEXT DEFAULT NULL,
  `payment_status` ENUM('unpaid', 'paid', 'refunded') NOT NULL DEFAULT 'unpaid',
  `payment_method` VARCHAR(50) NOT NULL DEFAULT 'cash' COMMENT 'cash, gcash, maya, bank_transfer',
  `subtotal` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `rush_fee` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `delivery_fee` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `discount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `total` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `amount_tendered` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `change_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `status` ENUM('reserved', 'received', 'washing', 'ready', 'completed', 'cancelled') NOT NULL DEFAULT 'received',
  `is_online_reservation` TINYINT(1) NOT NULL DEFAULT 0,
  `reserved_slot` VARCHAR(50) DEFAULT NULL,
  `tracking_pin` VARCHAR(10) DEFAULT NULL COMMENT 'Optional security PIN for client tracker verification',
  `created_by` VARCHAR(50) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_orders_status` (`status`),
  INDEX `idx_orders_customer_phone` (`customer_phone`),
  INDEX `idx_orders_payment_status` (`payment_status`),
  INDEX `idx_orders_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. ORDER STATUS AUDIT TRAIL (STAGE CHANGE HISTORY)
-- Strict chronological logging for each transition (received -> washing -> ready)
-- ----------------------------------------------------------------------------
CREATE TABLE `order_status_history` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `order_id` VARCHAR(50) NOT NULL,
  `status` ENUM('reserved', 'received', 'washing', 'ready', 'completed', 'cancelled') NOT NULL,
  `notes` TEXT DEFAULT NULL,
  `updated_by` VARCHAR(100) DEFAULT 'Station System',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_history_order_id` (`order_id`),
  CONSTRAINT `fk_history_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. CONTACT US & CUSTOMER INQUIRIES
-- Stores submissions from index.html #contact-section
-- ----------------------------------------------------------------------------
CREATE TABLE `inquiries` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `email` VARCHAR(100) DEFAULT NULL,
  `subject` VARCHAR(100) NOT NULL,
  `message` TEXT NOT NULL,
  `status` ENUM('new', 'in_progress', 'resolved', 'closed') NOT NULL DEFAULT 'new',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_inq_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. PICKUP & DELIVERY REQUESTS TABLE
-- Records online requests submitted from Doorstep Pickup form
-- ----------------------------------------------------------------------------
CREATE TABLE `pickup_requests` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `address` TEXT NOT NULL,
  `service_type` VARCHAR(50) NOT NULL,
  `estimated_weight` DECIMAL(6, 2) NOT NULL DEFAULT 5.00,
  `pickup_date` DATE NOT NULL,
  `time_window` VARCHAR(50) NOT NULL,
  `notes` TEXT DEFAULT NULL,
  `status` ENUM('pending', 'assigned', 'picked_up', 'cancelled') NOT NULL DEFAULT 'pending',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_pickup_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- SEED DATA INSERTION (Matches js/store.js default demo data)
-- ============================================================================

-- A. Default Staff & Administrator Accounts
INSERT INTO `users` (`id`, `name`, `email`, `password`, `role`, `phone`, `status`, `created_at`) VALUES
('usr-admin-01', 'Aquart Head Supervisor', 'admin@aquartlaundry.ph', 'admin123', 'admin', '09178902782', 'active', '2026-10-01 08:00:00'),
('usr-staff-01', 'Maria Santos (Cashier)', 'staff@aquartlaundry.ph', 'staff123', 'staff', '09204567890', 'active', '2026-10-05 08:30:00'),
('usr-staff-02', 'Junrey Tan (Laundry Tech)', 'junrey@aquartlaundry.ph', 'staff123', 'staff', '09187654321', 'active', '2026-10-12 09:00:00')
ON DUPLICATE KEY UPDATE `email`=VALUES(`email`);

-- B. Default Consumable Inventory Items
INSERT INTO `inventory` (`id`, `name`, `category`, `quantity`, `unit`, `min_threshold`, `max_capacity`, `cost_per_unit`, `last_restocked`) VALUES
('inv-01', 'Eco Ultra Liquid Detergent', 'detergent', 24.50, 'Liters', 8.00, 50.00, 145.00, '2026-10-27 10:00:00'),
('inv-02', 'Fabric Softener (Ocean Breeze)', 'softener', 18.20, 'Liters', 6.00, 40.00, 130.00, '2026-10-26 14:00:00'),
('inv-03', 'Oxygen Color-Safe Bleach', 'bleach', 4.80, 'Liters', 5.00, 25.00, 110.00, '2026-10-20 11:30:00'),
('inv-04', 'Dryer Anti-Static Sheets (Lavender)', 'dryer_sheet', 140.00, 'Sheets', 50.00, 300.00, 3.50, '2026-10-25 16:00:00'),
('inv-05', 'Clear Garment Covers (Press)', 'packaging', 88.00, 'Bags', 30.00, 200.00, 7.00, '2026-10-22 09:15:00'),
('inv-06', 'Heavy Duty Clean Polybags (Fold)', 'packaging', 210.00, 'Bags', 60.00, 500.00, 4.50, '2026-10-28 08:00:00')
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);

-- C. Sample Job Orders
INSERT INTO `orders` 
(`id`, `customer_name`, `customer_phone`, `customer_email`, `service_type`, `weight`, `pickup_delivery`, `customer_address`, `detergent_type`, `softener_type`, `bleach_type`, `fold_preference`, `special_instructions`, `payment_status`, `payment_method`, `subtotal`, `rush_fee`, `delivery_fee`, `discount`, `total`, `amount_tendered`, `change_amount`, `status`, `is_online_reservation`, `reserved_slot`, `created_at`) 
VALUES
('JO-2026-0001', 'Juan Dela Cruz', '0917-111-2222', 'juan.cruz@gmail.com', 'wash-dry-fold', 7.50, 'walkin', 'J.P. Laurel Ave, Bajada, Davao City', 'Standard Eco Liquid', 'Ocean Breeze (Default)', 'None', 'Folded neatly in bags', 'Please separate white shirts and use gentle wash on towels.', 'paid', 'cash', 262.50, 0.00, 0.00, 0.00, 262.50, 300.00, 37.50, 'ready', 0, NULL, '2026-10-28 08:30:00'),
('JO-2026-0002', 'Maria Santos', '0918-333-4444', 'maria.santos@yahoo.com', 'wash-dry-press', 5.00, 'delivery', 'Unit 402, Abreeza Residences, Davao City', 'Standard Eco Liquid', 'Ocean Breeze (Default)', 'Oxygen Bleach', 'On hangers with dust wrap', 'Executive shirts only, starch light collar.', 'unpaid', 'gcash', 275.00, 0.00, 50.00, 0.00, 325.00, 0.00, 0.00, 'washing', 0, NULL, '2026-10-28 09:45:00'),
('JO-2026-0003', 'Robert Lim', '0922-555-6666', 'rlim@corporate.ph', 'dry-cleaning', 3.00, 'walkin', 'Lanang Commercial Complex, Davao City', 'Eco Gentle Solvent', 'Gentle Fresh', 'None', 'Suit bag on hanger', 'Wool barong and 2 blazers. Spot stain on right lapel.', 'paid', 'maya', 360.00, 50.00, 0.00, 0.00, 410.00, 410.00, 0.00, 'received', 0, NULL, '2026-10-28 11:15:00'),
('JO-2026-0004', 'Sarah Geronimo', '0999-888-7777', 'sarah.g@viva.com.ph', 'wash-dry-fold', 9.00, 'walkin', 'Matina Heights, Davao City', 'Hypoallergenic Gentle', 'Lavender Calm', 'None', 'Folded neatly in bags', 'Bed sheets and pillowcases.', 'paid', 'cash', 315.00, 0.00, 0.00, 0.00, 315.00, 500.00, 185.00, 'completed', 0, NULL, '2026-10-27 14:00:00'),
('JO-2026-0005', 'Antonio Luna', '0917-555-1899', 'antonio.luna@history.ph', 'heavy-comforter', 8.00, 'pickup', 'Toril District, Davao City', 'Heavy Duty Deep Clean', 'Ocean Breeze (Default)', 'None', 'Heavy zippered comforter bag', 'Thick king-size winter duvet. Extra spin dry.', 'unpaid', 'cash', 520.00, 0.00, 60.00, 0.00, 580.00, 0.00, 0.00, 'reserved', 1, '10:00 AM - 12:00 PM', '2026-10-28 13:30:00')
ON DUPLICATE KEY UPDATE `customer_name`=VALUES(`customer_name`);

-- D. Initial Audit History
INSERT INTO `order_status_history` (`order_id`, `status`, `notes`, `updated_by`, `updated_at`) VALUES
('JO-2026-0001', 'received', 'Customer dropped off 7.5kg. Cash payment received.', 'Maria Santos (Cashier)', '2026-10-28 08:30:00'),
('JO-2026-0001', 'washing', 'Transferred to Washer Unit #2 (Standard 35-min cycle).', 'Junrey Tan (Laundry Tech)', '2026-10-28 09:00:00'),
('JO-2026-0001', 'ready', 'Dried, folded, and sealed in clean polybag. Shelf B-12.', 'Junrey Tan (Laundry Tech)', '2026-10-28 10:45:00'),
('JO-2026-0002', 'received', 'Scheduled for delivery to Abreeza Residences.', 'Maria Santos (Cashier)', '2026-10-28 09:45:00'),
('JO-2026-0002', 'washing', 'Pre-wash spot treatment applied. Currently inside Washer #4.', 'Junrey Tan (Laundry Tech)', '2026-10-28 10:15:00'),
('JO-2026-0003', 'received', 'Eco-solvent dry cleaning items tagged. Rush fee applied.', 'Maria Santos (Cashier)', '2026-10-28 11:15:00'),
('JO-2026-0004', 'received', 'Walk-in drop-off received.', 'Maria Santos (Cashier)', '2026-10-27 14:00:00'),
('JO-2026-0004', 'completed', 'Picked up by customer. Receipt signed.', 'Maria Santos (Cashier)', '2026-10-27 17:30:00'),
('JO-2026-0005', 'reserved', 'Online customer reservation booked via web portal.', 'Customer Web Portal', '2026-10-28 13:30:00');

-- ============================================================================
-- HELPER VIEWS FOR EXECUTIVE & AUDIT REPORTING
-- ============================================================================

-- View: Daily Sales & Revenue Breakdown
CREATE OR REPLACE VIEW `vw_daily_revenue_summary` AS
SELECT 
  DATE(`created_at`) AS `order_date`,
  COUNT(`id`) AS `total_orders`,
  SUM(CASE WHEN `payment_status` = 'paid' THEN `total` ELSE 0 END) AS `total_revenue_paid`,
  SUM(CASE WHEN `payment_status` = 'unpaid' THEN `total` ELSE 0 END) AS `total_receivables_unpaid`,
  SUM(`weight`) AS `total_kilograms_processed`
FROM `orders`
GROUP BY DATE(`created_at`)
ORDER BY `order_date` DESC;

-- View: Low Inventory Alert
CREATE OR REPLACE VIEW `vw_inventory_reorder_alerts` AS
SELECT 
  `id`,
  `name`,
  `category`,
  `quantity`,
  `unit`,
  `min_threshold`,
  `max_capacity`,
  ROUND((`quantity` / `max_capacity`) * 100, 1) AS `stock_percentage`,
  CASE 
    WHEN `quantity` <= (`min_threshold` * 0.5) THEN 'CRITICAL'
    WHEN `quantity` <= `min_threshold` THEN 'WARNING'
    ELSE 'HEALTHY'
  END AS `stock_status`
FROM `inventory`
WHERE `quantity` <= `min_threshold`
ORDER BY `quantity` ASC;

-- ============================================================================
-- END OF AQUART LAUNDRY DATABASE SCHEMA
-- ============================================================================
