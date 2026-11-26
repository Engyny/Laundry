/**
 * FreshWave Laundry Station - Centralized Data Store
 * Handles LocalStorage persistence, order tracking, inventory, pricing calculation,
 * and audio chime / automated notification engine.
 */

var STORAGE_KEYS = window.FreshWaveStorageKeys = window.FreshWaveStorageKeys || {
    ORDERS: 'freshwave_orders',
    INVENTORY: 'freshwave_inventory',
    CUSTOMERS: 'freshwave_customers',
    PICKUP_REQUESTS: 'freshwave_pickup_requests',
    NOTIFICATIONS: 'freshwave_notifications',
    SETTINGS: 'freshwave_settings',
    USERS: 'freshwave_users',
    CURRENT_USER: 'freshwave_current_user',
    FEEDBACKS: 'freshwave_feedbacks'
};

/**
 * Aquart Real-time Event Bus
 * Provides sub-millisecond tab-to-tab messaging via BroadcastChannel
 * with storage event fallback and periodic heartbeat synchronization.
 */
var AquartRealtimeBus = window.AquartRealtimeBus = window.AquartRealtimeBus || {
    channel: (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('aquart_realtime_sync') : null,
    listeners: [],

    emit: function (type, payload = {}) {
        const message = {
            type: type,
            payload: payload,
            sender: (typeof window !== 'undefined' && window.location) ? window.location.pathname : '',
            timestamp: Date.now()
        };

        // 1. Dual-channel BroadcastChannel for instantaneous tab-to-tab transmission
        if (this.channel) {
            try { this.channel.postMessage(message); } catch (e) {}
        }

        // 2. LocalStorage change key triggers native browser 'storage' event across other tabs
        try {
            localStorage.setItem('aquart_realtime_event', JSON.stringify(message));
            localStorage.setItem('freshwave_orders_sync', Date.now().toString());
            localStorage.setItem('freshwave_inventory_sync', Date.now().toString());
        } catch (e) {}

        // 3. Local in-tab CustomEvent
        try {
            window.dispatchEvent(new CustomEvent('aquart_realtime_message', { detail: message }));
        } catch (e) {}
    },

    on: function (callback) {
        if (typeof callback !== 'function') return;
        this.listeners.push(callback);

        // Bind BroadcastChannel message
        if (this.channel && !this._channelBound) {
            this._channelBound = true;
            this.channel.onmessage = (event) => {
                if (event && event.data) {
                    this.listeners.forEach(fn => {
                        try { fn(event.data); } catch (err) { console.error('Realtime callback error:', err); }
                    });
                }
            };
        }

        // Fallback for storage event (other tabs)
        if (!this._storageBound && typeof window !== 'undefined') {
            this._storageBound = true;
            window.addEventListener('storage', (e) => {
                if (e.key === 'aquart_realtime_event' && e.newValue) {
                    try {
                        const parsed = JSON.parse(e.newValue);
                        this.listeners.forEach(fn => {
                            try { fn(parsed); } catch (err) {}
                        });
                    } catch (err) {}
                }
            });
        }

        // Fallback for same-tab events
        if (!this._localBound && typeof window !== 'undefined') {
            this._localBound = true;
            window.addEventListener('aquart_realtime_message', (e) => {
                if (e && e.detail) {
                    this.listeners.forEach(fn => {
                        try { fn(e.detail); } catch (err) {}
                    });
                }
            });
        }
    }
};

/**
 * Aquart Cloud Database Synchronization (Supabase REST API)
 * Enables real-time cross-device synchronization between mobile smartphones,
 * tablets, and PC/laptop staff portals worldwide.
 */
var AquartCloudSync = window.AquartCloudSync = window.AquartCloudSync || {
    url: 'https://pfkmqrwpdkxgwdnwfrgk.supabase.co/rest/v1',
    functionsUrl: 'https://pfkmqrwpdkxgwdnwfrgk.supabase.co/functions/v1',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBma21xcndwZGt4Z3dkbndmcmdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwODkwMjUsImV4cCI6MjA5MTY2NTAyNX0.e2mpHp47t1DRV0CIxxWbh_v2Ty-JbdMmD8ZPFLBhyoE',
    isSyncing: false,

    headers: function () {
        return {
            'apikey': this.anonKey,
            'Authorization': 'Bearer ' + this.anonKey,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
        };
    },

    mapToDbOrder: function (o) {
        return {
            id: o.id,
            customer_name: o.customerName || 'Customer',
            customer_phone: o.customerPhone || '',
            customer_address: o.customerAddress || '',
            service_id: o.serviceId || '',
            service_name: o.serviceName || 'Wash - Dry - Fold',
            weight: Number(o.weight) || 5.0,
            add_ons: o.addOns || [],
            subtotal: Number(o.subtotal) || 0.0,
            add_on_total: Number(o.addOnTotal) || 0.0,
            delivery_fee: Number(o.deliveryFee) || 0.0,
            total_amount: Number(o.totalAmount) || 0.0,
            payment_status: o.paymentStatus || 'unpaid',
            payment_method: o.paymentMethod || 'cash',
            payment_ref_number: o.paymentRefNumber || '',
            payment_proof_image: o.paymentProofImage || null,
            status: o.status || 'reserved',
            drop_off_date: o.dropOffDate || '',
            drop_off_slot: o.dropOffSlot || '',
            notes: o.notes || '',
            is_delivery: Boolean(o.isDelivery),
            is_online_reservation: Boolean(o.isOnlineReservation),
            history: o.history || [],
            updated_at: new Date().toISOString()
        };
    },

    mapFromDbOrder: function (d) {
        return {
            id: d.id,
            customerName: d.customer_name,
            customerPhone: d.customer_phone,
            customerAddress: d.customer_address,
            serviceId: d.service_id,
            serviceName: d.service_name,
            weight: Number(d.weight) || 5.0,
            addOns: d.add_ons || [],
            subtotal: Number(d.subtotal) || 0.0,
            addOnTotal: Number(d.add_on_total) || 0.0,
            deliveryFee: Number(d.delivery_fee) || 0.0,
            totalAmount: Number(d.total_amount) || 0.0,
            paymentStatus: d.payment_status || 'unpaid',
            paymentMethod: d.payment_method || 'cash',
            paymentRefNumber: d.payment_ref_number || '',
            paymentProofImage: d.payment_proof_image || null,
            status: d.status || 'reserved',
            dropOffDate: d.drop_off_date || '',
            dropOffSlot: d.drop_off_slot || '',
            notes: d.notes || '',
            isDelivery: Boolean(d.is_delivery),
            isOnlineReservation: Boolean(d.is_online_reservation),
            history: d.history || [],
            createdAt: d.created_at
        };
    },

    pushOrder: async function (order) {
        if (!order || !order.id) return;
        try {
            const dbPayload = this.mapToDbOrder(order);
            await fetch(`${this.url}/laundry_orders`, {
                method: 'POST',
                headers: this.headers(),
                body: JSON.stringify(dbPayload)
            });
        } catch (e) {
            console.warn('[AquartCloudSync] Push order failed, fallback to local:', e);
        }
    },

    pullOrders: async function () {
        if (this.isSyncing) return;
        this.isSyncing = true;
        try {
            const res = await fetch(`${this.url}/laundry_orders?select=*&order=created_at.desc`, {
                headers: {
                    'apikey': this.anonKey,
                    'Authorization': 'Bearer ' + this.anonKey
                }
            });
            if (!res.ok) throw new Error('Cloud fetch failed');
            const data = await res.json();
            if (Array.isArray(data)) {
                let localOrders = [];
                try {
                    localOrders = JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDERS)) || [];
                } catch (e) { localOrders = []; }

                let changed = false;
                const cloudOrders = data.map(d => this.mapFromDbOrder(d));

                cloudOrders.forEach(co => {
                    const idx = localOrders.findIndex(lo => lo.id === co.id);
                    if (idx < 0) {
                        localOrders.unshift(co);
                        changed = true;
                    } else {
                        const lo = localOrders[idx];
                        if (lo.status !== co.status || lo.paymentStatus !== co.paymentStatus || (co.history && co.history.length > (lo.history || []).length)) {
                            localOrders[idx] = co;
                            changed = true;
                        }
                    }
                });

                if (changed) {
                    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(localOrders));
                    localStorage.setItem('freshwave_orders_sync', Date.now().toString());
                    if (window.AquartRealtimeBus) {
                        AquartRealtimeBus.emit('ORDER_SAVED', { isSync: true });
                    }
                }

                // If local has orders not in cloud, push them up
                localOrders.forEach(lo => {
                    const inCloud = cloudOrders.some(co => co.id === lo.id);
                    if (!inCloud) {
                        this.pushOrder(lo);
                    }
                });
            }
        } catch (e) {
            // Offline fallback
        } finally {
            this.isSyncing = false;
        }
    },

    pushFeedback: async function (fb) {
        if (!fb || !fb.id) return;
        try {
            await fetch(`${this.url}/laundry_feedbacks`, {
                method: 'POST',
                headers: this.headers(),
                body: JSON.stringify({
                    id: fb.id,
                    order_id: fb.orderId,
                    customer_name: fb.customerName,
                    service_name: fb.serviceName,
                    rating: fb.rating,
                    comment: fb.comment,
                    created_at: fb.submittedAt || new Date().toISOString()
                })
            });
        } catch (e) {}
    },

    pushInquiry: async function (inq) {
        if (!inq) return;
        try {
            await fetch(`${this.url}/laundry_inquiries`, {
                method: 'POST',
                headers: this.headers(),
                body: JSON.stringify({
                    id: inq.id || `INQ-${Date.now()}`,
                    name: inq.name || 'Anonymous',
                    contact: inq.contact || 'N/A',
                    subject: inq.subject || 'General Inquiry',
                    message: inq.message || '',
                    is_anonymous: Boolean(inq.isAnonymous)
                })
            });
        } catch (e) {}
    },

    pushNotification: async function (n) {
        if (!n || !n.id) return;
        try {
            await fetch(`${this.url}/laundry_notifications`, {
                method: 'POST',
                headers: this.headers(),
                body: JSON.stringify({
                    id: n.id,
                    order_id: n.orderId || '',
                    customer_phone: n.customerPhone || '',
                    customer_name: n.customerName || 'Customer',
                    status: n.status || 'reserved',
                    message: n.message || '',
                    type: n.type || 'sms',
                    sms_status: n.smsStatus || 'local',
                    sms_error: n.smsError || null,
                    created_at: n.timestamp || new Date().toISOString()
                })
            });
        } catch (e) {}
    },

    pullNotifications: async function () {
        try {
            const res = await fetch(`${this.url}/laundry_notifications?select=*&order=created_at.desc&limit=50`, {
                headers: { 'apikey': this.anonKey, 'Authorization': 'Bearer ' + this.anonKey }
            });
            if (!res.ok) return;
            const data = await res.json();
            if (!Array.isArray(data) || data.length === 0) return;

            let localNotifs = [];
            try { localNotifs = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS)) || []; } catch (e) { localNotifs = []; }

            let changed = false;
            data.forEach(d => {
                const mapped = {
                    id: d.id,
                    orderId: d.order_id,
                    customerPhone: d.customer_phone,
                    customerName: d.customer_name,
                    status: d.status,
                    message: d.message,
                    timestamp: d.created_at,
                    type: d.type || 'sms',
                    smsStatus: d.sms_status || 'local',
                    smsError: d.sms_error || null,
                    sentAt: d.sent_at || null
                };
                const idx = localNotifs.findIndex(ln => ln.id === mapped.id);
                if (idx < 0) {
                    localNotifs.push(mapped);
                    changed = true;
                } else if (localNotifs[idx].smsStatus !== mapped.smsStatus || localNotifs[idx].smsError !== mapped.smsError) {
                    localNotifs[idx] = mapped;
                    changed = true;
                }
            });

            if (changed) {
                localNotifs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(localNotifs));
                window.dispatchEvent(new CustomEvent('freshwave_order_updated', { detail: { isSync: true } }));
            }
        } catch (e) {}
    },

    sendSmsViaEdge: async function (notifItem, isResend = false) {
        if (!notifItem || !notifItem.id) return { ok: false, smsStatus: 'failed', error: 'Missing notification' };
        try {
            const res = await fetch(`${this.functionsUrl}/send-sms`, {
                method: 'POST',
                headers: {
                    'apikey': this.anonKey,
                    'Authorization': 'Bearer ' + this.anonKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    notificationId: notifItem.id,
                    orderId: notifItem.orderId,
                    customerPhone: notifItem.customerPhone,
                    customerName: notifItem.customerName,
                    status: notifItem.status,
                    message: notifItem.message,
                    isResend: Boolean(isResend)
                })
            });
            const data = await res.json().catch(() => ({}));
            const smsStatus = data.smsStatus || (res.ok ? 'sent' : 'failed');
            this._updateLocalNotifStatus(notifItem.id, smsStatus, data.error || null, data.sentAt || null);
            return { ok: Boolean(data.ok && res.ok), smsStatus, error: data.error || null };
        } catch (err) {
            const errMsg = 'Network error calling SMS gateway.';
            this._updateLocalNotifStatus(notifItem.id, 'failed', errMsg, null);
            return { ok: false, smsStatus: 'failed', error: errMsg };
        }
    },

    _updateLocalNotifStatus: function (notifId, smsStatus, smsError, sentAt) {
        try {
            const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS)) || [];
            const idx = list.findIndex(n => n.id === notifId);
            if (idx >= 0) {
                list[idx].smsStatus = smsStatus;
                list[idx].smsError = smsError;
                if (sentAt) list[idx].sentAt = sentAt;
                localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list));
                window.dispatchEvent(new CustomEvent('freshwave_order_updated', { detail: { notification: list[idx] } }));
            }
        } catch (e) {}
    },

    pushInventory: async function (item) {
        if (!item || !item.id) return;
        try {
            await fetch(`${this.url}/laundry_inventory`, {
                method: 'POST',
                headers: this.headers(),
                body: JSON.stringify({
                    id: item.id,
                    name: item.name,
                    category: item.category || 'other',
                    stock: Number(item.stock) || 0,
                    min_stock: Number(item.minStock) || 5,
                    max_stock: Number(item.maxStock) || 100,
                    unit: item.unit || 'units',
                    updated_at: new Date().toISOString()
                })
            });
        } catch (e) {}
    },

    pullInventory: async function () {
        try {
            const res = await fetch(`${this.url}/laundry_inventory?select=*`, {
                headers: { 'apikey': this.anonKey, 'Authorization': 'Bearer ' + this.anonKey }
            });
            if (!res.ok) return;
            const data = await res.json();
            if (!Array.isArray(data) || data.length === 0) return;
            const mapped = data.map(d => ({
                id: d.id,
                name: d.name,
                category: d.category,
                stock: Number(d.stock) || 0,
                minStock: Number(d.min_stock) || 5,
                maxStock: Number(d.max_stock) || 100,
                unit: d.unit || 'units'
            }));
            localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(mapped));
            window.dispatchEvent(new CustomEvent('freshwave_inventory_updated', { detail: { inventory: mapped } }));
        } catch (e) {}
    },

    pushCustomer: async function (c) {
        if (!c || !c.id) return;
        try {
            await fetch(`${this.url}/laundry_customers`, {
                method: 'POST',
                headers: this.headers(),
                body: JSON.stringify({
                    id: c.id,
                    name: c.name,
                    phone: c.phone || '',
                    address: c.address || 'N/A',
                    total_orders: Number(c.ordersCount) || 0,
                    total_spent: Number(c.totalSpent) || 0,
                    updated_at: new Date().toISOString()
                })
            });
        } catch (e) {}
    },

    pullCustomers: async function () {
        try {
            const res = await fetch(`${this.url}/laundry_customers?select=*`, {
                headers: { 'apikey': this.anonKey, 'Authorization': 'Bearer ' + this.anonKey }
            });
            if (!res.ok) return;
            const data = await res.json();
            if (!Array.isArray(data) || data.length === 0) return;
            const mapped = data.map(d => ({
                id: d.id,
                name: d.name,
                phone: d.phone,
                address: d.address,
                ordersCount: Number(d.total_orders) || 0,
                totalSpent: Number(d.total_spent) || 0
            }));
            localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(mapped));
        } catch (e) {}
    },

    pullFeedbacks: async function () {
        try {
            const res = await fetch(`${this.url}/laundry_feedbacks?select=*&order=created_at.desc`, {
                headers: { 'apikey': this.anonKey, 'Authorization': 'Bearer ' + this.anonKey }
            });
            if (!res.ok) return;
            const data = await res.json();
            if (!Array.isArray(data) || data.length === 0) return;
            const mapped = data.map(d => ({
                id: d.id,
                orderId: d.order_id,
                customerName: d.customer_name,
                serviceName: d.service_name,
                rating: Number(d.rating) || 5,
                comment: d.comment || '',
                submittedAt: d.created_at
            }));
            localStorage.setItem(STORAGE_KEYS.FEEDBACKS, JSON.stringify(mapped));
        } catch (e) {}
    },

    startAutoSync: function () {
        if (this._intervalStarted) return;
        this._intervalStarted = true;
        this.pullOrders();
        this.pullNotifications();
        this.pullInventory();
        this.pullCustomers();
        this.pullFeedbacks();
        setInterval(() => {
            this.pullOrders();
            this.pullNotifications();
        }, 5000);
        setInterval(() => {
            this.pullInventory();
            this.pullCustomers();
            this.pullFeedbacks();
        }, 15000);
        if (typeof window !== 'undefined') {
            window.addEventListener('focus', () => {
                this.pullOrders();
                this.pullNotifications();
            });
        }
    }
};

var DEFAULT_USERS = window.FreshWaveDefaultUsers = window.FreshWaveDefaultUsers || [
    {
        id: 'usr-admin',
        username: 'admin',
        password: 'admin123',
        fullName: 'Station Supervisor',
        role: 'admin',
        email: 'supervisor@aquartlaundry.ph',
        createdAt: '2026-01-01T08:00:00.000Z'
    },
    {
        id: 'usr-staff',
        username: 'staff',
        password: 'staff123',
        fullName: 'Cashier / Counter Desk',
        role: 'staff',
        email: 'cashier@aquartlaundry.ph',
        createdAt: '2026-01-01T08:00:00.000Z'
    }
];

var STATION_PASSCODES = window.FreshWaveStationPasscodes = window.FreshWaveStationPasscodes || {
    staff: 'FW-STAFF-2026',
    admin: 'FW-ADMIN-2026'
};

const LAUNDRY_SERVICES = {
    'wash-dry-fold': {
        id: 'wash-dry-fold',
        name: 'Wash - Dry - Fold (Regular)',
        pricePerKg: 35,
        minKg: 5,
        basePrice: 175,
        unit: 'kg',
        turnaroundHours: 24,
        description: 'Everyday casual clothes, t-shirts, shorts, bedsheets. Softened and neatly folded.'
    },
    'wash-dry-press': {
        id: 'wash-dry-press',
        name: 'Wash - Dry - Press (Ironing)',
        pricePerKg: 55,
        minKg: 4,
        basePrice: 220,
        unit: 'kg',
        turnaroundHours: 36,
        description: 'Office uniforms, polos, slacks, dresses. Crisp steam press on hangers.'
    },
    'dry-cleaning': {
        id: 'dry-cleaning',
        name: 'Dry Cleaning (Special Care)',
        pricePerKg: 120, // per piece or special load
        minKg: 1,
        basePrice: 120,
        unit: 'piece/load',
        turnaroundHours: 48,
        description: 'Suits, barongs, coats, gowns, delicate fabrics cleaned with special eco-solvent.'
    },
    'heavy-comforter': {
        id: 'heavy-comforter',
        name: 'Comforter & Heavy Blankets',
        pricePerKg: 65,
        minKg: 4,
        basePrice: 260,
        unit: 'kg',
        turnaroundHours: 30,
        description: 'King/Queen heavy duvets, thick blankets, curtains, and car seat covers.'
    }
};

const ADD_ONS = {
    fabcon: { id: 'fabcon', name: 'Premium Fabric Conditioner (Downy Floral/Passion)', price: 20 },
    bleach: { id: 'bleach', name: 'Color-Safe Oxygen Bleach / Stain Treatment', price: 25 },
    rush: { id: 'rush', name: 'Express Rush Service (Same Day 4-5 Hrs)', price: 50 },
    ecobag: { id: 'ecobag', name: 'Waterproof Eco Laundry Bag', price: 25 }
};

const ORDER_STATUSES = [
    { key: 'reserved', label: 'Slot Reserved', sublabel: 'Awaiting Drop-off', icon: '•', color: '#93c5fd', step: 0 },
    { key: 'received', label: 'Received', sublabel: 'Order Logged & Tagged', icon: '•', color: '#60a5fa', step: 1 },
    { key: 'washing', label: 'Washing', sublabel: 'In Washing Machine', icon: '•', color: '#06b6d4', step: 2 },
    { key: 'drying', label: 'Drying', sublabel: 'In Commercial Dryer', icon: '•', color: '#0284c7', step: 3 },
    { key: 'folding', label: 'Folding', sublabel: 'Folded & Packaged', icon: '•', color: '#2563eb', step: 4 },
    { key: 'ready', label: 'Ready for Pickup', sublabel: 'Ready for Pickup / Delivery', icon: '•', color: '#0ea5e9', step: 5 },
    { key: 'completed', label: 'Completed', sublabel: 'Claimed by Customer', icon: '•', color: '#0f172a', step: 6 }
];

const INITIAL_INVENTORY = [
    { id: 'inv-1', name: 'Ariel Liquid Detergent Pro', category: 'Detergents', stock: 42, unit: 'Liters', minStock: 15, minAlert: 15, cost: 180 },
    { id: 'inv-2', name: 'Downy Floral Perfume Fabcon', category: 'Fabric Softener', stock: 28, unit: 'Liters', minStock: 12, minAlert: 12, cost: 160 },
    { id: 'inv-3', name: 'Zonrox Color-Safe Oxygen Bleach', category: 'Bleach & Spotters', stock: 9, unit: 'Bottles', minStock: 10, minAlert: 10, cost: 95 },
    { id: 'inv-4', name: 'Eco Plastic Laundry Packaging Bags (Large)', category: 'Packaging', stock: 320, unit: 'Pieces', minStock: 100, minAlert: 100, cost: 2.5 },
    { id: 'inv-5', name: 'Dryer Anti-Static Scent Sheets', category: 'Dryer Care', stock: 4, unit: 'Boxes', minStock: 8, minAlert: 8, cost: 220 },
    { id: 'inv-6', name: 'Hanger Plastic Heavy Duty', category: 'Packaging', stock: 150, unit: 'Pieces', minStock: 50, minAlert: 50, cost: 8 }
];

const INITIAL_CUSTOMERS = [
    { id: 'CUST-001', name: 'Maria Santos', phone: '0917-892-3412', address: 'Banilad, Cebu City', ordersCount: 7, totalSpent: 2150 },
    { id: 'CUST-002', name: 'Engr. Junrey Fernandez', phone: '0922-451-9981', address: 'Mandaue City, Tipolo', ordersCount: 12, totalSpent: 4320 },
    { id: 'CUST-003', name: 'Krizza Mae Alcantara', phone: '0933-718-2234', address: 'Lahug, Cebu City (Near IT Park)', ordersCount: 5, totalSpent: 1480 },
    { id: 'CUST-004', name: 'Dante Villamor', phone: '0908-332-1109', address: 'Talisay City, Poblacion', ordersCount: 3, totalSpent: 890 }
];

const INITIAL_ORDERS = [
    {
        id: 'JO-2026-105',
        customerName: 'Patricia Morales',
        customerPhone: '0918-234-5678',
        customerAddress: 'Counter Drop-off (Banilad Station)',
        serviceId: 'wash-dry-fold',
        serviceName: 'Wash - Dry - Fold (Regular)',
        weight: 6.0,
        addOns: ['fabcon'],
        subtotal: 210.0,
        addOnTotal: 20,
        totalAmount: 230.0,
        paymentStatus: 'unpaid',
        paymentMethod: 'Pay at Counter Upon Drop-off',
        status: 'reserved',
        dropOffDate: '2026-10-27',
        dropOffSlot: '10:00 AM - 12:00 PM',
        notes: 'Reserved online for morning drop-off.',
        isDelivery: false,
        isOnlineReservation: true,
        createdAt: new Date(Date.now() - 0.8 * 3600 * 1000).toISOString(),
        history: [
            { status: 'reserved', timestamp: new Date(Date.now() - 0.8 * 3600 * 1000).toISOString(), note: 'Drop-off slot reserved online by customer' }
        ]
    },
    {
        id: 'JO-2026-101',
        customerName: 'Sarah Jenkins',
        customerPhone: '0917-882-9011',
        customerAddress: 'Apt 4B, Highland Residences',
        serviceId: 'wash-dry-fold',
        serviceName: 'Wash - Dry - Fold (Regular)',
        weight: 6.0,
        addOns: ['fabcon'],
        subtotal: 210.0,
        addOnTotal: 20,
        totalAmount: 230.0,
        paymentStatus: 'paid',
        paymentMethod: 'GCash',
        status: 'washing',
        notes: 'Mild lavender scent preferred.',
        isDelivery: false,
        createdAt: new Date(Date.now() - 1.5 * 3600 * 1000).toISOString(),
        history: [
            { status: 'received', timestamp: new Date(Date.now() - 1.5 * 3600 * 1000).toISOString(), note: 'Order logged & tagged' },
            { status: 'washing', timestamp: new Date(Date.now() - 0.5 * 3600 * 1000).toISOString(), note: 'Drum Washer #2 running' }
        ]
    },
    {
        id: 'JO-2026-102',
        customerName: 'Marcus Vance',
        customerPhone: '0922-451-9981',
        customerAddress: 'Oakwood Towers, Suite 12',
        serviceId: 'wash-dry-press',
        serviceName: 'Wash - Dry - Press (Ironing)',
        weight: 5.0,
        addOns: ['fabcon', 'rush'],
        subtotal: 275.0,
        addOnTotal: 70,
        totalAmount: 345.0,
        paymentStatus: 'paid',
        paymentMethod: 'Cash',
        status: 'drying',
        notes: 'Please hang formal shirts promptly.',
        isDelivery: true,
        deliveryFee: 50,
        createdAt: new Date(Date.now() - 2.5 * 3600 * 1000).toISOString(),
        history: [
            { status: 'received', timestamp: new Date(Date.now() - 2.5 * 3600 * 1000).toISOString(), note: 'Rush order received' },
            { status: 'washing', timestamp: new Date(Date.now() - 1.8 * 3600 * 1000).toISOString(), note: 'Commercial wash complete' },
            { status: 'drying', timestamp: new Date(Date.now() - 0.7 * 3600 * 1000).toISOString(), note: 'In Commercial Dryer #4' }
        ]
    },
    {
        id: 'JO-2026-104',
        customerName: 'Elena Rostova',
        customerPhone: '0917-892-3412',
        customerAddress: 'Villa San Pedro, Block 7',
        serviceId: 'wash-dry-fold',
        serviceName: 'Wash - Dry - Fold (Regular)',
        weight: 6.5,
        addOns: ['fabcon'],
        subtotal: 227.5,
        addOnTotal: 20,
        totalAmount: 247.5,
        paymentStatus: 'paid',
        paymentMethod: 'Credit Card',
        status: 'ready',
        notes: 'Fold bedsheets into double packs.',
        isDelivery: false,
        createdAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
        history: [
            { status: 'received', timestamp: new Date(Date.now() - 4 * 3600 * 1000).toISOString(), note: 'Logged at counter' },
            { status: 'washing', timestamp: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), note: 'Sanitized drum wash' },
            { status: 'drying', timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), note: 'Gentle heat cycle complete' },
            { status: 'folding', timestamp: new Date(Date.now() - 1 * 3600 * 1000).toISOString(), note: 'Folded & vacuum sealed' },
            { status: 'ready', timestamp: new Date(Date.now() - 0.3 * 3600 * 1000).toISOString(), note: 'Stored in Rack A-02 ready for customer pickup' }
        ]
    },
    {
        id: 'JO-2026-1081',
        customerName: 'Maria Santos',
        customerPhone: '0917-892-3412',
        customerAddress: 'Banilad, Cebu City',
        serviceId: 'wash-dry-fold',
        serviceName: 'Wash - Dry - Fold (Regular)',
        weight: 6.5,
        addOns: ['fabcon'],
        subtotal: 227.5,
        addOnTotal: 20,
        totalAmount: 247.5,
        paymentStatus: 'paid', // 'paid' or 'unpaid'
        paymentMethod: 'GCash',
        status: 'ready', // ready for pickup
        notes: 'Separate red clothes; extra downy requested.',
        isDelivery: false,
        createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
        history: [
            { status: 'received', timestamp: new Date(Date.now() - 5 * 3600 * 1000).toISOString(), note: 'Received at counter' },
            { status: 'washing', timestamp: new Date(Date.now() - 4 * 3600 * 1000).toISOString(), note: 'In Washer #3' },
            { status: 'drying', timestamp: new Date(Date.now() - 2.5 * 3600 * 1000).toISOString(), note: 'Dryer #2 loaded' },
            { status: 'folding', timestamp: new Date(Date.now() - 1.2 * 3600 * 1000).toISOString(), note: 'Folded & plastic wrapped' },
            { status: 'ready', timestamp: new Date(Date.now() - 0.5 * 3600 * 1000).toISOString(), note: 'Stored in Rack B-4' }
        ]
    },
    {
        id: 'JO-2026-1082',
        customerName: 'Engr. Junrey Fernandez',
        customerPhone: '0922-451-9981',
        customerAddress: 'Mandaue City, Tipolo',
        serviceId: 'wash-dry-press',
        serviceName: 'Wash - Dry - Press (Ironing)',
        weight: 5.0,
        addOns: ['fabcon', 'rush'],
        subtotal: 275.0,
        addOnTotal: 70,
        totalAmount: 345.0,
        paymentStatus: 'paid',
        paymentMethod: 'Cash',
        status: 'drying',
        notes: '5 polo barongs for pressing, please use hangers.',
        isDelivery: true,
        deliveryFee: 50,
        createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
        history: [
            { status: 'received', timestamp: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), note: 'Rush job received' },
            { status: 'washing', timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), note: 'Delicate cycle' },
            { status: 'drying', timestamp: new Date(Date.now() - 0.7 * 3600 * 1000).toISOString(), note: 'Low heat dryer' }
        ]
    },
    {
        id: 'JO-2026-1083',
        customerName: 'Krizza Mae Alcantara',
        customerPhone: '0933-718-2234',
        customerAddress: 'Lahug, Cebu City (Near IT Park)',
        serviceId: 'heavy-comforter',
        serviceName: 'Comforter & Heavy Blankets',
        weight: 8.2,
        addOns: ['bleach', 'fabcon'],
        subtotal: 533.0,
        addOnTotal: 45,
        totalAmount: 578.0,
        paymentStatus: 'unpaid',
        paymentMethod: 'Pay on Pickup',
        status: 'washing',
        notes: '2 thick king-sized comforters with mild coffee stain.',
        isDelivery: false,
        createdAt: new Date(Date.now() - 1.5 * 3600 * 1000).toISOString(),
        history: [
            { status: 'received', timestamp: new Date(Date.now() - 1.5 * 3600 * 1000).toISOString(), note: 'Weighed & inspected' },
            { status: 'washing', timestamp: new Date(Date.now() - 0.8 * 3600 * 1000).toISOString(), note: 'Commercial Washer #1' }
        ]
    },
    {
        id: 'JO-2026-1084',
        customerName: 'Dante Villamor',
        customerPhone: '0908-332-1109',
        customerAddress: 'Talisay City, Poblacion',
        serviceId: 'wash-dry-fold',
        serviceName: 'Wash - Dry - Fold (Regular)',
        weight: 7.0,
        addOns: ['ecobag'],
        subtotal: 245.0,
        addOnTotal: 25,
        totalAmount: 270.0,
        paymentStatus: 'unpaid',
        paymentMethod: 'Cash upon claim',
        status: 'received',
        notes: 'Customer will pick up tomorrow morning.',
        isDelivery: false,
        createdAt: new Date(Date.now() - 0.4 * 3600 * 1000).toISOString(),
        history: [
            { status: 'received', timestamp: new Date(Date.now() - 0.4 * 3600 * 1000).toISOString(), note: 'Tagged and queued' }
        ]
    },
    {
        id: 'JO-2026-1079',
        customerName: 'Sarah Jean Lim',
        customerPhone: '0919-555-8901',
        customerAddress: 'Guadalupe, Cebu City',
        serviceId: 'wash-dry-fold',
        serviceName: 'Wash - Dry - Fold (Regular)',
        weight: 5.5,
        addOns: ['fabcon'],
        subtotal: 192.5,
        addOnTotal: 20,
        totalAmount: 212.5,
        paymentStatus: 'paid',
        paymentMethod: 'Cash',
        status: 'completed',
        notes: 'Claimed by daughter.',
        isDelivery: false,
        createdAt: new Date(Date.now() - 28 * 3600 * 1000).toISOString(),
        history: [
            { status: 'received', timestamp: new Date(Date.now() - 28 * 3600 * 1000).toISOString() },
            { status: 'washing', timestamp: new Date(Date.now() - 26 * 3600 * 1000).toISOString() },
            { status: 'drying', timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString() },
            { status: 'folding', timestamp: new Date(Date.now() - 22 * 3600 * 1000).toISOString() },
            { status: 'ready', timestamp: new Date(Date.now() - 20 * 3600 * 1000).toISOString() },
            { status: 'completed', timestamp: new Date(Date.now() - 4 * 3600 * 1000).toISOString(), note: 'Customer claimed at desk' }
        ]
    }
];

const LaundryStore = {
    init: function () {
        // One-time automatic migration to Clean Slate (0 orders) for live presentation testing
        if (localStorage.getItem('aquart_clean_slate_active') !== 'true') {
            this.resetToCleanSlate();
            localStorage.setItem('aquart_clean_slate_active', 'true');
        }

        // Initialize orders storage to empty array if not present (clean slate by default)
        if (localStorage.getItem(STORAGE_KEYS.ORDERS) === null) {
            localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([]));
        }
        if (!localStorage.getItem(STORAGE_KEYS.INVENTORY)) {
            localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(INITIAL_INVENTORY));
        }
        if (!localStorage.getItem(STORAGE_KEYS.CUSTOMERS)) {
            localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
        }
        if (!localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS)) {
            localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify([]));
        }
        if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
            localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(DEFAULT_USERS));
        }

        // Start global multi-device cloud synchronization
        try {
            if (typeof AquartCloudSync !== 'undefined') {
                AquartCloudSync.startAutoSync();
            }
        } catch (e) {}
    },

    getOrders: function () {
        this.init();
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDERS)) || [];
        } catch (e) {
            return [];
        }
    },

    resetToCleanSlate: function () {
        localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.PICKUP_REQUESTS, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.FEEDBACKS, JSON.stringify([]));
        localStorage.setItem('freshwave_inquiries', JSON.stringify([]));

        // Restore healthy full station inventory tanks
        const fullInventory = INITIAL_INVENTORY.map(item => ({
            ...item,
            stock: item.unit === 'Pieces' ? 300 : (item.unit === 'Bottles' ? 12 : 40),
            minStock: item.minStock || 10,
            minAlert: item.minStock || 10
        }));
        localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(fullInventory));

        // Broadcast cross-tab sync triggers
        localStorage.setItem('freshwave_orders_sync', Date.now().toString());
        localStorage.setItem('freshwave_inventory_sync', Date.now().toString());

        try {
            AquartRealtimeBus.emit('SYSTEM_RESET', { mode: 'clean_slate' });
            window.dispatchEvent(new CustomEvent('freshwave_order_updated', { detail: { orders: [] } }));
            window.dispatchEvent(new CustomEvent('freshwave_inventory_updated', { detail: { inventory: fullInventory } }));
            window.dispatchEvent(new CustomEvent('freshwave_reset', { detail: { mode: 'clean_slate' } }));
        } catch (e) {}

        return true;
    },

    loadDemoData: function () {
        localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(INITIAL_ORDERS));
        localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(INITIAL_CUSTOMERS));
        localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(INITIAL_INVENTORY));
        localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify([
            {
                id: 'notif-1',
                orderId: 'JO-2026-1081',
                customerPhone: '0917-892-3412',
                customerName: 'Maria Santos',
                status: 'ready',
                message: 'Good day Maria! Your laundry (JO-2026-1081) is READY FOR PICKUP at Aquart Laundry Station! Total: ₱247.50 (PAID). Thank you!',
                timestamp: new Date(Date.now() - 0.5 * 3600 * 1000).toISOString(),
                type: 'sms'
            }
        ]));
        localStorage.setItem(STORAGE_KEYS.FEEDBACKS, JSON.stringify([
            {
                id: 'FB-1001',
                orderId: 'JO-2026-1081',
                customerName: 'Maria Santos',
                customerPhone: '0917-892-3412',
                serviceName: 'Wash - Dry - Fold',
                rating: 5,
                comment: 'Super bango sa clothes and neatly folded! Very fast turnaround time!',
                submittedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString()
            },
            {
                id: 'FB-1002',
                orderId: 'JO-2026-1083',
                customerName: 'John Michael Lim',
                customerPhone: '0922-345-6789',
                serviceName: 'Wash - Dry - Press',
                rating: 5,
                comment: 'Steam ironing was crisp. Great quality and friendly cashier staff.',
                submittedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString()
            }
        ]));

        localStorage.setItem('freshwave_orders_sync', Date.now().toString());
        localStorage.setItem('freshwave_inventory_sync', Date.now().toString());

        try {
            AquartRealtimeBus.emit('SYSTEM_RESET', { mode: 'demo_data' });
            window.dispatchEvent(new CustomEvent('freshwave_order_updated', { detail: { orders: INITIAL_ORDERS } }));
            window.dispatchEvent(new CustomEvent('freshwave_inventory_updated', { detail: { inventory: INITIAL_INVENTORY } }));
            window.dispatchEvent(new CustomEvent('freshwave_reset', { detail: { mode: 'demo_data' } }));
        } catch (e) {}

        return true;
    },

    getOrderById: function (jobOrderId) {
        if (!jobOrderId) return null;
        const raw = String(jobOrderId).trim();
        if (!raw) return null;

        const orders = this.getOrders();
        if (!orders || orders.length === 0) return null;

        // 1. Exact ID match (case-insensitive, e.g. "JO-2026-1081" or "jo-2026-105")
        const upper = raw.toUpperCase();
        let match = orders.find(o => o.id && o.id.toUpperCase() === upper);
        if (match) return match;

        // 2. Normalized alphanumeric match (e.g. "JO20261081" or "JO 2026 1081")
        const alphaClean = upper.replace(/[^A-Z0-9]/g, '');
        if (alphaClean.length >= 3) {
            match = orders.find(o => o.id && o.id.replace(/[^A-Z0-9]/g, '').toUpperCase() === alphaClean);
            if (match) return match;
        }

        // 3. Year-omitted match or custom prefix (e.g. "JO-1081", "JO1081", "JO 1081", "#1081", "No. 1081")
        // Strip out common prefixes: JOB ORDER, JO, NO, #, spaces, dashes
        const strippedPrefix = upper.replace(/^(JOB\s*ORDER|JO|NO\.?|#|№)\s*[:#-]?\s*/i, '').trim();
        if (strippedPrefix.length > 0) {
            // Check if stripped prefix matches the end or sequence part of order id
            match = orders.find(o => {
                if (!o.id) return false;
                const oClean = o.id.toUpperCase();
                return oClean.endsWith('-' + strippedPrefix) || oClean.endsWith(strippedPrefix);
            });
            if (match) return match;
        }

        // 4. Sequence number & last-digits extraction (e.g. user typed "1081", "1004", "04", "4")
        const numMatches = raw.match(/\d+/g);
        if (numMatches && numMatches.length > 0) {
            const lastNum = numMatches[numMatches.length - 1];
            
            // 4a. Exact sequence matching (e.g. 1004 === 1004)
            const numVal = parseInt(lastNum, 10);
            if (!isNaN(numVal) && numVal > 0) {
                match = orders.find(o => {
                    if (!o.id) return false;
                    const parts = o.id.split('-');
                    const seq = parseInt(parts[parts.length - 1], 10);
                    return seq === numVal;
                });
                if (match) return match;
            }

            // 4b. Suffix / Last-digits matching (e.g. typed "4" or "04" matches JO-2026-1004)
            match = orders.find(o => {
                if (!o.id) return false;
                const parts = o.id.split('-');
                const seqStr = parts[parts.length - 1] || '';
                return seqStr.endsWith(lastNum) || o.id.endsWith(lastNum);
            });
            if (match) return match;
        }

        // 5. Customer Phone search (e.g. "0917-892-3412", "09178923412", "+639178923412", "8923412")
        const digitsOnly = raw.replace(/\D/g, '');
        if (digitsOnly.length >= 4) {
            const localDigits = digitsOnly.replace(/^(\+?63|0)/, '');
            match = orders.find(o => {
                if (!o.customerPhone) return false;
                const oDigits = o.customerPhone.replace(/\D/g, '');
                const oLocal = oDigits.replace(/^(\+?63|0)/, '');
                return oDigits.includes(digitsOnly) || 
                       (localDigits.length >= 4 && oLocal.includes(localDigits)) ||
                       (digitsOnly.length >= 7 && oDigits.endsWith(digitsOnly));
            });
            if (match) return match;
        }

        // 6. Customer Name search (e.g. "Maria", "Santos", "Patricia")
        if (raw.length >= 2) {
            const nameQuery = raw.toLowerCase();
            match = orders.find(o => o.customerName && o.customerName.toLowerCase().includes(nameQuery));
            if (match) return match;
        }

        // 7. Broad inclusion fallback in ID
        if (upper.length >= 3) {
            match = orders.find(o => o.id && o.id.toUpperCase().includes(upper));
            if (match) return match;
        }

        return null;
    },

    saveOrder: function (orderData) {
        const orders = this.getOrders();
        const index = orders.findIndex(o => o.id === orderData.id);
        const isNew = (index < 0);
        if (index >= 0) {
            orders[index] = orderData;
        } else {
            orders.unshift(orderData);
        }
        localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
        // Cross-tab sync trigger
        localStorage.setItem('freshwave_orders_sync', Date.now().toString());
        this.recordCustomerTransaction(orderData);

        // Cross-device cloud sync
        try {
            if (typeof AquartCloudSync !== 'undefined') {
                AquartCloudSync.pushOrder(orderData);
            }
        } catch (e) {}

        try {
            AquartRealtimeBus.emit('ORDER_SAVED', { order: orderData, isNew: isNew });
            window.dispatchEvent(new CustomEvent('freshwave_order_updated', {
                detail: { order: orderData, status: orderData.status, isNew: isNew }
            }));
        } catch (e) {}
        return orderData;
    },

    updateOrderStatus: function (orderId, newStatus, staffNote) {
        const orders = this.getOrders();
        const order = orders.find(o => o.id === orderId);
        if (!order) return null;

        const previousStatus = order.status;
        order.status = newStatus;
        if (!order.history) order.history = [];

        order.history.push({
            status: newStatus,
            timestamp: new Date().toISOString(),
            note: staffNote || `Status updated to ${newStatus}`
        });

        localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
        localStorage.setItem('freshwave_orders_sync', Date.now().toString());

        // Cross-device cloud sync
        try {
            if (typeof AquartCloudSync !== 'undefined') {
                AquartCloudSync.pushOrder(order);
            }
        } catch (e) {}

        // Deduct inventory automatically when entering washing state if not yet deducted
        if (newStatus === 'washing' && !order.inventoryDeducted) {
            order.inventoryDeducted = true;
            this.autoConsumeSupplies(order);
        }

        // Automated notification trigger
        const notif = this.triggerNotification(order, newStatus, previousStatus);

        try {
            AquartRealtimeBus.emit('ORDER_STATUS_CHANGED', { order: order, previousStatus: previousStatus, status: newStatus });
            window.dispatchEvent(new CustomEvent('freshwave_order_updated', {
                detail: { order: order, status: newStatus, previousStatus: previousStatus }
            }));
        } catch (e) {}

        return { order, notification: notif };
    },

    updatePaymentStatus: function (orderId, newStatus, paymentMethod) {
        const orders = this.getOrders();
        const order = orders.find(o => o.id === orderId);
        if (order) {
            order.paymentStatus = newStatus;
            if (paymentMethod) order.paymentMethod = paymentMethod;
            localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
            localStorage.setItem('freshwave_orders_sync', Date.now().toString());

            // Cross-device cloud sync
            try {
                if (typeof AquartCloudSync !== 'undefined') {
                    AquartCloudSync.pushOrder(order);
                }
            } catch (e) {}

            try {
                AquartRealtimeBus.emit('ORDER_PAYMENT_CHANGED', { order: order, paymentStatus: newStatus });
                window.dispatchEvent(new CustomEvent('freshwave_order_updated', {
                    detail: { order: order, paymentStatus: newStatus }
                }));
            } catch (e) {}
        }
        return order;
    },

    autoConsumeSupplies: function (order) {
        // e.g. 1 liter detergent per 10kg, fabcon if selected
        const kg = Number(order.weight) || 5;
        const detergentUsed = Math.max(0.2, (kg * 0.05)); // ~0.25 - 0.5L
        this.adjustStock('inv-1', -detergentUsed);
        if (order.addOns && order.addOns.includes('fabcon')) {
            this.adjustStock('inv-2', -0.15);
        }
        if (order.addOns && order.addOns.includes('bleach')) {
            this.adjustStock('inv-3', -1);
        }
        this.adjustStock('inv-4', -1); // 1 plastic bag
    },

    generateJobOrderId: function () {
        const orders = this.getOrders();
        const currentYear = new Date().getFullYear();
        let maxSeq = 1000;
        if (orders && orders.length > 0) {
            orders.forEach(o => {
                const parts = o.id.split('-');
                if (parts.length === 3) {
                    const seq = parseInt(parts[2], 10);
                    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
                }
            });
        }
        return `JO-${currentYear}-${maxSeq + 1}`;
    },

    calculatePrice: function (serviceId, weightKg, addOnKeys = [], isDelivery = false) {
        const service = LAUNDRY_SERVICES[serviceId] || LAUNDRY_SERVICES['wash-dry-fold'];
        const weight = Math.max(0.5, parseFloat(weightKg) || service.minKg);
        const billableWeight = Math.max(weight, service.minKg);
        const subtotal = billableWeight * service.pricePerKg;

        let addOnTotal = 0;
        const addOnDetails = [];
        (addOnKeys || []).forEach(key => {
            if (ADD_ONS[key]) {
                addOnTotal += ADD_ONS[key].price;
                addOnDetails.push(ADD_ONS[key]);
            }
        });

        const deliveryFee = isDelivery ? 50 : 0;
        const grandTotal = subtotal + addOnTotal + deliveryFee;

        return {
            service,
            weight,
            billableWeight,
            subtotal,
            addOnTotal,
            addOnDetails,
            deliveryFee,
            grandTotal,
            total: grandTotal
        };
    },

    // Inventory operations
    getInventory: function () {
        this.init();
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.INVENTORY)) || INITIAL_INVENTORY;
        } catch (e) {
            return INITIAL_INVENTORY;
        }
    },

    adjustStock: function (invId, delta) {
        const inventory = this.getInventory();
        const item = inventory.find(i => i.id === invId);
        if (item) {
            item.stock = Math.max(0, parseFloat((item.stock + delta).toFixed(2)));
            localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(inventory));
            if (typeof AquartCloudSync !== 'undefined') {
                AquartCloudSync.pushInventory(item);
            }
            try {
                AquartRealtimeBus.emit('INVENTORY_UPDATED', { item: item, inventory: inventory });
                window.dispatchEvent(new CustomEvent('freshwave_inventory_updated', {
                    detail: { item: item, inventory: inventory }
                }));
            } catch (e) {}
        }
        return inventory;
    },

    restockItem: function (invId, amountToAdd) {
        return this.adjustStock(invId, Math.abs(parseFloat(amountToAdd) || 0));
    },

    // Customers operations
    getCustomers: function () {
        this.init();
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOMERS)) || INITIAL_CUSTOMERS;
        } catch (e) {
            return INITIAL_CUSTOMERS;
        }
    },

    recordCustomerTransaction: function (order) {
        const customers = this.getCustomers();
        let cust = customers.find(c => c.name.toLowerCase() === order.customerName.toLowerCase() || c.phone === order.customerPhone);
        if (!cust) {
            cust = {
                id: `CUST-${String(customers.length + 1).padStart(3, '0')}`,
                name: order.customerName,
                phone: order.customerPhone,
                address: order.customerAddress || 'N/A',
                ordersCount: 1,
                totalSpent: order.totalAmount
            };
            customers.push(cust);
        } else {
            cust.ordersCount = (cust.ordersCount || 0) + 1;
            cust.totalSpent = (cust.totalSpent || 0) + order.totalAmount;
            if (order.customerAddress && (!cust.address || cust.address === 'N/A')) {
                cust.address = order.customerAddress;
            }
        }
        localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
        if (typeof AquartCloudSync !== 'undefined' && cust) {
            AquartCloudSync.pushCustomer(cust);
        }
    },

    // User Authentication & Session Operations
    getUsers: function () {
        this.init();
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS)) || DEFAULT_USERS;
        } catch (e) {
            return DEFAULT_USERS;
        }
    },

    saveUser: function (userData) {
        const users = this.getUsers();
        const index = users.findIndex(u => u.id === userData.id || u.username.toLowerCase() === userData.username.toLowerCase());
        if (index >= 0) {
            users[index] = userData;
        } else {
            users.push(userData);
        }
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
        return userData;
    },

    login: function (username, password) {
        if (!username || !password) {
            return { success: false, message: 'Please provide both username and password.' };
        }
        const users = this.getUsers();
        const cleanUser = String(username).trim().toLowerCase();
        const user = users.find(u => u.username.toLowerCase() === cleanUser);
        
        if (!user || user.password !== password) {
            return { success: false, message: 'Invalid username or password. Please verify credentials.' };
        }

        const sessionUser = {
            id: user.id,
            username: user.username,
            fullName: user.fullName,
            role: user.role, // 'admin' or 'staff'
            email: user.email,
            loginTime: new Date().toISOString()
        };

        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(sessionUser));
        try {
            window.dispatchEvent(new CustomEvent('freshwave_auth_changed', { detail: { user: sessionUser } }));
        } catch (e) {}

        return { success: true, user: sessionUser };
    },

    register: function (userData, passcode) {
        const { username, password, fullName, role, email } = userData;
        if (!username || !password || !fullName || !role) {
            return { success: false, message: 'Please complete all required fields.' };
        }

        const targetRole = role.toLowerCase() === 'admin' ? 'admin' : 'staff';
        const expectedCode = targetRole === 'admin' ? STATION_PASSCODES.admin : STATION_PASSCODES.staff;

        if (!passcode || passcode.trim().toUpperCase() !== expectedCode) {
            return { 
                success: false, 
                message: `Store Security Passcode required for ${targetRole.toUpperCase()} authorization. (Demo Passcode: "${expectedCode}")` 
            };
        }

        const users = this.getUsers();
        const exists = users.some(u => u.username.toLowerCase() === username.trim().toLowerCase());
        if (exists) {
            return { success: false, message: `Username "${username}" is already in use by another staff member.` };
        }

        const newUser = {
            id: 'usr-' + Date.now().toString(36),
            username: username.trim().toLowerCase(),
            password: password,
            fullName: fullName.trim(),
            role: targetRole,
            email: email ? email.trim() : `${username.trim().toLowerCase()}@freshwave.ph`,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));

        // Auto login newly registered employee
        this.login(newUser.username, newUser.password);

        return { success: true, user: newUser };
    },

    createEmployeeAccount: function (userData) {
        const { username, password, fullName, role, email } = userData;
        if (!username || !password || !fullName || !role) {
            return { success: false, message: 'Please complete all required fields.' };
        }

        const targetRole = role.toLowerCase() === 'admin' ? 'admin' : 'staff';
        const users = this.getUsers();
        const exists = users.some(u => u.username.toLowerCase() === username.trim().toLowerCase());
        if (exists) {
            return { success: false, message: `Username "${username}" is already in use by another staff member.` };
        }

        const newUser = {
            id: 'usr-' + Date.now().toString(36),
            username: username.trim().toLowerCase(),
            password: password,
            fullName: fullName.trim(),
            role: targetRole,
            email: email ? email.trim() : `${username.trim().toLowerCase()}@aquartlaundry.ph`,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
        return { success: true, user: newUser };
    },

    deleteEmployeeAccount: function (userId) {
        const current = this.getCurrentUser();
        if (current && current.id === userId) {
            return { success: false, message: 'You cannot delete your own currently active account.' };
        }

        let users = this.getUsers();
        const target = users.find(u => u.id === userId);
        if (!target) {
            return { success: false, message: 'User account not found.' };
        }

        // Prevent deleting the main admin account if only 1 admin remains
        const adminCount = users.filter(u => u.role === 'admin').length;
        if (target.role === 'admin' && adminCount <= 1) {
            return { success: false, message: 'Cannot delete the sole Station Supervisor account.' };
        }

        users = users.filter(u => u.id !== userId);
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
        return { success: true, message: `Account for ${target.fullName} deleted.` };
    },

    getCurrentUser: function () {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    },

    logout: function (redirectTo = 'login.html') {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        try {
            window.dispatchEvent(new CustomEvent('freshwave_auth_changed', { detail: { user: null } }));
        } catch (e) {}
        if (redirectTo) {
            window.location.href = redirectTo;
        }
    },

    requireAuth: function (allowedRoles = ['admin', 'staff'], pageLabel = '') {
        const user = this.getCurrentUser();
        if (!user) {
            const currentPath = window.location.pathname.split('/').pop() || 'staff.html';
            window.location.replace(`login.html?redirect=${encodeURIComponent(currentPath)}&reason=login_required`);
            return null;
        }

        if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
            alert(`Access Restricted: Your account (${user.fullName} • ${user.role.toUpperCase()}) does not have permission to view ${pageLabel || 'this page'}. Redirecting to Staff Operations Desk.`);
            window.location.replace('staff.html');
            return null;
        }

        return user;
    },

    // Contact Inquiries Handling
    getInquiries: function () {
        try {
            return JSON.parse(localStorage.getItem('aquart_inquiries')) || [];
        } catch (e) {
            return [];
        }
    },

    saveInquiry: function (inquiry) {
        const list = this.getInquiries();
        inquiry.id = 'INQ-' + Date.now().toString().slice(-6);
        inquiry.createdAt = new Date().toISOString();
        inquiry.status = 'unread';
        list.unshift(inquiry);
        localStorage.setItem('aquart_inquiries', JSON.stringify(list));
        return inquiry;
    },

    // Pickup & Delivery Requests
    getPickupRequests: function () {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.PICKUP_REQUESTS)) || [];
        } catch (e) {
            return [];
        }
    },

    savePickupRequest: function (req) {
        const list = this.getPickupRequests();
        req.id = 'REQ-' + Date.now().toString().slice(-6);
        req.createdAt = new Date().toISOString();
        req.status = 'pending';
        list.unshift(req);
        localStorage.setItem(STORAGE_KEYS.PICKUP_REQUESTS, JSON.stringify(list));
        return req;
    },

    // Notifications & Audio Chime
    getNotifications: function () {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS)) || [];
        } catch (e) {
            return [];
        }
    },

    playAudioChime: function (type = 'success') {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            if (type === 'ready') {
                // Happy high double-chime for ready to pickup
                osc.type = 'sine';
                osc.frequency.setValueAtTime(587.33, now); // D5
                osc.frequency.setValueAtTime(880, now + 0.12); // A5
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
                osc.start(now);
                osc.stop(now + 0.5);
            } else if (type === 'alert') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.setValueAtTime(330, now + 0.15);
                gain.gain.setValueAtTime(0.25, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
                osc.start(now);
                osc.stop(now + 0.4);
            } else {
                // gentle tap sound
                osc.type = 'sine';
                osc.frequency.setValueAtTime(523.25, now); // C5
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
                osc.start(now);
                osc.stop(now + 0.25);
            }
        } catch (err) {
            // Audio context policy safe ignore
        }
    },

    triggerNotification: function (order, status, previousStatus) {
        const statusObj = ORDER_STATUSES.find(s => s.key === status) || {};
        let message = '';
        const payText = order.paymentStatus === 'paid' ? 'PAID' : `UNPAID Balance: ₱${order.totalAmount.toFixed(2)}`;

        if (status === 'reserved') {
            const slotStr = order.dropOffSlot ? `for ${order.dropOffDate || 'today'} (${order.dropOffSlot})` : '';
            message = `📅 Good day ${order.customerName}! Your drop-off reservation (${order.id}) at Aquart Laundry is CONFIRMED ${slotStr}. Please present this Job Order reference at our counter. Thank you!`;
            this.playAudioChime('success');
        } else if (status === 'ready') {
            message = `🎉 Good day ${order.customerName}! Your laundry (${order.id}) is now READY FOR PICKUP at Aquart Laundry Station! Total: ₱${order.totalAmount.toFixed(2)} (${payText}). Thank you!`;
            this.playAudioChime('ready');
        } else if (status === 'washing') {
            message = `🧼 Hi ${order.customerName}! Your laundry (${order.id}) is now in the washing machine cycle.`;
            this.playAudioChime('tap');
        } else if (status === 'drying') {
            message = `💨 Hi ${order.customerName}! Your laundry (${order.id}) is now in the dryer cycle.`;
            this.playAudioChime('tap');
        } else if (status === 'folding') {
            message = `🧺 Hi ${order.customerName}! Your laundry (${order.id}) is now being neatly folded and packed.`;
            this.playAudioChime('tap');
        } else if (status === 'completed') {
            message = `✅ Thank you ${order.customerName}! Job Order ${order.id} has been claimed. We look forward to serving you again at Aquart Laundry Station!`;
            this.playAudioChime('success');
        } else {
            message = `Aquart Laundry: Status of order ${order.id} is now ${statusObj.label || status}.`;
            this.playAudioChime('tap');
        }

        const isAutoSmsMilestone = (status === 'reserved' || status === 'ready');
        const notifItem = {
            id: 'notif-' + Date.now(),
            orderId: order.id,
            customerPhone: order.customerPhone,
            customerName: order.customerName,
            status: status,
            message: message,
            timestamp: new Date().toISOString(),
            type: 'sms',
            smsStatus: isAutoSmsMilestone ? 'pending' : 'local',
            smsError: null
        };

        const notifications = this.getNotifications();
        notifications.unshift(notifItem);
        localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));

        if (typeof AquartCloudSync !== 'undefined') {
            AquartCloudSync.pushNotification(notifItem).then(() => {
                if (isAutoSmsMilestone) {
                    AquartCloudSync.sendSmsViaEdge(notifItem, false);
                }
            });
        }

        // Dispatch a custom event for live UI reactivity across open tabs
        window.dispatchEvent(new CustomEvent('freshwave_order_updated', {
            detail: { order, status, notification: notifItem }
        }));

        return notifItem;
    },

    resendSms: async function (notifId) {
        const notifications = this.getNotifications();
        const notif = notifications.find(n => n.id === notifId);
        if (!notif) return { ok: false, error: 'Notification not found' };
        if (typeof AquartCloudSync !== 'undefined') {
            AquartCloudSync._updateLocalNotifStatus(notif.id, 'pending', null, null);
            return await AquartCloudSync.sendSmsViaEdge(notif, true);
        }
        return { ok: false, error: 'Cloud sync unavailable' };
    },

    // Analytics Calculation
    getAnalytics: function () {
        const orders = this.getOrders();
        const inventory = this.getInventory();
        const customers = this.getCustomers();

        let totalRevenue = 0;
        let todayRevenue = 0;
        let totalKg = 0;
        let activeOrders = 0;
        let completedOrders = 0;
        let unpaidCount = 0;
        let unpaidAmount = 0;

        const serviceBreakdown = {};
        const dailyRevenue = {};

        const todayStr = new Date().toISOString().split('T')[0];

        orders.forEach(o => {
            const amt = Number(o.totalAmount) || 0;
            const kg = Number(o.weight) || 0;
            totalRevenue += amt;
            totalKg += kg;

            if (o.status === 'completed') {
                completedOrders++;
            } else {
                activeOrders++;
            }

            if (o.paymentStatus === 'unpaid') {
                unpaidCount++;
                unpaidAmount += amt;
            }

            // Daily grouping
            const dateStr = (o.createdAt || todayStr).split('T')[0];
            dailyRevenue[dateStr] = (dailyRevenue[dateStr] || 0) + amt;
            if (dateStr === todayStr) {
                todayRevenue += amt;
            }

            // Service breakdown
            const sName = o.serviceName || o.serviceId || 'Standard';
            serviceBreakdown[sName] = (serviceBreakdown[sName] || 0) + 1;
        });

        const lowStockItems = inventory.filter(i => i.stock <= i.minStock);

        return {
            totalRevenue,
            todayRevenue,
            totalKg: parseFloat(totalKg.toFixed(1)),
            activeOrders,
            completedOrders,
            totalOrders: orders.length,
            unpaidCount,
            unpaidAmount,
            customersCount: customers.length,
            lowStockCount: lowStockItems.length,
            lowStockItems,
            serviceBreakdown,
            dailyRevenue
        };
    },

    // Customer Feedback & Rating System
    getFeedbacks: function () {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.FEEDBACKS)) || [];
        } catch (e) {
            return [];
        }
    },

    hasSubmittedFeedback: function (orderId) {
        if (!orderId) return false;
        const list = this.getFeedbacks();
        return list.some(f => (f.orderId || '').toUpperCase() === orderId.toUpperCase());
    },

    saveFeedback: function (feedbackData) {
        const list = this.getFeedbacks();
        const existingIndex = list.findIndex(f => (f.orderId || '').toUpperCase() === (feedbackData.orderId || '').toUpperCase());

        const newFeedback = {
            id: feedbackData.id || ('FB-' + Date.now().toString().slice(-6)),
            orderId: feedbackData.orderId || '',
            customerName: feedbackData.customerName || 'Anonymous Customer',
            customerPhone: feedbackData.customerPhone || '',
            serviceName: feedbackData.serviceName || 'General Laundry',
            rating: Math.min(5, Math.max(1, parseInt(feedbackData.rating, 10) || 5)),
            comment: (feedbackData.comment || '').trim(),
            submittedAt: feedbackData.submittedAt || new Date().toISOString()
        };

        if (existingIndex >= 0) {
            list[existingIndex] = newFeedback;
        } else {
            list.unshift(newFeedback);
        }

        try {
            localStorage.setItem(STORAGE_KEYS.FEEDBACKS, JSON.stringify(list));
            localStorage.setItem('freshwave_feedback_sync', Date.now().toString());

            // Cross-device cloud sync
            if (typeof AquartCloudSync !== 'undefined') {
                AquartCloudSync.pushFeedback(newFeedback);
            }

            AquartRealtimeBus.emit('FEEDBACK_SUBMITTED', { feedback: newFeedback });
            window.dispatchEvent(new CustomEvent('freshwave_feedback_submitted', { detail: { feedback: newFeedback } }));
        } catch (e) {
            console.error('Error saving feedback:', e);
        }

        return newFeedback;
    },

    getFeedbackAnalytics: function () {
        const list = this.getFeedbacks();
        const total = list.length;
        if (total === 0) {
            return {
                averageRating: 0,
                totalCount: 0,
                ratingBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
                recentFeedbacks: []
            };
        }

        let sum = 0;
        const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        list.forEach(item => {
            const r = item.rating || 5;
            sum += r;
            if (breakdown[r] !== undefined) {
                breakdown[r]++;
            }
        });

        const avg = parseFloat((sum / total).toFixed(1));
        return {
            averageRating: avg,
            totalCount: total,
            ratingBreakdown: breakdown,
            recentFeedbacks: list.slice(0, 15)
        };
    }
};

window.LaundryStore = LaundryStore;
window.LAUNDRY_SERVICES = LAUNDRY_SERVICES;
window.ADD_ONS = ADD_ONS;
window.ORDER_STATUSES = ORDER_STATUSES;

/**
 * Global Toast Notification Utility
 * Available across all pages (index, staff, admin, login)
 */
function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    const icon = type === 'error' ? '⚠️' : (type === 'success' ? '✅' : '🔔');
    toast.innerHTML = `<span style="margin-right: 6px;">${icon}</span> <span>${message}</span>`;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

window.showToast = showToast;
