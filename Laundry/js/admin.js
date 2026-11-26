wa/**
 * FreshWave Laundry Station - Manager & Admin Analytics Dashboard
 * Revenue KPI metrics, interactive Canvas charts, Inventory stock tracker
 * with low-stock alerts, and Customer CRM records.
 */

document.addEventListener('DOMContentLoaded', function () {
    LaundryStore.init();

    initAdminSession();
    renderAdminDashboard();
    initRestockModal();
    initAddEmployeeModal();

    // Clean Slate & Demo Data actions
    const cleanSlateBtn = document.getElementById('btn-admin-clean-slate');
    if (cleanSlateBtn) {
        cleanSlateBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset all orders to 0 (Clean Slate)?\n\nLogin credentials and station supplies will be preserved for live testing.')) {
                LaundryStore.resetToCleanSlate();
                renderAdminDashboard();
                showToast('Clean Slate Activated: 0 active orders in system.');
            }
        });
    }

    const loadDemoBtn = document.getElementById('btn-admin-load-demo');
    if (loadDemoBtn) {
        loadDemoBtn.addEventListener('click', () => {
            if (confirm('Load 10 realistic demo orders and customer records into the system?')) {
                LaundryStore.loadDemoData();
                renderAdminDashboard();
                showToast('Demo Data Loaded: 10 Orders active in system.');
            }
        });
    }

    // Instant Dual-Channel Real-time Broadcast Bus
    if (window.AquartRealtimeBus) {
        window.AquartRealtimeBus.on((msg) => {
            renderAdminDashboard();
            if (msg.type === 'ORDER_SAVED' || msg.type === 'ORDER_STATUS_CHANGED' || msg.type === 'ORDER_PAYMENT_CHANGED') {
                const revCard = document.getElementById('stat-total-revenue')?.closest('.card');
                if (revCard) {
                    revCard.classList.remove('row-highlight-new');
                    void revCard.offsetWidth;
                    revCard.classList.add('row-highlight-new');
                }
            }
        });
    }

    // Re-render when storage changes across tabs (fallback)
    window.addEventListener('storage', (e) => {
        if (e.key === 'freshwave_orders' || e.key === 'freshwave_orders_sync' || e.key === 'freshwave_inventory' || e.key === 'freshwave_inventory_sync' || e.key === 'freshwave_users' || e.key === 'freshwave_feedbacks' || e.key === 'freshwave_feedback_sync' || e.key === 'aquart_realtime_event') {
            renderAdminDashboard();
        }
    });

    window.addEventListener('freshwave_order_updated', () => {
        renderAdminDashboard();
    });

    window.addEventListener('freshwave_feedback_submitted', () => {
        renderFeedbacksSection();
    });

    window.addEventListener('freshwave_inventory_updated', () => {
        renderAdminDashboard();
    });

    window.addEventListener('freshwave_reset', () => {
        renderAdminDashboard();
    });
});

function renderAdminDashboard() {
    const stats = LaundryStore.getAnalytics();

    // Update KPI cards
    document.getElementById('stat-total-revenue').innerText = `₱${stats.totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('stat-today-revenue').innerText = `₱${stats.todayRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('stat-total-kg').innerText = `${stats.totalKg} kg`;
    document.getElementById('stat-active-orders').innerText = stats.activeOrders;
    document.getElementById('stat-unpaid-amount').innerText = `₱${stats.unpaidAmount.toFixed(2)}`;
    document.getElementById('stat-unpaid-count').innerText = `${stats.unpaidCount} unpaid orders`;
    document.getElementById('stat-low-stock-count').innerText = `${stats.lowStockCount} items low`;

    // Render Charts using high-dpi HTML5 Canvas
    renderDailyRevenueChart(stats.dailyRevenue);
    renderServiceBreakdownChart(stats.serviceBreakdown);

    // Render Inventory Table
    renderInventoryTable();

    // Render Customer Records
    renderCustomersTable();

    // Render Employee Accounts
    renderEmployeesTable();

    // Render Customer Feedbacks & Service Ratings
    renderFeedbacksSection();
}

/**
 * HIGH-DPI CANVAS BAR CHART: Daily Revenue
 */
function renderDailyRevenueChart(dailyRevenue) {
    const canvas = document.getElementById('daily-revenue-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const width = canvas.parentElement.clientWidth || 500;
    const height = 220;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    // Last 7 days data
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const iso = d.toISOString().split('T')[0];
        const label = d.toLocaleDateString('en-PH', { weekday: 'short', month: 'numeric', day: 'numeric' });
        days.push({ iso, label, amount: dailyRevenue[iso] || 0 });
    }

    const maxAmt = Math.max(1000, ...days.map(d => d.amount));
    const paddingLeft = 50;
    const paddingBottom = 30;
    const chartWidth = width - paddingLeft - 20;
    const chartHeight = height - paddingBottom - 20;
    const barWidth = Math.min(36, (chartWidth / days.length) * 0.55);
    const step = chartWidth / days.length;

    // Grid lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.font = '10px Plus Jakarta Sans, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';

    for (let i = 0; i <= 4; i++) {
        const yVal = (maxAmt / 4) * i;
        const yPos = height - paddingBottom - (chartHeight / 4) * i;
        ctx.beginPath();
        ctx.moveTo(paddingLeft, yPos);
        ctx.lineTo(width - 20, yPos);
        ctx.stroke();
        ctx.fillText(`₱${Math.round(yVal)}`, paddingLeft - 6, yPos + 3);
    }

    // Draw Bars
    days.forEach((day, idx) => {
        const x = paddingLeft + (idx * step) + (step - barWidth) / 2;
        const barH = (day.amount / maxAmt) * chartHeight;
        const y = height - paddingBottom - barH;

        // Gradient bar
        const grad = ctx.createLinearGradient(0, y, 0, height - paddingBottom);
        grad.addColorStop(0, '#0284c7');
        grad.addColorStop(1, '#38bdf8');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, [4, 4, 0, 0]);
        ctx.fill();

        // X-axis label
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'center';
        ctx.font = '10px Plus Jakarta Sans, sans-serif';
        ctx.fillText(day.label, x + barWidth / 2, height - paddingBottom + 16);

        // Value on top of bar if > 0
        if (day.amount > 0) {
            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 9px Plus Jakarta Sans, sans-serif';
            ctx.fillText(`₱${Math.round(day.amount)}`, x + barWidth / 2, y - 5);
        }
    });
}

/**
 * HIGH-DPI CANVAS DOUGHNUT CHART: Popular Services Breakdown
 */
function renderServiceBreakdownChart(servicesBreakdown) {
    const canvas = document.getElementById('service-breakdown-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const width = canvas.parentElement.clientWidth || 300;
    const height = 220;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const labels = Object.keys(servicesBreakdown);
    const values = Object.values(servicesBreakdown);
    const rawTotal = values.reduce((a, b) => a + b, 0);

    const colors = ['#0284c7', '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b'];
    const centerX = width * 0.38;
    const centerY = height / 2;
    const radius = Math.min(centerX - 15, centerY - 15);
    const innerRadius = radius * 0.58;

    if (rawTotal === 0) {
        // Draw elegant empty state ring
        ctx.fillStyle = '#f1f5f9';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.arc(centerX, centerY, innerRadius, 2 * Math.PI, 0, true);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 16px Space Grotesk, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('0', centerX, centerY - 8);
        ctx.font = '10px Plus Jakarta Sans, sans-serif';
        ctx.fillText('Orders', centerX, centerY + 10);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px Plus Jakarta Sans, sans-serif';
        ctx.fillText('No orders processed yet', width * 0.65, height / 2);
        return;
    }

    const total = rawTotal;
    let startAngle = -0.5 * Math.PI;

    values.forEach((val, i) => {
        const sliceAngle = (val / total) * 2 * Math.PI;
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.arc(centerX, centerY, innerRadius, startAngle + sliceAngle, startAngle, true);
        ctx.closePath();
        ctx.fill();
        startAngle += sliceAngle;
    });

    // Center text
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 16px Space Grotesk, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${total}`, centerX, centerY - 8);
    ctx.font = '10px Plus Jakarta Sans, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Orders', centerX, centerY + 10);

    // Legend on the right side
    const legendX = width * 0.72;
    let legendY = 40;
    ctx.textAlign = 'left';

    labels.forEach((label, i) => {
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(legendX, legendY, 10, 10);

        ctx.fillStyle = '#334155';
        ctx.font = '10px Plus Jakarta Sans, sans-serif';
        const shortName = label.split('(')[0].trim();
        ctx.fillText(`${shortName} (${values[i]})`, legendX + 15, legendY + 9);
        legendY += 22;
    });
}

/**
 * INVENTORY TABLE WITH STOCK CONTROLS
 */
function renderInventoryTable() {
    const tableBody = document.getElementById('admin-inventory-tbody');
    if (!tableBody) return;

    const inventory = LaundryStore.getInventory();
    tableBody.innerHTML = '';

    inventory.forEach(item => {
        const tr = document.createElement('tr');
        const isLow = item.stock <= item.minStock;
        const percent = Math.min(100, Math.round((item.stock / (item.minStock * 2.5)) * 100));

        const barColor = isLow ? '#ef4444' : (percent < 50 ? '#f59e0b' : '#10b981');
        const badgeHtml = isLow
            ? `<span class="badge-unpaid" style="font-size: 0.7rem;">⚠️ LOW STOCK</span>`
            : `<span class="badge-paid" style="font-size: 0.7rem;">OK</span>`;

        tr.innerHTML = `
            <td>
                <div style="font-weight: 700; color: #0f172a;">${item.name}</div>
                <div style="font-size: 0.75rem; color: #94a3b8;">${item.category}</div>
            </td>
            <td>
                <div style="font-size: 0.95rem; font-weight: 800; color: ${isLow ? '#dc2626' : '#0f172a'};">
                    ${item.stock} ${item.unit}
                </div>
                <div style="background: #e2e8f0; height: 6px; border-radius: 3px; width: 100px; margin-top: 4px; overflow: hidden;">
                    <div style="background: ${barColor}; height: 100%; width: ${percent}%;"></div>
                </div>
            </td>
            <td>
                <span style="font-size: 0.8rem; color: #64748b;">${item.minStock} ${item.unit}</span>
            </td>
            <td>${badgeHtml}</td>
            <td>
                <div style="display: flex; gap: 0.35rem;">
                    <button class="btn btn-outline btn-sm btn-quick-use" data-id="${item.id}" title="Simulate using 1 unit">- Use 1</button>
                    <button class="btn btn-primary btn-sm btn-open-restock" data-id="${item.id}" data-name="${item.name}" data-unit="${item.unit}">+ Restock</button>
                </div>
            </td>
        `;

        tableBody.appendChild(tr);
    });

    // Event listeners
    document.querySelectorAll('.btn-quick-use').forEach(btn => {
        btn.addEventListener('click', function () {
            const id = this.getAttribute('data-id');
            LaundryStore.adjustStock(id, -1);
            LaundryStore.playAudioChime('tap');
            renderAdminDashboard();
        });
    });

    document.querySelectorAll('.btn-open-restock').forEach(btn => {
        btn.addEventListener('click', function () {
            const id = this.getAttribute('data-id');
            const name = this.getAttribute('data-name');
            const unit = this.getAttribute('data-unit');
            openRestockModal(id, name, unit);
        });
    });
}

function initRestockModal() {
    const modal = document.getElementById('restock-modal');
    const form = document.getElementById('restock-form');
    const closeBtn = document.getElementById('btn-close-restock');

    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    }

    if (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            const invId = document.getElementById('restock-inv-id').value;
            const amount = parseFloat(document.getElementById('restock-amount-input').value) || 0;

            if (amount > 0) {
                LaundryStore.restockItem(invId, amount);
                LaundryStore.playAudioChime('ready');
                showToast(`Restocked ${amount} units successfully!`);
                modal.classList.remove('active');
                renderAdminDashboard();
            }
        });
    }
}

function openRestockModal(invId, name, unit) {
    const modal = document.getElementById('restock-modal');
    if (!modal) return;

    document.getElementById('restock-inv-id').value = invId;
    document.getElementById('restock-item-name').innerText = name;
    document.getElementById('restock-unit-label').innerText = unit;
    document.getElementById('restock-amount-input').value = '10';

    modal.classList.add('active');
}

/**
 * CUSTOMER CRM RECORDS TABLE
 */
function renderCustomersTable() {
    const tableBody = document.getElementById('admin-customers-tbody');
    if (!tableBody) return;

    const customers = LaundryStore.getCustomers();
    tableBody.innerHTML = '';

    customers.forEach(cust => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="font-weight: 700; color: #0f172a;">${cust.name}</div>
                <div style="font-size: 0.75rem; color: #94a3b8;">${cust.id}</div>
            </td>
            <td>
                <div style="font-size: 0.82rem; color: #475569;">${cust.phone || 'N/A'}</div>
                <div style="font-size: 0.75rem; color: #94a3b8;">${cust.address || 'N/A'}</div>
            </td>
            <td>
                <span class="badge-paid" style="font-size: 0.75rem;">${cust.ordersCount || 1} orders</span>
            </td>
            <td>
                <div style="font-weight: 800; color: #0284c7;">₱${(cust.totalSpent || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
            </td>
            <td>
                <a href="staff.html" class="btn btn-outline btn-sm">View in Staff</a>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

/**
 * MANAGER / ADMIN USER SESSION & NAVBAR BADGE
 */
function initAdminSession() {
    const user = LaundryStore.getCurrentUser();
    if (!user) return;

    const nameElem = document.getElementById('admin-user-name');
    const roleElem = document.getElementById('admin-user-role');
    const initialsElem = document.getElementById('admin-user-initials');
    const logoutBtn = document.getElementById('btn-admin-logout');

    const displayName = user.fullName || user.name || user.username;
    if (nameElem) nameElem.innerText = displayName;
    if (roleElem) {
        roleElem.innerText = (user.role || 'admin').toUpperCase();
        roleElem.className = `role-pill ${user.role || 'admin'}`;
    }
    if (initialsElem) {
        const rawName = displayName.trim();
        const parts = rawName.split(/\s+/);
        const initials = parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : rawName.substring(0, 2).toUpperCase();
        initialsElem.innerText = initials;
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm(`Log out of manager executive session (${displayName})?`)) {
                LaundryStore.logout();
            }
        });
    }
}

/**
 * EMPLOYEE & STAFF ACCOUNTS (RBAC)
 */
function renderEmployeesTable() {
    const tableBody = document.getElementById('admin-employees-tbody');
    if (!tableBody) return;

    const users = LaundryStore.getUsers();
    const currentUser = LaundryStore.getCurrentUser();
    tableBody.innerHTML = '';

    users.forEach(u => {
        const isCurrent = currentUser && currentUser.id === u.id;
        const dateStr = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Initial';
        const roleBadgeClass = u.role === 'admin' ? 'role-pill admin' : 'role-pill staff';
        const roleLabel = u.role === 'admin' ? 'Station Supervisor' : 'Cashier / POS Staff';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 0.4rem;">
                    <span>${u.fullName}</span>
                    ${isCurrent ? '<span style="font-size: 0.65rem; background: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 4px; font-weight: 700;">YOU</span>' : ''}
                </div>
                <div style="font-size: 0.75rem; color: #94a3b8;">${u.id}</div>
            </td>
            <td>
                <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.85rem; color: #0f172a; font-weight: 600;">${u.username}</code>
            </td>
            <td>
                <span class="${roleBadgeClass}">${roleLabel}</span>
            </td>
            <td>
                <span style="font-size: 0.82rem; color: #475569;">${u.email || (u.username + '@aquartlaundry.ph')}</span>
            </td>
            <td>
                <span style="font-size: 0.8rem; color: #64748b;">${dateStr}</span>
            </td>
            <td>
                ${isCurrent ? '<span style="font-size: 0.75rem; color: #94a3b8; font-style: italic;">Active Session</span>' : `
                    <button type="button" class="btn btn-outline btn-sm btn-delete-emp" data-user-id="${u.id}" data-name="${u.fullName}" style="color: #dc2626; border-color: #fecaca; font-size: 0.75rem; padding: 3px 8px;">
                        Remove
                    </button>
                `}
            </td>
        `;
        tableBody.appendChild(tr);
    });

    // Wire delete buttons
    document.querySelectorAll('.btn-delete-emp').forEach(btn => {
        btn.addEventListener('click', function () {
            const userId = this.getAttribute('data-user-id');
            const name = this.getAttribute('data-name');
            if (confirm(`Remove employee account for "${name}"? They will no longer be able to log in.`)) {
                const res = LaundryStore.deleteEmployeeAccount(userId);
                if (res.success) {
                    showAdminToast(`Staff account for ${name} removed.`);
                    renderEmployeesTable();
                } else {
                    alert(res.message);
                }
            }
        });
    });
}

function initAddEmployeeModal() {
    const modal = document.getElementById('add-employee-modal');
    const openBtn = document.getElementById('btn-open-add-employee');
    const closeBtn = document.getElementById('btn-close-employee-modal');
    const form = document.getElementById('add-employee-form');

    if (!modal || !form) return;

    if (openBtn) {
        openBtn.addEventListener('click', () => {
            form.reset();
            modal.classList.add('active');
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('active');
        });
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();

        const fn = document.getElementById('emp-fullname').value.trim();
        const un = document.getElementById('emp-username').value.trim();
        const role = document.getElementById('emp-role').value;
        const pass = document.getElementById('emp-password').value;
        const email = document.getElementById('emp-email').value.trim();

        const result = LaundryStore.createEmployeeAccount({
            fullName: fn,
            username: un,
            role: role,
            password: pass,
            email: email
        });

        if (result.success) {
            modal.classList.remove('active');
            showAdminToast(`Account created for ${result.user.fullName} (${result.user.role.toUpperCase()})!`);
            renderEmployeesTable();
        } else {
            alert(result.message);
        }
    });
}

function renderFeedbacksSection() {
    const analytics = (typeof LaundryStore.getFeedbackAnalytics === 'function')
        ? LaundryStore.getFeedbackAnalytics()
        : { averageRating: 0, totalCount: 0, ratingBreakdown: {}, recentFeedbacks: [] };

    const avgElem = document.getElementById('feedback-avg-score');
    if (avgElem) avgElem.innerText = (analytics.totalCount > 0) ? analytics.averageRating.toFixed(1) : 'N/A';

    const totalElem = document.getElementById('feedback-total-count');
    if (totalElem) totalElem.innerText = analytics.totalCount;

    const count5 = document.getElementById('feedback-count-5');
    if (count5) count5.innerText = analytics.ratingBreakdown[5] || 0;

    const count4 = document.getElementById('feedback-count-4');
    if (count4) count4.innerText = analytics.ratingBreakdown[4] || 0;

    const countLow = document.getElementById('feedback-count-low');
    if (countLow) {
        const lowSum = (analytics.ratingBreakdown[1] || 0) + (analytics.ratingBreakdown[2] || 0) + (analytics.ratingBreakdown[3] || 0);
        countLow.innerText = lowSum;
    }

    const tbody = document.getElementById('admin-feedbacks-tbody');
    if (!tbody) return;

    const list = LaundryStore.getFeedbacks();
    if (!list || list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 2rem; color: #64748b;">
                    No customer ratings or reviews submitted yet. When customers complete an order on the tracker or web portal, their feedback will appear here in real-time.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    list.forEach(fb => {
        const tr = document.createElement('tr');
        const starsHtml = '★'.repeat(fb.rating || 5) + '☆'.repeat(Math.max(0, 5 - (fb.rating || 5)));
        const starColor = (fb.rating >= 4) ? '#f59e0b' : ((fb.rating === 3) ? '#0284c7' : '#ef4444');
        const dateStr = fb.submittedAt ? new Date(fb.submittedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--';

        tr.innerHTML = `
            <td style="font-family: monospace; font-weight: 700; color: #0284c7;">
                ${fb.orderId || 'Direct'}
            </td>
            <td>
                <strong style="color: #0f172a;">${fb.customerName || 'Customer'}</strong>
                ${fb.customerPhone ? `<div style="font-size: 0.75rem; color: #64748b;">${fb.customerPhone}</div>` : ''}
            </td>
            <td style="font-size: 0.85rem; color: #475569;">
                ${fb.serviceName || 'General Laundry'}
            </td>
            <td>
                <div style="color: ${starColor}; font-size: 1.1rem; letter-spacing: 2px;">${starsHtml}</div>
                <div style="font-size: 0.72rem; font-weight: 700; color: ${starColor};">${fb.rating} of 5 Stars</div>
            </td>
            <td style="max-width: 280px; font-size: 0.82rem; color: #334155;">
                ${fb.comment ? `<em>"${fb.comment}"</em>` : '<span style="color: #94a3b8;">No written comment</span>'}
            </td>
            <td style="font-size: 0.78rem; color: #64748b;">
                ${dateStr}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function showAdminToast(msg) {
    if (typeof showToast === 'function') {
        showToast(msg);
    } else {
        let toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<span>🔔</span> <span>${msg}</span>`;
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }
}
