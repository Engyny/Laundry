/**
 * FreshWave Laundry Station - Staff & Cashier Dashboard Logic
 * Job Order Entry, One-Click Status Updater, Digital Receipt Generator,
 * and Automated SMS/Notification trigger system.
 */

document.addEventListener('DOMContentLoaded', function () {
    LaundryStore.init();

    // Authenticated user session & navbar badge
    initStaffSession();

    initStaffDashboard();
    initStaffConsumables();
    initStaffRefillModal();
    initNewOrderForm();
    initReceiptModal();
    initReceiptProofModal();
    initNotificationLog();

    // Instant Dual-Channel Real-time Broadcast Bus
    if (window.AquartRealtimeBus) {
        window.AquartRealtimeBus.on((msg) => {
            if (msg.type === 'ORDER_SAVED') {
                renderOrdersTable();
                renderNotificationLog();
                renderStaffConsumables();
                if (msg.payload && msg.payload.isNew) {
                    const order = msg.payload.order;
                    if (order && order.isOnlineReservation) {
                        LaundryStore.playAudioChime('success');
                        showToast(`⚡ New Reservation: ${order.id} (${order.customerName})`, 'success');
                    } else if (order) {
                        LaundryStore.playAudioChime('tap');
                        showToast(`⚡ Order Updated: ${order.id}`, 'info');
                    }
                }
            } else if (msg.type === 'ORDER_STATUS_CHANGED' || msg.type === 'ORDER_PAYMENT_CHANGED') {
                renderOrdersTable();
                renderNotificationLog();
                renderStaffConsumables();
            } else if (msg.type === 'INVENTORY_UPDATED') {
                renderStaffConsumables();
            } else if (msg.type === 'SYSTEM_RESET') {
                renderOrdersTable();
                renderNotificationLog();
                renderStaffConsumables();
                showToast(`⚡ System Data Synchronized (${msg.payload.mode === 'clean_slate' ? 'Clean Slate' : 'Demo Data'})`);
            }
        });
    }

    // Re-render when storage changes across tabs (fallback)
    window.addEventListener('storage', (e) => {
        if (e.key === 'freshwave_orders' || e.key === 'freshwave_orders_sync' || e.key === 'aquart_realtime_event') {
            renderOrdersTable();
            renderNotificationLog();
        }
        if (e.key === 'freshwave_inventory' || e.key === 'freshwave_inventory_sync') {
            renderStaffConsumables();
        }
    });

    window.addEventListener('freshwave_order_updated', () => {
        renderOrdersTable();
        renderNotificationLog();
        renderStaffConsumables();
    });

    window.addEventListener('freshwave_inventory_updated', () => {
        renderStaffConsumables();
    });

    // Also re-render whenever the tab regains focus or visibility
    window.addEventListener('focus', () => {
        renderOrdersTable();
        renderNotificationLog();
        renderStaffConsumables();
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            renderOrdersTable();
            renderNotificationLog();
            renderStaffConsumables();
        }
    });

    // Periodic heartbeat sync (every 2.5 seconds)
    setInterval(() => {
        const lastSync = localStorage.getItem('freshwave_orders_sync');
        if (lastSync && lastSync !== window._lastLocalSync) {
            window._lastLocalSync = lastSync;
            renderOrdersTable();
        }
    }, 2500);
});

let currentFilter = 'all';

function initStaffDashboard() {
    // Populate customer quick select in new order modal/form
    populateCustomerDropdown();

    // Hook up clickable KPI metric cards
    document.querySelectorAll('.staff-kpi-card').forEach(card => {
        card.addEventListener('click', function () {
            const filter = this.getAttribute('data-filter') || 'all';
            currentFilter = filter;
            document.querySelectorAll('.filter-pill').forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-status') === filter);
            });
            renderOrdersTable();
        });
    });

    // Render table, metrics & alerts
    renderOrdersTable();

    // Search & Filter event listeners
    const searchInput = document.getElementById('staff-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => renderOrdersTable());
    }

    const filterButtons = document.querySelectorAll('.filter-pill');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', function () {
            filterButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.getAttribute('data-status');
            renderOrdersTable();
        });
    });

    // Clean Slate & Demo Data actions
    const cleanSlateBtn = document.getElementById('btn-staff-clean-slate');
    if (cleanSlateBtn) {
        cleanSlateBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset all orders to 0 (Clean Slate)?\n\nLogin credentials and station supplies will be preserved for live testing.')) {
                LaundryStore.resetToCleanSlate();
                renderOrdersTable();
                renderStaffConsumables();
                showToast('Clean Slate Activated: 0 active orders in system.');
            }
        });
    }

    const loadDemoBtn = document.getElementById('btn-staff-load-demo');
    if (loadDemoBtn) {
        loadDemoBtn.addEventListener('click', () => {
            if (confirm('Load 10 realistic demo orders and customer records into the system?')) {
                LaundryStore.loadDemoData();
                renderOrdersTable();
                renderStaffConsumables();
                showToast('Demo Data Loaded: 10 Orders active in system.');
            }
        });
    }

    // Auto-fill new JO number
    const joField = document.getElementById('order-jo-id');
    if (joField) {
        joField.value = LaundryStore.generateJobOrderId();
    }
}

function populateCustomerDropdown() {
    const custSelect = document.getElementById('order-customer-select');
    if (!custSelect) return;

    const customers = LaundryStore.getCustomers();
    custSelect.innerHTML = '<option value="">-- New Customer / Walk-in --</option>';
    customers.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.innerText = `${c.name} (${c.phone})`;
        custSelect.appendChild(opt);
    });

    custSelect.addEventListener('change', function () {
        const selectedId = this.value;
        const cust = customers.find(c => c.id === selectedId);
        if (cust) {
            document.getElementById('order-cust-name').value = cust.name;
            document.getElementById('order-cust-phone').value = cust.phone;
            document.getElementById('order-cust-address').value = cust.address || '';
        } else {
            document.getElementById('order-cust-name').value = '';
            document.getElementById('order-cust-phone').value = '';
            document.getElementById('order-cust-address').value = '';
        }
    });
}

function renderOrdersTable() {
    // 1. Always sync KPI metric cards & Online Reservation Alert Banner
    updateStaffMetrics();
    renderReservationAlerts();

    const tableBody = document.getElementById('staff-orders-tbody');
    if (!tableBody) return;

    const orders = LaundryStore.getOrders();
    const query = (document.getElementById('staff-search-input')?.value || '').toLowerCase().trim();

    let filtered = orders.filter(o => {
        const matchesStatus = (currentFilter === 'all') ? true : (o.status === currentFilter);
        const matchesQuery = query === '' ||
            o.id.toLowerCase().includes(query) ||
            o.customerName.toLowerCase().includes(query) ||
            (o.customerPhone && o.customerPhone.includes(query));
        return matchesStatus && matchesQuery;
    });

    tableBody.innerHTML = '';

    if (filtered.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2.5rem 1rem; color: #64748b;">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">🧺</div>
            <div style="font-weight: 700; color: #0f172a; margin-bottom: 0.2rem;">No Job Orders in Station Queue</div>
            <div style="font-size: 0.85rem; color: #94a3b8;">Click "+ New Job Order (F2)" to log a counter drop-off or wait for customer online bookings.</div>
        </td></tr>`;
        return;
    }

    filtered.forEach(order => {
        const tr = document.createElement('tr');
        if (order.createdAt && (Date.now() - new Date(order.createdAt).getTime()) < 15000) {
            tr.className = 'row-highlight-new';
        }

        // Status badge
        const sDef = ORDER_STATUSES.find(s => s.key === order.status) || {};
        const statusHtml = `<span class="status-badge status-${order.status}">${sDef.icon || '📌'} ${sDef.label || order.status}</span>`;

        // Payment badge
        let payHtml = '';
        if (order.paymentStatus === 'paid') {
            payHtml = `<span class="badge-paid">PAID (₱${order.totalAmount.toFixed(2)})</span>`;
        } else if (order.paymentStatus === 'pending_verification') {
            payHtml = `
                <span class="badge-unpaid" style="background: #fef3c7; color: #92400e; border-color: #fde68a;">
                    VERIFYING: ₱${order.totalAmount.toFixed(2)}
                </span>
                <div style="font-size: 0.72rem; color: #0284c7; font-weight: 700; margin-top: 2px;">
                    ${order.paymentMethod || 'Online Transfer'}
                </div>
            `;
        } else {
            payHtml = `<span class="badge-unpaid">UNPAID ₱${order.totalAmount.toFixed(2)}</span>`;
        }

        // Next Step Action button calculation
        const nextActionHtml = getNextActionButtons(order);

        const createdDate = new Date(order.createdAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });

        tr.innerHTML = `
            <td>
                <div style="font-weight: 800; font-family: monospace; color: #0284c7;">${order.id}</div>
                <div style="font-size: 0.75rem; color: #94a3b8;">${createdDate}</div>
            </td>
            <td>
                <div style="font-weight: 700; color: #0f172a;">${order.customerName}</div>
                <div style="font-size: 0.78rem; color: #64748b;">${order.customerPhone || 'N/A'}</div>
                ${order.dropOffSlot ? `<div style="font-size: 0.72rem; color: #b45309; font-weight: 700; margin-top: 3px; display: inline-flex; align-items: center; gap: 3px; background: #fef3c7; padding: 2px 6px; border-radius: 4px;">Scheduled: ${order.dropOffDate || ''} • ${order.dropOffSlot}</div>` : ''}
            </td>
            <td>
                <div style="font-weight: 600;">${order.serviceName}</div>
                <div style="font-size: 0.78rem; color: #64748b;">${order.weight} kg ${order.isDelivery ? '• 🚚 Delivery' : ''}</div>
            </td>
            <td>
                ${order.notes && order.notes !== 'Standard Care & Handling' 
                    ? `<div style="font-size: 0.78rem; color: #0369a1; background: #f0f9ff; border: 1px solid #bae6fd; padding: 4px 8px; border-radius: 6px; font-weight: 600; line-height: 1.35; max-width: 220px;">
                        📌 ${order.notes}
                       </div>` 
                    : `<span style="font-size: 0.75rem; color: #94a3b8; font-style: italic;">Standard Care</span>`}
            </td>
            <td>${statusHtml}</td>
            <td>
                ${payHtml}
                ${order.paymentProofImage || order.paymentRefNumber ? `<button type="button" class="btn btn-outline btn-sm btn-view-proof" data-id="${order.id}" style="padding: 2px 7px; font-size: 0.7rem; margin-top: 3px; display: inline-flex; align-items: center; gap: 3px; border-color: #93c5fd; color: #0284c7; background: #f0f9ff;">🖼️ View Proof</button>` : ''}
                ${order.paymentStatus === 'unpaid' ? `<button class="btn btn-outline btn-sm btn-mark-paid" data-id="${order.id}" style="padding: 2px 6px; font-size: 0.7rem; margin-top: 4px; display: block;">Mark as Paid</button>` : ''}
                ${order.paymentStatus === 'pending_verification' ? `<button class="btn btn-primary btn-sm btn-verify-paid" data-id="${order.id}" style="padding: 2px 8px; font-size: 0.7rem; margin-top: 4px; display: block; background: #059669; border: none;">✓ Confirm Payment</button>` : ''}
            </td>
            <td>
                <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
                    ${nextActionHtml}
                </div>
            </td>
            <td>
                <div style="display: flex; gap: 0.3rem;">
                    <button class="btn btn-outline btn-sm btn-view-receipt" data-id="${order.id}" title="Print / View Digital Receipt">🧾 Receipt</button>
                    <a href="tracker.html?jo=${order.id}" target="_blank" class="btn btn-outline btn-sm" title="View Customer Tracker">📱 Track</a>
                </div>
            </td>
        `;

        tableBody.appendChild(tr);
    });

    // Attach event listeners for status updates
    attachTableActionEvents();
}

/**
 * CALCULATE WORKFLOW COUNTS & UPDATE KPI STATS AND PILL BADGES
 */
function updateStaffMetrics() {
    const orders = LaundryStore.getOrders();
    const counts = {
        reserved: 0,
        received: 0,
        washing: 0,
        drying: 0,
        folding: 0,
        ready: 0,
        completed: 0,
        all: orders.length
    };

    orders.forEach(o => {
        if (counts[o.status] !== undefined) {
            counts[o.status]++;
        }
    });

    // Update KPI numbers
    const kpiReserved = document.getElementById('kpi-reserved-num');
    if (kpiReserved) kpiReserved.innerText = counts.reserved;

    const kpiReceived = document.getElementById('kpi-received-num');
    if (kpiReceived) kpiReceived.innerText = counts.received;

    const kpiWashing = document.getElementById('kpi-washing-num');
    if (kpiWashing) kpiWashing.innerText = (counts.washing + counts.drying);

    const kpiReady = document.getElementById('kpi-ready-num');
    if (kpiReady) kpiReady.innerText = counts.ready;

    const kpiTotal = document.getElementById('kpi-total-num');
    if (kpiTotal) kpiTotal.innerText = counts.all;

    // Update Pill counter badges
    const setPillCount = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };
    setPillCount('count-all', counts.all);
    setPillCount('count-reserved', counts.reserved);
    setPillCount('count-received', counts.received);
    setPillCount('count-washing', counts.washing);
    setPillCount('count-drying', counts.drying);
    setPillCount('count-folding', counts.folding);
    setPillCount('count-ready', counts.ready);
    setPillCount('count-completed', counts.completed);
}

/**
 * INCOMING ONLINE RESERVATIONS ALERT BANNER
 */
function renderReservationAlerts() {
    const alertContainer = document.getElementById('staff-reservation-alerts');
    if (!alertContainer) return;

    const orders = LaundryStore.getOrders();
    const reserved = orders.filter(o => o.status === 'reserved');

    if (reserved.length === 0) {
        alertContainer.style.display = 'none';
        alertContainer.innerHTML = '';
        return;
    }

    alertContainer.style.display = 'block';
    alertContainer.innerHTML = `
        <div class="staff-res-alert-banner">
            <div class="staff-res-alert-header">
                <div class="staff-res-alert-title">
                    <span class="status-dot-pulse" style="background:#f59e0b;"></span>
                    <span>📅 Online Drop-off Reservations Awaiting Customer Drop-off (${reserved.length})</span>
                </div>
                <div style="font-size: 0.8rem; color: #b45309; font-weight: 700;">
                    Click "Receive Laundry" when customer arrives at counter
                </div>
            </div>
            <div class="staff-res-list">
                ${reserved.map(o => `
                    <div class="staff-res-card">
                        <div class="staff-res-card-top">
                            <span class="staff-res-jo">${o.id}</span>
                            <span class="staff-res-slot-badge">Scheduled: ${o.dropOffDate || 'Today'} • ${o.dropOffSlot || 'Scheduled'}</span>
                        </div>
                        <div>
                            <div class="staff-res-cust">${o.customerName}</div>
                            <div class="staff-res-meta">Phone: ${o.customerPhone || 'N/A'} • ${o.serviceName} (${o.weight} kg)</div>
                            ${o.notes ? `<div style="font-size: 0.75rem; color: #0369a1; background: #e0f2fe; border: 1px solid #bae6fd; padding: 4px 8px; border-radius: 6px; margin-top: 5px; font-weight: 600;">Care Instructions: ${o.notes}</div>` : ''}
                            <div style="font-size: 0.8rem; font-weight: 700; color: #0284c7; margin-top: 4px; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
                                <span>Est: ₱${o.totalAmount.toFixed(2)} (${o.paymentStatus === 'paid' ? 'PAID' : (o.paymentStatus === 'pending_verification' ? '⏳ Verifying ' + (o.paymentMethod || '') : 'Pay at Counter')})</span>
                                ${o.paymentProofImage || o.paymentRefNumber ? `<button type="button" class="btn btn-outline btn-sm btn-view-proof" data-id="${o.id}" style="padding: 1px 6px; font-size: 0.68rem; border-color: #93c5fd; color: #0284c7; background: white;">🖼️ View Proof</button>` : ''}
                            </div>
                        </div>
                        <button type="button" class="btn-res-receive-fast btn-update-status" data-id="${o.id}" data-status="received">
                            <span>Receive Laundry at Counter</span>
                        </button>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    // Hook up receive buttons inside alert
    alertContainer.querySelectorAll('.btn-update-status').forEach(btn => {
        btn.addEventListener('click', function () {
            const orderId = this.getAttribute('data-id');
            LaundryStore.updateOrderStatus(orderId, 'received', 'Customer arrived and dropped off laundry at counter.');
            LaundryStore.playAudioChime('tap');
            if (window.showToast) window.showToast(`✅ ${orderId} received at counter! Moved to active queue.`);
            renderOrdersTable();
        });
    });
}

function getNextActionButtons(order) {
    switch (order.status) {
        case 'reserved':
            return `<button class="btn btn-warning btn-sm btn-update-status" data-id="${order.id}" data-status="received" title="Confirm Garment Drop-off at Counter"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10H3M21 14H3M5 6h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"/></svg> Receive Laundry</button>`;
        case 'received':
            return `<button class="btn btn-action-wash btn-sm btn-update-status" data-id="${order.id}" data-status="washing" title="Move to Washing Machine">🧼 Start Washing</button>`;
        case 'washing':
            return `<button class="btn btn-action-dry btn-sm btn-update-status" data-id="${order.id}" data-status="drying" title="Move to Dryer">💨 Move to Dryer</button>`;
        case 'drying':
            return `<button class="btn btn-action-fold btn-sm btn-update-status" data-id="${order.id}" data-status="folding" title="Start Folding & Packing">🧺 Start Folding</button>`;
        case 'folding':
            return `<button class="btn btn-action-ready btn-sm btn-update-status" data-id="${order.id}" data-status="ready" title="Notify Customer Ready!">✨ Ready for Pickup!</button>`;
        case 'ready':
            return `<button class="btn btn-action-complete btn-sm btn-update-status" data-id="${order.id}" data-status="completed" title="Customer Claimed">✅ Claim & Complete</button>`;
        case 'completed':
            return `<span style="font-size: 0.75rem; color: #10b981; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;">✅ Claimed</span>`;
        default:
            return '';
    }
}

function attachTableActionEvents() {
    // Status update click
    document.querySelectorAll('.btn-update-status').forEach(btn => {
        btn.addEventListener('click', function () {
            const orderId = this.getAttribute('data-id');
            const newStatus = this.getAttribute('data-status');
            const res = LaundryStore.updateOrderStatus(orderId, newStatus);
            if (res && res.notification) {
                // Show automated notification simulation modal / toast
                showSmsNotificationPopup(res.notification);
            }
            renderOrdersTable();
        });
    });

    // Mark as paid
    document.querySelectorAll('.btn-mark-paid').forEach(btn => {
        btn.addEventListener('click', function () {
            const orderId = this.getAttribute('data-id');
            LaundryStore.updatePaymentStatus(orderId, 'paid', 'Cash Counter');
            LaundryStore.playAudioChime('tap');
            showToast(`Order ${orderId} marked as PAID!`);
            renderOrdersTable();
        });
    });

    // Verify online payment (GCash / Maya)
    document.querySelectorAll('.btn-verify-paid').forEach(btn => {
        btn.addEventListener('click', function () {
            const orderId = this.getAttribute('data-id');
            const order = LaundryStore.getOrderById(orderId);
            const method = order ? (order.paymentMethod || 'Online Transfer') : 'Online Payment';
            LaundryStore.updatePaymentStatus(orderId, 'paid', `${method} (Verified)`);
            LaundryStore.playAudioChime('ready');
            showToast(`Payment for ${orderId} confirmed as PAID via ${method}!`, 'success');
            renderOrdersTable();
        });
    });

    // View receipt
    document.querySelectorAll('.btn-view-receipt').forEach(btn => {
        btn.addEventListener('click', function () {
            const orderId = this.getAttribute('data-id');
            openReceiptModal(orderId);
        });
    });

    // View online payment receipt proof
    document.querySelectorAll('.btn-view-proof').forEach(btn => {
        btn.addEventListener('click', function () {
            const orderId = this.getAttribute('data-id');
            openReceiptProofModal(orderId);
        });
    });
}

/**
 * NEW JOB ORDER CREATION
 */
function initNewOrderForm() {
    const form = document.getElementById('new-order-form');
    if (!form) return;

    // Dynamic price calculation inside form
    const serviceSelect = document.getElementById('order-service-select');
    const weightInput = document.getElementById('order-weight-input');
    const addonCheckboxes = document.querySelectorAll('.order-addon-check');
    const deliveryCheck = document.getElementById('order-is-delivery');
    const cashGivenInput = document.getElementById('order-cash-given');
    const changeDisplay = document.getElementById('order-change-display');

    function updateFormTotal() {
        const service = serviceSelect.value;
        const weight = parseFloat(weightInput.value) || 5;
        const addOns = [];
        addonCheckboxes.forEach(cb => {
            if (cb.checked) addOns.push(cb.value);
        });
        const isDelivery = deliveryCheck ? deliveryCheck.checked : false;

        const calc = LaundryStore.calculatePrice(service, weight, addOns, isDelivery);
        document.getElementById('order-calc-total').innerText = `₱${calc.grandTotal.toFixed(2)}`;
        document.getElementById('order-calc-breakdown').innerText = `(${calc.billableWeight}kg @ ₱${calc.service.pricePerKg} + Addons ₱${calc.addOnTotal}${isDelivery ? ' + Del ₱50' : ''})`;

        // Calculate change
        const cash = parseFloat(cashGivenInput?.value) || 0;
        if (changeDisplay) {
            const change = Math.max(0, cash - calc.grandTotal);
            changeDisplay.innerText = `₱${change.toFixed(2)}`;
        }

        return calc;
    }

    if (serviceSelect) serviceSelect.addEventListener('change', updateFormTotal);
    if (weightInput) weightInput.addEventListener('input', updateFormTotal);
    addonCheckboxes.forEach(cb => cb.addEventListener('change', updateFormTotal));
    if (deliveryCheck) deliveryCheck.addEventListener('change', updateFormTotal);
    if (cashGivenInput) cashGivenInput.addEventListener('input', updateFormTotal);

    updateFormTotal();

    // Form submission
    form.addEventListener('submit', function (e) {
        e.preventDefault();

        const joId = document.getElementById('order-jo-id').value;
        const custName = document.getElementById('order-cust-name').value.trim();
        const custPhone = document.getElementById('order-cust-phone').value.trim();
        const custAddress = document.getElementById('order-cust-address').value.trim();
        const serviceId = serviceSelect.value;
        const weight = parseFloat(weightInput.value) || 5;
        const notes = document.getElementById('order-notes').value.trim();
        const payStatus = document.getElementById('order-pay-status').value;
        const payMethod = document.getElementById('order-pay-method').value;

        if (!custName) {
            showToast('Please enter the Customer Name.', 'error');
            return;
        }

        const addOns = [];
        addonCheckboxes.forEach(cb => {
            if (cb.checked) addOns.push(cb.value);
        });
        const isDelivery = deliveryCheck ? deliveryCheck.checked : false;

        const calc = LaundryStore.calculatePrice(serviceId, weight, addOns, isDelivery);

        const newOrder = {
            id: joId,
            customerName: custName,
            customerPhone: custPhone || 'N/A',
            customerAddress: custAddress || 'Walk-in',
            serviceId: serviceId,
            serviceName: calc.service.name,
            weight: weight,
            addOns: addOns,
            subtotal: calc.subtotal,
            addOnTotal: calc.addOnTotal,
            deliveryFee: calc.deliveryFee,
            totalAmount: calc.grandTotal,
            paymentStatus: payStatus,
            paymentMethod: payMethod,
            status: 'received',
            notes: notes,
            isDelivery: isDelivery,
            createdAt: new Date().toISOString(),
            history: [
                {
                    status: 'received',
                    timestamp: new Date().toISOString(),
                    note: 'Job Order created at cashier'
                }
            ]
        };

        LaundryStore.saveOrder(newOrder);
        LaundryStore.playAudioChime('tap');
        showToast(`Job Order ${newOrder.id} successfully created!`);

        // Close modal
        const modal = document.getElementById('new-order-modal');
        if (modal) modal.classList.remove('active');

        // Refresh UI
        renderOrdersTable();
        populateCustomerDropdown();

        // Regenerate next JO ID
        document.getElementById('order-jo-id').value = LaundryStore.generateJobOrderId();
        form.reset();
        updateFormTotal();

        // Prompt to view/print receipt
        setTimeout(() => {
            openReceiptModal(newOrder.id);
        }, 300);
    });

    // Modal triggers
    const openBtn = document.getElementById('btn-open-new-order');
    const modal = document.getElementById('new-order-modal');
    const closeBtn = document.getElementById('btn-close-new-order');

    if (openBtn && modal) {
        openBtn.addEventListener('click', () => {
            document.getElementById('order-jo-id').value = LaundryStore.generateJobOrderId();
            modal.classList.add('active');
        });
    }

    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    }
}

/**
 * DIGITAL RECEIPT MODAL & PRINTING
 */
function initReceiptModal() {
    const modal = document.getElementById('receipt-modal');
    const closeBtn = document.getElementById('btn-close-receipt');
    const printBtn = document.getElementById('btn-print-receipt');
    const sendSmsBtn = document.getElementById('btn-send-receipt-sms');

    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    }

    const exportPdfBtn = document.getElementById('btn-export-pdf');
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', () => {
            const joId = document.getElementById('receipt-jo-id')?.innerText || 'Receipt';
            const oldTitle = document.title;
            document.title = `Aquart_Receipt_${joId}`;
            window.print();
            setTimeout(() => { document.title = oldTitle; }, 1000);
        });
    }

    if (printBtn) {
        printBtn.addEventListener('click', () => {
            const joId = document.getElementById('receipt-jo-id')?.innerText || 'Receipt';
            const oldTitle = document.title;
            document.title = `Aquart_Receipt_${joId}`;
            window.print();
            setTimeout(() => { document.title = oldTitle; }, 1000);
        });
    }

    if (sendSmsBtn) {
        sendSmsBtn.addEventListener('click', () => {
            const currentJo = document.getElementById('receipt-jo-id')?.innerText;
            const order = LaundryStore.getOrderById(currentJo);
            if (order) {
                const trackUrl = `${window.location.origin}${window.location.pathname.replace('staff.html', '')}tracker.html?jo=${order.id}`;
                const text = `Hi ${order.customerName}! Your laundry JO# is ${order.id}. Track your real-time status here: ${trackUrl}`;
                prompt('Customer SMS Link (Send via phone or messaging app):', text);
            }
        });
    }
}

function openReceiptModal(orderId) {
    const order = LaundryStore.getOrderById(orderId);
    if (!order) return;

    const modal = document.getElementById('receipt-modal');
    if (!modal) return;

    document.getElementById('receipt-jo-id').innerText = order.id;
    document.getElementById('receipt-date-time').innerText = new Date(order.createdAt).toLocaleString('en-PH');
    document.getElementById('receipt-cust-name').innerText = order.customerName;
    document.getElementById('receipt-cust-phone').innerText = order.customerPhone || 'N/A';
    document.getElementById('receipt-service-title').innerText = order.serviceName;
    document.getElementById('receipt-weight-display').innerText = `${order.weight} kg`;
    document.getElementById('receipt-subtotal-display').innerText = `₱${(order.subtotal || (order.totalAmount - (order.addOnTotal || 0))).toFixed(2)}`;
    document.getElementById('receipt-addons-display').innerText = `₱${(order.addOnTotal || 0).toFixed(2)}`;
    document.getElementById('receipt-total-display').innerText = `₱${order.totalAmount.toFixed(2)}`;

    const notesElem = document.getElementById('receipt-notes-display');
    if (notesElem) {
        notesElem.innerText = order.notes || 'Standard Care & Handling';
    }

    // Payment badge on receipt
    const payBadge = document.getElementById('receipt-payment-badge');
    if (payBadge) {
        if (order.paymentStatus === 'paid') {
            payBadge.className = 'badge-paid';
            payBadge.innerText = `PAID (${order.paymentMethod || 'Cash'})`;
        } else {
            payBadge.className = 'badge-unpaid';
            payBadge.innerText = 'UNPAID';
        }
    }

    // QR Code for Customer tracking
    const qrHolder = document.getElementById('receipt-qr-container');
    if (qrHolder) {
        qrHolder.innerHTML = '';
        const trackUrl = `${window.location.origin}${window.location.pathname.replace('staff.html', '')}tracker.html?jo=${order.id}`;
        new QRCode(qrHolder, {
            text: trackUrl,
            width: 120,
            height: 120,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
    }

    modal.classList.add('active');
}

/**
 * ONLINE PAYMENT PROOF MODAL (Screenshot & Ref Verification)
 */
let currentProofOrderId = null;

function initReceiptProofModal() {
    const modal = document.getElementById('staff-receipt-modal');
    if (!modal) return;

    const closeBtn = document.getElementById('btn-close-receipt-proof');
    const cancelBtn = document.getElementById('btn-cancel-proof-modal');
    const confirmBtn = document.getElementById('btn-modal-confirm-paid');

    const closeModal = () => {
        modal.classList.remove('active');
        currentProofOrderId = null;
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            if (!currentProofOrderId) return;
            const order = LaundryStore.getOrderById(currentProofOrderId);
            const method = order ? (order.paymentMethod || 'Online Transfer') : 'Online Payment';
            LaundryStore.updatePaymentStatus(currentProofOrderId, 'paid', `${method} (Verified)`);
            LaundryStore.playAudioChime('ready');
            showToast(`Payment for ${currentProofOrderId} verified & confirmed as PAID!`, 'success');
            closeModal();
            renderOrdersTable();
        });
    }
}

function openReceiptProofModal(orderId) {
    const order = LaundryStore.getOrderById(orderId);
    if (!order) return;
    currentProofOrderId = orderId;

    const modal = document.getElementById('staff-receipt-modal');
    if (!modal) return;

    const joElem = document.getElementById('proof-modal-jo');
    const custElem = document.getElementById('proof-modal-cust');
    const amtElem = document.getElementById('proof-modal-amount');
    const methodElem = document.getElementById('proof-modal-method');

    if (joElem) joElem.innerText = order.id;
    if (custElem) custElem.innerText = `${order.customerName} (${order.customerPhone || 'N/A'})`;
    if (amtElem) amtElem.innerText = `₱${order.totalAmount.toFixed(2)}`;
    if (methodElem) methodElem.innerText = order.paymentMethod || 'Online Payment';

    const imgWrap = document.getElementById('proof-modal-img-wrap');
    const noImgWrap = document.getElementById('proof-modal-no-img');
    const imgElem = document.getElementById('proof-modal-img');
    const confirmBtn = document.getElementById('btn-modal-confirm-paid');

    if (order.paymentProofImage) {
        if (imgWrap) imgWrap.style.display = 'flex';
        if (noImgWrap) noImgWrap.style.display = 'none';
        if (imgElem) imgElem.src = order.paymentProofImage;
    } else {
        if (imgWrap) imgWrap.style.display = 'none';
        if (noImgWrap) noImgWrap.style.display = 'block';
        if (imgElem) imgElem.src = '';
    }

    if (confirmBtn) {
        confirmBtn.style.display = (order.paymentStatus === 'paid') ? 'none' : 'inline-flex';
    }

    modal.classList.add('active');
}

/**
 * AUTOMATED NOTIFICATION POPUP SIMULATION
 */
function showSmsNotificationPopup(notification) {
    const modal = document.getElementById('sms-preview-modal');
    if (!modal) {
        showToast(notification.message);
        return;
    }

    document.getElementById('sms-preview-phone').innerText = notification.customerPhone;
    document.getElementById('sms-preview-name').innerText = notification.customerName;
    document.getElementById('sms-preview-content').innerText = notification.message;
    document.getElementById('sms-preview-time').innerText = new Date().toLocaleTimeString('en-PH');

    modal.classList.add('active');

    const closeBtn = document.getElementById('btn-close-sms-modal');
    if (closeBtn) {
        closeBtn.onclick = () => modal.classList.remove('active');
    }
}

function initNotificationLog() {
    renderNotificationLog();
}

function renderNotificationLog() {
    const container = document.getElementById('notification-logs-list');
    if (!container) return;

    const notifs = LaundryStore.getNotifications();
    container.innerHTML = '';

    if (notifs.length === 0) {
        container.innerHTML = `<div style="font-size: 0.82rem; color: #94a3b8; text-align: center; padding: 1rem;">No automated notifications yet.</div>`;
        return;
    }

    notifs.slice(0, 10).forEach(n => {
        const item = document.createElement('div');
        item.style.cssText = 'padding: 0.75rem 0.9rem; border-bottom: 1px solid #e2e8f0; font-size: 0.82rem; background: #fff; border-radius: 10px; border: 1px solid #e2e8f0;';

        const smsStatus = n.smsStatus || 'local';
        let badgeHtml = '';
        if (smsStatus === 'sent') {
            badgeHtml = `<span style="display:inline-flex;align-items:center;gap:3px;background:#d1fae5;color:#065f46;padding:2px 7px;border-radius:999px;font-size:0.68rem;font-weight:700;"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> SMS Sent</span>`;
        } else if (smsStatus === 'failed') {
            badgeHtml = `<span style="display:inline-flex;align-items:center;gap:3px;background:#fee2e2;color:#991b1b;padding:2px 7px;border-radius:999px;font-size:0.68rem;font-weight:700;" title="${(n.smsError || 'Failed').replace(/"/g, '&quot;')}"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Failed</span>`;
        } else if (smsStatus === 'pending') {
            badgeHtml = `<span style="display:inline-flex;align-items:center;gap:3px;background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:999px;font-size:0.68rem;font-weight:700;">Sending...</span>`;
        } else if (smsStatus === 'skipped') {
            badgeHtml = `<span style="display:inline-flex;align-items:center;gap:3px;background:#f1f5f9;color:#475569;padding:2px 7px;border-radius:999px;font-size:0.68rem;font-weight:700;" title="${(n.smsError || '').replace(/"/g, '&quot;')}">Cooldown</span>`;
        } else {
            badgeHtml = `<span style="display:inline-flex;align-items:center;gap:3px;background:#e0f2fe;color:#0369a1;padding:2px 7px;border-radius:999px;font-size:0.68rem;font-weight:700;">In-App</span>`;
        }

        const showResend = (smsStatus === 'failed' || smsStatus === 'skipped' || smsStatus === 'sent');
        const resendBtnHtml = showResend
            ? `<button type="button" class="btn-resend-sms" data-notif-id="${n.id}" style="border:1px solid #cbd5e1;background:#f8fafc;color:#0f172a;padding:2px 8px;border-radius:6px;font-size:0.68rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:3px;"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Resend</button>`
            : '';

        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.4rem; margin-bottom: 0.3rem;">
                <span style="font-weight: 700; color: #0284c7; display: inline-flex; align-items: center; gap: 4px;"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg> ${n.customerName} (${n.customerPhone})</span>
                <span style="font-size: 0.72rem; color: #94a3b8;">${new Date(n.timestamp).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div style="color: #475569; line-height: 1.35; margin-bottom: 0.45rem;">${n.message}</div>
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                ${badgeHtml}
                ${resendBtnHtml}
            </div>
            ${smsStatus === 'failed' && n.smsError ? `<div style="margin-top:0.3rem;font-size:0.7rem;color:#dc2626;">${n.smsError}</div>` : ''}
        `;
        container.appendChild(item);
    });

    container.querySelectorAll('.btn-resend-sms').forEach(btn => {
        btn.addEventListener('click', async function () {
            const notifId = this.getAttribute('data-notif-id');
            this.disabled = true;
            this.innerText = 'Sending...';
            const res = await LaundryStore.resendSms(notifId);
            if (window.showToast) {
                if (res && res.ok) {
                    showToast('SMS resent via Android SMSGate!');
                } else {
                    showToast('SMS resend failed: ' + ((res && res.error) || 'Check shop phone'), 'error');
                }
            }
            renderNotificationLog();
        });
    });
}

/**
 * -------------------------------------------------------------
 * STAFF USER SESSION & NAVBAR BADGE
 * -------------------------------------------------------------
 */
function initStaffSession() {
    const user = LaundryStore.getCurrentUser();
    if (!user) return;

    const nameElem = document.getElementById('staff-user-name');
    const roleElem = document.getElementById('staff-user-role');
    const initialsElem = document.getElementById('staff-user-initials');
    const logoutBtn = document.getElementById('btn-staff-logout');

    const displayName = user.fullName || user.name || user.username;
    if (nameElem) nameElem.innerText = displayName;
    if (roleElem) {
        roleElem.innerText = (user.role || 'staff').toUpperCase();
        roleElem.className = `role-pill ${user.role || 'staff'}`;
    }
    if (initialsElem) {
        const rawName = displayName.trim();
        const parts = rawName.split(/\s+/);
        const initials = parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : rawName.substring(0, 2).toUpperCase();
        initialsElem.innerText = initials;
    }

    // Role-based visibility: Only supervisor/admin can see the Admin Analytics nav link
    const adminNavItem = document.getElementById('nav-item-admin');
    if (adminNavItem) {
        if (user.role === 'admin') {
            adminNavItem.style.display = 'inline-block';
        } else {
            adminNavItem.style.display = 'none';
        }
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm(`Log out of session (${displayName})?`)) {
                LaundryStore.logout();
            }
        });
    }
}

/**
 * -------------------------------------------------------------
 * STATION CONSUMABLES & LIVE SUPPLY MONITORING
 * Real-time tank levels for Detergents, Softeners, Bleach & Packaging
 * -------------------------------------------------------------
 */
function initStaffConsumables() {
    renderStaffConsumables();
}

function renderStaffConsumables() {
    const container = document.getElementById('staff-supplies-grid');
    if (!container) return;

    const inventory = LaundryStore.getInventory();
    container.innerHTML = '';

    // Standard capacity reference per supply category
    const standardCapacities = {
        'inv-1': 50,  // Ariel Pro Detergent (50 Liters capacity)
        'inv-2': 35,  // Downy Fabcon (35 Liters capacity)
        'inv-3': 20,  // Bleach & Spotters (20 Bottles capacity)
        'inv-4': 400  // Packaging Bags (400 Pieces capacity)
    };

    let criticalCount = 0;
    let lowCount = 0;

    inventory.forEach(item => {
        const threshold = item.minStock !== undefined ? item.minStock : (item.minAlert !== undefined ? item.minAlert : (item.min_threshold || 10));
        const maxCap = standardCapacities[item.id] || (threshold * 2.5);
        const pct = Math.min(100, Math.max(4, Math.round((item.stock / maxCap) * 100)));

        let statusClass = 'healthy';
        let statusLabel = 'HEALTHY';
        let barClass = 'healthy';

        if (item.stock <= threshold * 0.7) {
            statusClass = 'critical';
            statusLabel = 'CRITICAL REFILL';
            barClass = 'critical';
            criticalCount++;
        } else if (item.stock <= threshold) {
            statusClass = 'low';
            statusLabel = 'REORDER SOON';
            barClass = 'warning';
            lowCount++;
        }

        const quickAddAmt = item.unit === 'Pieces' ? 25 : (item.unit === 'Bottles' ? 2 : 2.5);

        const card = document.createElement('div');
        card.className = 'supply-gauge-card';
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.4rem;">
                <div>
                    <div style="font-size: 0.72rem; text-transform: uppercase; font-weight: 700; color: #64748b; letter-spacing: 0.04em;">
                        ${item.category}
                    </div>
                    <div style="font-size: 0.96rem; font-weight: 800; color: #0f172a; margin-top: 0.1rem; line-height: 1.25;">
                        ${item.name}
                    </div>
                </div>
                <span class="supply-status-tag ${statusClass}">${statusLabel}</span>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: baseline; margin: 0.75rem 0 0.35rem;">
                <div>
                    <span style="font-size: 1.45rem; font-weight: 800; color: #0f172a; font-family: 'Space Grotesk', sans-serif;">
                        ${typeof item.stock === 'number' ? item.stock.toFixed(item.unit === 'Pieces' || item.unit === 'Bottles' ? 0 : 1) : item.stock}
                    </span>
                    <span style="font-size: 0.85rem; font-weight: 600; color: #64748b;">${item.unit}</span>
                </div>
                <div style="font-size: 0.72rem; color: #94a3b8;">
                    Threshold: <strong>${threshold} ${item.unit}</strong>
                </div>
            </div>

            <!-- Visual Progress Gauge Bar -->
            <div class="supply-bar-track">
                <div class="supply-bar-fill ${barClass}" style="width: ${pct}%;"></div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.85rem; gap: 0.4rem;">
                <button type="button" class="btn btn-outline btn-sm btn-quick-dispense" data-id="${item.id}" data-amount="${quickAddAmt}" style="padding: 0.3rem 0.65rem; font-size: 0.75rem; flex: 1;">
                    +${quickAddAmt} ${item.unit}
                </button>
                <button type="button" class="btn btn-primary btn-sm btn-open-item-refill" data-id="${item.id}" style="padding: 0.3rem 0.65rem; font-size: 0.75rem; flex: 1;">
                    Refill Tank
                </button>
            </div>
        `;

        container.appendChild(card);
    });

    // Update overall indicator badge in the card header
    const pill = document.getElementById('staff-low-stock-pill');
    if (pill) {
        if (criticalCount > 0) {
            pill.className = 'supply-status-tag critical';
            pill.innerText = `⚠️ ${criticalCount} Tanks Critical Refill`;
        } else if (lowCount > 0) {
            pill.className = 'supply-status-tag low';
            pill.innerText = `⚠️ ${lowCount} Tanks Reorder Soon`;
        } else {
            pill.className = 'supply-status-tag healthy';
            pill.innerText = 'All Station Tanks Sufficient';
        }
    }

    // Attach inline button listeners
    container.querySelectorAll('.btn-quick-dispense').forEach(btn => {
        btn.addEventListener('click', function () {
            const id = this.getAttribute('data-id');
            const amt = parseFloat(this.getAttribute('data-amount')) || 1;
            LaundryStore.restockItem(id, amt);
            showToast(`Added +${amt} to active station stock!`);
            renderStaffConsumables();
        });
    });

    container.querySelectorAll('.btn-open-item-refill').forEach(btn => {
        btn.addEventListener('click', function () {
            const id = this.getAttribute('data-id');
            openRefillModalFor(id);
        });
    });
}

/**
 * -------------------------------------------------------------
 * QUICK REFILL MODAL LOGIC FOR STAFF
 * -------------------------------------------------------------
 */
function initStaffRefillModal() {
    const openBtn = document.getElementById('btn-open-refill-modal');
    const modal = document.getElementById('staff-refill-modal');
    const closeBtn = document.getElementById('btn-close-staff-refill');
    const form = document.getElementById('staff-refill-form');
    const select = document.getElementById('staff-refill-item-select');

    if (!modal) return;

    if (openBtn) {
        openBtn.addEventListener('click', () => {
            openRefillModalFor();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('active');
        });
    }

    if (select) {
        select.addEventListener('change', () => {
            updateRefillModalItemMeta(select.value);
        });
    }

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const itemId = select.value;
            const qty = parseFloat(document.getElementById('staff-refill-quantity-input').value) || 0;

            if (qty <= 0) {
                alert('Please enter a valid refill quantity greater than zero.');
                return;
            }

            LaundryStore.restockItem(itemId, qty);
            const inv = LaundryStore.getInventory();
            const itm = inv.find(i => i.id === itemId);

            showToast(`✅ Successfully refilled ${qty} ${itm ? itm.unit : 'units'} of ${itm ? itm.name : 'supply'}!`);
            modal.classList.remove('active');
            renderStaffConsumables();
        });
    }
}

function openRefillModalFor(selectedItemId) {
    const modal = document.getElementById('staff-refill-modal');
    const select = document.getElementById('staff-refill-item-select');
    if (!modal || !select) return;

    const inventory = LaundryStore.getInventory();
    select.innerHTML = '';

    inventory.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.innerText = `${item.name} (${item.category}) - ${item.stock} ${item.unit} available`;
        select.appendChild(opt);
    });

    if (selectedItemId) {
        select.value = selectedItemId;
    } else if (inventory.length > 0) {
        select.value = inventory[0].id;
    }

    updateRefillModalItemMeta(select.value);
    modal.classList.add('active');
}

function updateRefillModalItemMeta(itemId) {
    const inventory = LaundryStore.getInventory();
    const item = inventory.find(i => i.id === itemId);
    if (!item) return;

    const currentDisp = document.getElementById('staff-refill-current-disp');
    const threshDisp = document.getElementById('staff-refill-threshold-disp');
    const unitLabel = document.getElementById('staff-refill-unit-label');
    const qtyInput = document.getElementById('staff-refill-quantity-input');

    if (currentDisp) currentDisp.innerText = `${item.stock} ${item.unit}`;
    if (threshDisp) threshDisp.innerText = `${item.minAlert} ${item.unit} (${item.status})`;
    if (unitLabel) unitLabel.innerText = item.unit;

    if (qtyInput) {
        if (item.unit === 'Pieces') {
            qtyInput.value = '50';
            qtyInput.step = '10';
        } else if (item.unit === 'Bottles') {
            qtyInput.value = '5';
            qtyInput.step = '1';
        } else {
            qtyInput.value = '5.0';
            qtyInput.step = '0.5';
        }
    }
}
