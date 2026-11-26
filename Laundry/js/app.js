/**
 * FreshWave Laundry Station - Customer Portal Application Logic
 * Interactive Live Order Tracking, Price Estimator, and Pickup Request.
 */

document.addEventListener('DOMContentLoaded', function () {
    try { LaundryStore.init(); } catch (e) { console.error('LaundryStore.init error:', e); }

    // 1. Check URL parameters for Job Order
    const urlParams = new URLSearchParams(window.location.search);
    const initialJo = urlParams.get('jo') || '';

    try { initHeroTabs(); } catch (e) { console.error('initHeroTabs error:', e); }
    try { initNavLinks(); } catch (e) { console.error('initNavLinks error:', e); }
    try { initTracker(initialJo); } catch (e) { console.error('initTracker error:', e); }
    try { renderDynamicTrackerChips(); } catch (e) { console.error('renderDynamicTrackerChips error:', e); }
    try { initReserveSlotForm(); } catch (e) { console.error('initReserveSlotForm error:', e); }
    try { initEstimator(); } catch (e) { console.error('initEstimator error:', e); }
    try { initPickupForm(); } catch (e) { console.error('initPickupForm error:', e); }
    try { initContactForm(); } catch (e) { console.error('initContactForm error:', e); }
    try { initQrScannerMock(); } catch (e) { console.error('initQrScannerMock error:', e); }
    try { initFeedbackModalListeners(); } catch (e) { console.error('initFeedbackModalListeners error:', e); }
    try { initMobileNavOptimization(); } catch (e) { console.error('initMobileNavOptimization error:', e); }

    // Instant Dual-Channel Real-time Broadcast Bus
    if (window.AquartRealtimeBus) {
        window.AquartRealtimeBus.on((msg) => {
            if (msg.type === 'ORDER_SAVED' || msg.type === 'ORDER_STATUS_CHANGED' || msg.type === 'ORDER_PAYMENT_CHANGED') {
                renderDynamicTrackerChips();
                const currentJo = document.getElementById('current-tracked-id')?.value;
                const order = msg.payload?.order;
                if (currentJo && order && order.id.toUpperCase() === currentJo.toUpperCase()) {
                    renderOrderTracking(currentJo, false);
                    if (order.status === 'ready') {
                        LaundryStore.playAudioChime('ready');
                        showToast(`🎉 Your laundry (${order.id}) is READY FOR PICKUP!`, 'success');
                    } else {
                        showToast(`⚡ Real-time update: Order ${order.id} is now ${order.status.toUpperCase()}`);
                    }
                }
            } else if (msg.type === 'SYSTEM_RESET') {
                renderDynamicTrackerChips();
                const trackInput = document.getElementById('track-jo-input');
                if (trackInput) trackInput.value = '';
                const resultBox = document.getElementById('tracker-result-box');
                if (resultBox) resultBox.style.display = 'none';
                const instantCard = document.getElementById('hero-instant-status');
                if (instantCard) instantCard.style.display = 'none';
                const emptyState = document.getElementById('tracker-empty-state');
                if (emptyState) emptyState.style.display = 'none';
            }
        });
    }

    // Fallback storage listener across tabs
    window.addEventListener('storage', (e) => {
        if (e.key === 'freshwave_orders' || e.key === 'freshwave_orders_sync' || e.key === 'aquart_realtime_event') {
            renderDynamicTrackerChips();
            const currentJo = document.getElementById('current-tracked-id')?.value;
            if (currentJo) renderOrderTracking(currentJo);
        }
    });

    window.addEventListener('freshwave_order_updated', (e) => {
        renderDynamicTrackerChips();
        const currentJo = document.getElementById('current-tracked-id')?.value;
        if (currentJo && e.detail.order && e.detail.order.id.toUpperCase() === currentJo.toUpperCase()) {
            renderOrderTracking(currentJo);
            showToast(`Order ${e.detail.order.id}: Status is now ${e.detail.order.status.toUpperCase()}`);
        }
    });

    window.addEventListener('freshwave_reset', () => {
        renderDynamicTrackerChips();
        const trackInput = document.getElementById('track-jo-input');
        if (trackInput) trackInput.value = '';
        const resultBox = document.getElementById('tracker-result-box');
        if (resultBox) resultBox.style.display = 'none';
        const instantCard = document.getElementById('hero-instant-status');
        if (instantCard) instantCard.style.display = 'none';
        const emptyState = document.getElementById('tracker-empty-state');
        if (emptyState) emptyState.style.display = 'none';
    });
});

/**
 * RENDER DYNAMIC TRACKER CHIPS
 */
function renderDynamicTrackerChips() {
    const container = document.getElementById('dynamic-chips-container');
    if (!container) return;

    const orders = LaundryStore.getOrders();
    container.innerHTML = '';

    if (!orders || orders.length === 0) {
        container.innerHTML = `<span style="color: #64748b; font-size: 0.78rem;">No active orders yet — create a reservation below to test tracking!</span>`;
        return;
    }

    const recent = orders.slice(0, 4);
    recent.forEach(order => {
        const sDef = ORDER_STATUSES.find(s => s.key === order.status) || {};
        const chip = document.createElement('span');
        chip.className = `demo-chip demo-chip-${order.status} sample-chip`;
        chip.setAttribute('data-jo', order.id);
        chip.style.cursor = 'pointer';
        const shortName = (order.customerName || 'Customer').split(' ')[0];
        chip.innerText = `${order.id} (${shortName} - ${sDef.label || order.status})`;
        chip.addEventListener('click', () => {
            const trackInput = document.getElementById('track-jo-input');
            if (trackInput) trackInput.value = order.id;
            const trackBtn = document.getElementById('btn-track-submit');
            if (trackBtn) trackBtn.click();
        });
        container.appendChild(chip);
    });
}

/**
 * TRACKER LOGIC
 */
function initTracker(defaultJo) {
    const trackInput = document.getElementById('track-jo-input');
    const trackBtn = document.getElementById('btn-track-submit');

    if (trackInput && defaultJo) {
        trackInput.value = defaultJo;
        renderOrderTracking(defaultJo, false);
    } else {
        const resultBox = document.getElementById('tracker-result-box');
        if (resultBox) resultBox.style.display = 'none';
    }

    if (trackBtn) {
        trackBtn.addEventListener('click', () => {
            const val = trackInput ? trackInput.value.trim() : '';
            if (val) {
                renderOrderTracking(val, true); // Auto-scrolls and pulses!
                // Update URL query string without page reload
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.set('jo', val.toUpperCase());
                window.history.replaceState({}, '', newUrl);
            } else {
                // If empty, search latest order
                const latest = LaundryStore.getOrders()[0];
                if (latest) {
                    if (trackInput) trackInput.value = latest.id;
                    renderOrderTracking(latest.id, true);
                } else {
                    showToast('Please enter your Job Order #, Phone, or Name.', 'error');
                }
            }
        });
    }

    if (trackInput) {
        trackInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (trackBtn) trackBtn.click();
            }
        });
    }

    // Nav link and Instant status card slide down hooks
    const navTrackLink = document.getElementById('nav-track-link');
    if (navTrackLink) {
        navTrackLink.addEventListener('click', (e) => {
            e.preventDefault();
            slideDownToTracker();
        });
    }

    const instantScrollBtn = document.getElementById('btn-scroll-to-tracker');
    if (instantScrollBtn) {
        instantScrollBtn.addEventListener('click', () => {
            slideDownToTracker();
        });
    }

    // Sample chip clicks
    document.querySelectorAll('.sample-chip').forEach(chip => {
        chip.addEventListener('click', function () {
            const jo = this.getAttribute('data-jo');
            if (trackInput) trackInput.value = jo;
            renderOrderTracking(jo, true);
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('jo', jo.toUpperCase());
            window.history.replaceState({}, '', newUrl);
        });
    });
}

function slideDownToTracker() {
    const resultBox = document.getElementById('tracker-result-box');
    if (!resultBox) return;

    resultBox.style.display = 'block';
    const emptyState = document.getElementById('tracker-empty-state');
    if (emptyState) emptyState.style.display = 'none';

    // Switch hero tab to 'track' so customer sees both cards active
    if (window.switchHeroTab) {
        window.switchHeroTab('track');
    }

    // Smooth scroll directly to the status box with clearance for sticky navbar
    setTimeout(() => {
        const nav = document.querySelector('.navbar');
        const navHeight = nav ? nav.offsetHeight : 70;
        const rect = (resultBox && resultBox.getBoundingClientRect) ? resultBox.getBoundingClientRect() : { top: 0 };
        const scrollTop = window.pageYOffset || window.scrollY || (document.documentElement ? document.documentElement.scrollTop : 0) || (document.body ? document.body.scrollTop : 0) || 0;
        const targetY = Math.max(0, rect.top + scrollTop - navHeight - 18);

        if (window.scrollTo) {
            window.scrollTo({
                top: targetY,
                behavior: 'smooth'
            });
        }

        // Trigger dynamic glow pulse animation on result box
        resultBox.classList.remove('highlight-pulse');
        void resultBox.offsetWidth; // Force reflow
        resultBox.classList.add('highlight-pulse');
        setTimeout(() => resultBox.classList.remove('highlight-pulse'), 2500);
    }, 60);
}

function renderOrderTracking(query, autoScroll = false) {
    const order = LaundryStore.getOrderById(query);
    const emptyState = document.getElementById('tracker-empty-state');
    const resultBox = document.getElementById('tracker-result-box');
    const instantCard = document.getElementById('hero-instant-status');

    if (!order) {
        if (emptyState) {
            emptyState.style.display = 'block';
            if (autoScroll) {
                try {
                    emptyState.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } catch (e) {}
            }
        }
        if (resultBox) resultBox.style.display = 'none';
        if (instantCard) instantCard.style.display = 'none';
        showToast(`Job Order "${query}" not found. Try searching by JO#, Phone, or Customer Name.`, 'error');
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (resultBox) {
        resultBox.style.display = 'block';
    }

    // Populate Hero Instant Card for immediate glance under search bar
    if (instantCard) {
        instantCard.style.display = 'block';
        const instantJo = document.getElementById('instant-jo-id');
        if (instantJo) instantJo.innerText = order.id;

        const sDef = ORDER_STATUSES.find(s => s.key === order.status) || ORDER_STATUSES[0];
        const statusBadge = document.getElementById('instant-status-badge');
        if (statusBadge) {
            statusBadge.className = `status-badge status-${order.status}`;
            statusBadge.innerHTML = `${sDef.icon} ${sDef.label}`;
        }

        const custElem = document.getElementById('instant-customer');
        if (custElem) custElem.innerText = order.customerName;

        const srvElem = document.getElementById('instant-service');
        if (srvElem) srvElem.innerText = order.serviceName;

        const wtElem = document.getElementById('instant-weight');
        if (wtElem) wtElem.innerText = `${order.weight} kg`;

        const totalAmt = Number(order.totalAmount !== undefined ? order.totalAmount : (order.grandTotal || order.total || 0));
        const totElem = document.getElementById('instant-total');
        if (totElem) totElem.innerText = `₱${totalAmt.toFixed(2)}`;

        const stTextElem = document.getElementById('instant-status-text');
        if (stTextElem) stTextElem.innerText = sDef.label;

        const btnScroll = document.getElementById('btn-scroll-to-tracker');
        if (btnScroll) {
            btnScroll.onclick = () => slideDownToTracker();
        }
    }

    // Sync input with matched order id if customer searched by phone or partial number
    const trackInput = document.getElementById('track-jo-input');
    if (trackInput && trackInput.value.trim() && trackInput.value.toUpperCase() !== order.id) {
        trackInput.value = order.id;
    }

    // Store current tracking ID
    let currentIdHolder = document.getElementById('current-tracked-id');
    if (!currentIdHolder) {
        currentIdHolder = document.createElement('input');
        currentIdHolder.type = 'hidden';
        currentIdHolder.id = 'current-tracked-id';
        document.body.appendChild(currentIdHolder);
    }
    currentIdHolder.value = order.id;

    // Header info
    const totalAmt = Number(order.totalAmount !== undefined ? order.totalAmount : (order.grandTotal || order.total || 0));
    const subtotalAmt = Number(order.subtotal !== undefined ? order.subtotal : (totalAmt - (order.addOnTotal || 0)));
    const addonsAmt = Number(order.addOnTotal || 0);

    const joDisp = document.getElementById('track-jo-display');
    if (joDisp) joDisp.innerText = order.id;

    const custNameDisp = document.getElementById('track-customer-name');
    if (custNameDisp) custNameDisp.innerText = order.customerName;

    const srvNameDisp = document.getElementById('track-service-name');
    if (srvNameDisp) srvNameDisp.innerText = order.serviceName;

    const wtDisp = document.getElementById('track-weight');
    if (wtDisp) wtDisp.innerText = `${order.weight} kg`;

    let createdTimeStr = 'Just now';
    try {
        if (order.createdAt) {
            const d = new Date(order.createdAt);
            if (!isNaN(d.getTime())) {
                createdTimeStr = d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            }
        }
    } catch (e) {}
    const createdElem = document.getElementById('track-created-time');
    if (createdElem) createdElem.innerText = createdTimeStr;

    // Payment badge
    const payBadge = document.getElementById('track-payment-badge');
    if (payBadge) {
        if (order.paymentStatus === 'paid') {
            payBadge.className = 'badge-paid';
            payBadge.innerText = 'PAID';
        } else if (order.paymentStatus === 'pending_verification') {
            payBadge.className = 'badge-unpaid';
            payBadge.style.background = '#fef3c7';
            payBadge.style.color = '#92400e';
            payBadge.style.borderColor = '#fde68a';
            payBadge.innerText = `VERIFYING: ₱${totalAmt.toFixed(2)}`;
        } else {
            payBadge.className = 'badge-unpaid';
            payBadge.innerText = `UNPAID: ₱${totalAmt.toFixed(2)}`;
        }
    }

    // Status Badge & Stepper
    const statusObj = ORDER_STATUSES.find(s => s.key === order.status) || ORDER_STATUSES[0];
    const statusBadge = document.getElementById('track-status-pill');
    if (statusBadge) {
        statusBadge.className = `status-badge status-${order.status}`;
        statusBadge.innerHTML = `${statusObj.icon} ${statusObj.label}`;
    }

    // Stepper calculations
    const statusIndex = ORDER_STATUSES.findIndex(s => s.key === order.status);
    const totalSteps = ORDER_STATUSES.length - 1; // 6 steps
    const progressPercent = totalSteps > 0 && statusIndex >= 0 ? Math.min(100, Math.max(0, (statusIndex / totalSteps) * 100)) : 0;

    const progressLine = document.getElementById('stepper-progress-fill');
    if (progressLine) {
        progressLine.style.width = `${progressPercent}%`;
    }

    // Step items
    const stepItems = document.querySelectorAll('.step-item');
    stepItems.forEach((el, idx) => {
        el.classList.remove('active', 'completed');
        if (idx < statusIndex) {
            el.classList.add('completed');
        } else if (idx === statusIndex) {
            el.classList.add('active');
        }
    });

    // Generate real QR Code for this order safely
    const qrContainer = document.getElementById('tracker-qrcode-holder');
    if (qrContainer) {
        qrContainer.innerHTML = '';
        try {
            if (typeof QRCode !== 'undefined') {
                const currentUrl = window.location.origin + window.location.pathname.replace('index.html', '') + 'tracker.html?jo=' + encodeURIComponent(order.id);
                new QRCode(qrContainer, {
                    text: currentUrl,
                    width: 140,
                    height: 140,
                    colorDark: "#0284c7",
                    colorLight: "#ffffff",
                    correctLevel: (window.QRCode && QRCode.CorrectLevel) ? QRCode.CorrectLevel.H : 2
                });
            } else {
                qrContainer.innerHTML = `<div style="font-size:0.75rem; color:#64748b; padding:10px;">Tracking Pass: <strong>${order.id}</strong></div>`;
            }
        } catch (qrErr) {
            console.warn('QR Code generation error:', qrErr);
        }
    }

    // Itemized charges breakdown
    const trackTotalElem = document.getElementById('track-total-amount');
    if (trackTotalElem) trackTotalElem.innerText = `₱${totalAmt.toFixed(2)}`;

    const trackSubElem = document.getElementById('track-subtotal');
    if (trackSubElem) trackSubElem.innerText = `₱${subtotalAmt.toFixed(2)}`;

    const trackAddonsElem = document.getElementById('track-addons-total');
    if (trackAddonsElem) trackAddonsElem.innerText = `₱${addonsAmt.toFixed(2)}`;

    // Addons text list
    const addonsElem = document.getElementById('track-addons-list');
    if (addonsElem) {
        if (order.addOns && order.addOns.length > 0) {
            const labels = order.addOns.map(a => ADD_ONS[a]?.name || a);
            addonsElem.innerText = labels.join(', ');
        } else {
            addonsElem.innerText = 'None';
        }
    }

    // Notes & Reservation banner
    const notesElem = document.getElementById('track-notes');
    if (notesElem) {
        if (order.dropOffSlot) {
            notesElem.innerHTML = `<span style="display:inline-block; background:#fef3c7; color:#92400e; padding:3px 8px; border-radius:6px; font-weight:700; margin-bottom:4px;">📅 Reserved Slot: ${order.dropOffDate || ''} • ${order.dropOffSlot}</span><br>${order.notes || 'Awaiting counter drop-off'}`;
        } else {
            notesElem.innerText = order.notes || 'No special instructions.';
        }
    }

    // Timeline logs
    const timelineList = document.getElementById('tracker-history-timeline');
    if (timelineList) {
        timelineList.innerHTML = '';
        const hist = (order.history && order.history.length > 0) ? order.history : [{
            status: order.status,
            timestamp: order.createdAt,
            note: 'Order recorded'
        }];

        hist.slice().reverse().forEach(h => {
            const sDef = ORDER_STATUSES.find(s => s.key === h.status) || {};
            const timeStr = new Date(h.timestamp).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
            const dateStr = new Date(h.timestamp).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
            
            const li = document.createElement('li');
            li.style.cssText = 'padding: 0.5rem 0; border-left: 2px solid #0284c7; padding-left: 1rem; margin-left: 0.5rem; position: relative;';
            li.innerHTML = `
                <div style="font-weight: 700; font-size: 0.85rem; color: #0f172a;">${sDef.icon || '📌'} ${sDef.label || h.status} <span style="font-size: 0.75rem; color: #64748b; font-weight: 400;">(${dateStr} ${timeStr})</span></div>
                <div style="font-size: 0.78rem; color: #64748b;">${h.note || ''}</div>
            `;
            timelineList.appendChild(li);
        });
    }

    // Share link button
    const shareBtn = document.getElementById('btn-share-tracker');
    if (shareBtn) {
        shareBtn.onclick = () => {
            const shareUrl = window.location.origin + window.location.pathname.replace('index.html', '') + 'tracker.html?jo=' + order.id;
            if (navigator.clipboard) {
                navigator.clipboard.writeText(shareUrl);
                showToast('Tracking link copied to clipboard!');
            } else {
                prompt('Copy this link to track on phone:', shareUrl);
            }
        };
    }

    // Smoothly slide down to the stepper & tracking card after DOM updates are ready
    if (autoScroll) {
        slideDownToTracker();
    }

    // Auto-prompt feedback modal if status is completed and feedback hasn't been submitted yet
    checkOrderFeedbackPrompt(order);
}

/**
 * CUSTOMER SERVICE FEEDBACK MODAL PROMPT
 */
function checkOrderFeedbackPrompt(order) {
    if (!order || order.status !== 'completed') return;

    const modal = document.getElementById('service-feedback-modal');
    if (!modal) return;

    // Check if customer already submitted feedback for this order
    if (LaundryStore.hasSubmittedFeedback(order.id)) {
        return;
    }

    const joDisplay = document.getElementById('feedback-modal-jo');
    if (joDisplay) joDisplay.innerText = order.id;

    const srvDisplay = document.getElementById('feedback-modal-service');
    if (srvDisplay) srvDisplay.innerText = `${order.serviceName || 'Laundry Service'} (${order.weight || 0}kg)`;

    const formWrap = document.getElementById('feedback-form-container');
    const thankWrap = document.getElementById('feedback-thankyou-container');
    if (formWrap) formWrap.style.display = 'block';
    if (thankWrap) thankWrap.style.display = 'none';

    // Show after slight delay for polite, non-jarring appearance
    setTimeout(() => {
        modal.classList.add('active');
        if (window.LaundryStore && LaundryStore.playAudioChime) {
            LaundryStore.playAudioChime('tap');
        }
    }, 700);
}

/**
 * INTERACTIVE PRICE ESTIMATOR
 */
function initEstimator() {
    const weightSlider = document.getElementById('est-weight-slider');
    const weightDisplay = document.getElementById('est-weight-val');
    const serviceCards = document.querySelectorAll('.service-card-select');
    const addonCheckboxes = document.querySelectorAll('.est-addon-check');
    const deliveryCheck = document.getElementById('est-delivery-check');

    let selectedService = 'wash-dry-fold';

    function recalculate() {
        const weight = parseFloat(weightSlider.value) || 5;
        if (weightDisplay) weightDisplay.innerText = `${weight.toFixed(1)} kg`;

        const activeAddons = [];
        addonCheckboxes.forEach(cb => {
            if (cb.checked) activeAddons.push(cb.value);
        });

        const isDelivery = deliveryCheck ? deliveryCheck.checked : false;

        const calc = LaundryStore.calculatePrice(selectedService, weight, activeAddons, isDelivery);

        const bKgElem = document.getElementById('est-billable-kg');
        if (bKgElem) bKgElem.innerText = `${calc.billableWeight} kg`;

        const rKgElem = document.getElementById('est-rate-kg');
        if (rKgElem) rKgElem.innerText = `₱${calc.service.pricePerKg}/kg`;

        const subElem = document.getElementById('est-subtotal-disp');
        if (subElem) subElem.innerText = `₱${calc.subtotal.toFixed(2)}`;

        const addElem = document.getElementById('est-addons-disp');
        if (addElem) addElem.innerText = `₱${calc.addOnTotal.toFixed(2)}`;

        const delElem = document.getElementById('est-delivery-disp');
        if (delElem) delElem.innerText = `₱${calc.deliveryFee.toFixed(2)}`;

        const gtElem = document.getElementById('est-grand-total');
        if (gtElem) gtElem.innerText = `₱${calc.grandTotal.toFixed(2)}`;

        // Pre-fill request form button
        const bookBtn = document.getElementById('btn-est-book');
        if (bookBtn) {
            bookBtn.onclick = () => {
                const reqServiceSelect = document.getElementById('req-service');
                const reqWeightInput = document.getElementById('req-weight');
                if (reqServiceSelect) reqServiceSelect.value = selectedService;
                if (reqWeightInput) reqWeightInput.value = weight;
                
                // Scroll smoothly to pickup section
                const formSection = document.getElementById('pickup-request-section');
                if (formSection) {
                    formSection.scrollIntoView({ behavior: 'smooth' });
                }
                showToast('Estimate details copied to Pickup Form!');
            };
        }
    }

    if (weightSlider) {
        weightSlider.addEventListener('input', recalculate);
    }

    serviceCards.forEach(card => {
        card.addEventListener('click', function () {
            serviceCards.forEach(c => c.classList.remove('selected'));
            this.classList.add('selected');
            selectedService = this.getAttribute('data-service');
            recalculate();
        });
    });

    addonCheckboxes.forEach(cb => {
        cb.addEventListener('change', recalculate);
    });

    if (deliveryCheck) {
        deliveryCheck.addEventListener('change', recalculate);
    }

    recalculate();
}

/**
 * PICKUP & DELIVERY FORM
 */
function initPickupForm() {
    const form = document.getElementById('pickup-request-form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
        e.preventDefault();

        const name = document.getElementById('req-name').value.trim();
        const phone = document.getElementById('req-phone').value.trim();
        const address = document.getElementById('req-address').value.trim();
        const service = document.getElementById('req-service').value;
        const weight = document.getElementById('req-weight').value || 5;
        const date = document.getElementById('req-date').value;
        const time = document.getElementById('req-time').value;
        const notes = document.getElementById('req-notes').value.trim();

        if (!name || !phone || !address) {
            showToast('Please provide your Name, Phone Number, and Complete Address.', 'error');
            return;
        }

        const joId = LaundryStore.generateJobOrderId();
        const weightNum = parseFloat(weight) || 5.0;
        const calc = LaundryStore.calculatePrice(service, weightNum, ['fabcon'], true);
        const sDef = LAUNDRY_SERVICES[service] || LAUNDRY_SERVICES['wash-dry-fold'];

        const newOrder = {
            id: joId,
            customerName: name,
            customerPhone: phone,
            customerAddress: address,
            serviceId: service,
            serviceName: sDef.name,
            weight: weightNum,
            addOns: ['fabcon'],
            subtotal: calc.subtotal,
            addOnTotal: calc.addOnTotal,
            deliveryFee: 50,
            totalAmount: Number(calc.grandTotal !== undefined ? calc.grandTotal : (calc.total || 0)),
            paymentStatus: 'unpaid',
            paymentMethod: 'Pay upon Doorstep Delivery',
            status: 'reserved',
            dropOffDate: date,
            dropOffSlot: time,
            isDelivery: true,
            isOnlineReservation: true,
            notes: notes || 'Doorstep Pickup & Delivery Order',
            createdAt: new Date().toISOString(),
            history: [
                {
                    status: 'reserved',
                    timestamp: new Date().toISOString(),
                    note: `Doorstep pickup scheduled for ${date} (${time})`
                }
            ]
        };

        // Save into main orders store and trigger notification
        LaundryStore.saveOrder(newOrder);
        LaundryStore.triggerNotification(newOrder, 'reserved');
        LaundryStore.playAudioChime('success');

        // Show confirmation modal with official Job Order number
        const modal = document.getElementById('pickup-confirm-modal');
        if (modal) {
            document.getElementById('confirm-req-id').innerText = newOrder.id;
            document.getElementById('confirm-req-name').innerText = name;
            document.getElementById('confirm-req-time').innerText = `${date} (${time})`;
            modal.classList.add('active');
        }

        // Setup instant Track Now button inside pickup modal
        const trackPickupBtn = document.getElementById('btn-pickup-track-now');
        if (trackPickupBtn) {
            trackPickupBtn.onclick = () => {
                modal.classList.remove('active');
                if (window.switchHeroTab) window.switchHeroTab('track');
                const trackInput = document.getElementById('track-jo-input');
                if (trackInput) trackInput.value = newOrder.id;
                renderOrderTracking(newOrder.id, true);
            };
        }

        showToast(`🎉 Doorstep Pickup Booked: ${newOrder.id}!`);
        form.reset();
    });

    // Close modal
    const closeBtn = document.getElementById('btn-close-confirm-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('pickup-confirm-modal').classList.remove('active');
        });
    }
}

/**
 * SIMULATED QR CODE SCANNER MODAL
 */
function initQrScannerMock() {
    const scanBtn = document.getElementById('btn-open-scanner');
    const modal = document.getElementById('qr-scanner-modal');
    const closeBtn = document.getElementById('btn-close-scanner-modal');

    if (!scanBtn || !modal) return;

    scanBtn.addEventListener('click', () => {
        modal.classList.add('active');
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('active');
        });
    }

    // Quick select buttons inside QR scanner modal
    document.querySelectorAll('.btn-sim-scan').forEach(btn => {
        btn.addEventListener('click', function () {
            const jo = this.getAttribute('data-scan-jo');
            modal.classList.remove('active');
            const trackInput = document.getElementById('track-jo-input');
            if (trackInput) trackInput.value = jo;
            renderOrderTracking(jo);
            LaundryStore.playAudioChime('ready');
            showToast(`QR Code Scanned: ${jo}!`);
        });
    });
}

/**
 * TOAST NOTIFICATION HELPER
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
    const icon = type === 'error' ? '⚠️' : '🔔';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

/**
 * HERO TABS NAVIGATION
 */
function initHeroTabs() {
    const tabTrack = document.getElementById('tab-btn-track');
    const tabReserve = document.getElementById('tab-btn-reserve');
    const paneTrack = document.getElementById('pane-track');
    const paneReserve = document.getElementById('pane-reserve');
    const navReserveLink = document.getElementById('nav-reserve-link');

    function switchTab(target) {
        if (target === 'reserve') {
            tabTrack?.classList.remove('active');
            tabReserve?.classList.add('active');
            paneTrack?.classList.remove('active');
            paneReserve?.classList.add('active');
        } else {
            tabReserve?.classList.remove('active');
            tabTrack?.classList.add('active');
            paneReserve?.classList.remove('active');
            paneTrack?.classList.add('active');
        }
    }

    if (tabTrack) {
        tabTrack.addEventListener('click', () => switchTab('track'));
    }
    if (tabReserve) {
        tabReserve.addEventListener('click', () => switchTab('reserve'));
    }
    if (navReserveLink) {
        navReserveLink.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab('reserve');
            document.getElementById('hero-action-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
                document.getElementById('res-name')?.focus();
            }, 300);
        });
    }

    window.switchHeroTab = switchTab;
}

/**
 * Compress an image file using HTML5 Canvas to prevent filling localStorage
 * Returns a promise resolving to base64 Data URL (~40-80KB JPEG)
 */
function compressImageFile(file, maxWidth = 800, maxHeight = 800, quality = 0.75) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) {
            reject(new Error('File is not a valid image'));
            return;
        }
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = (e) => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedDataUrl);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

/**
 * ONLINE ORDER & DROP-OFF SLOT RESERVATION
 */
function initReserveSlotForm() {
    const form = document.getElementById('hero-reserve-form');
    if (!form) return;

    const serviceSelect = document.getElementById('res-service');
    const weightInput = document.getElementById('res-weight');
    const dateInput = document.getElementById('res-date');
    const slotSelect = document.getElementById('res-slot-select');
    const priceDisplay = document.getElementById('res-price-disp');
    const assignedJoElem = document.getElementById('res-assigned-jo');

    // Payment selectors and elements
    const paymentSelect = document.getElementById('res-payment-method');
    const gcashPanel = document.getElementById('res-payment-gcash-panel');
    const mayaPanel = document.getElementById('res-payment-maya-panel');

    // Image Proof State for GCash & Maya
    let gcashProofData = null;
    let mayaProofData = null;

    const gcashFileInput = document.getElementById('res-gcash-file');
    const gcashPreviewWrap = document.getElementById('res-gcash-preview-wrap');
    const gcashThumb = document.getElementById('res-gcash-thumb');
    const gcashFilename = document.getElementById('res-gcash-filename');
    const btnRemoveGcash = document.getElementById('btn-remove-gcash-file');

    const mayaFileInput = document.getElementById('res-maya-file');
    const mayaPreviewWrap = document.getElementById('res-maya-preview-wrap');
    const mayaThumb = document.getElementById('res-maya-thumb');
    const mayaFilename = document.getElementById('res-maya-filename');
    const btnRemoveMaya = document.getElementById('btn-remove-maya-file');

    if (gcashFileInput) {
        gcashFileInput.addEventListener('change', async function() {
            const file = this.files && this.files[0];
            if (!file) return;
            try {
                const compressed = await compressImageFile(file);
                gcashProofData = compressed;
                if (gcashThumb) gcashThumb.src = compressed;
                if (gcashFilename) gcashFilename.innerText = file.name;
                if (gcashPreviewWrap) gcashPreviewWrap.style.display = 'flex';
                showToast('Payment screenshot attached!', 'success');
            } catch (err) {
                console.error(err);
                showToast('Failed to process image. Please try another file.', 'error');
            }
        });
    }

    if (btnRemoveGcash) {
        btnRemoveGcash.addEventListener('click', () => {
            gcashProofData = null;
            if (gcashFileInput) gcashFileInput.value = '';
            if (gcashPreviewWrap) gcashPreviewWrap.style.display = 'none';
        });
    }

    if (mayaFileInput) {
        mayaFileInput.addEventListener('change', async function() {
            const file = this.files && this.files[0];
            if (!file) return;
            try {
                const compressed = await compressImageFile(file);
                mayaProofData = compressed;
                if (mayaThumb) mayaThumb.src = compressed;
                if (mayaFilename) mayaFilename.innerText = file.name;
                if (mayaPreviewWrap) mayaPreviewWrap.style.display = 'flex';
                showToast('Payment screenshot attached!', 'success');
            } catch (err) {
                console.error(err);
                showToast('Failed to process image. Please try another file.', 'error');
            }
        });
    }

    if (btnRemoveMaya) {
        btnRemoveMaya.addEventListener('click', () => {
            mayaProofData = null;
            if (mayaFileInput) mayaFileInput.value = '';
            if (mayaPreviewWrap) mayaPreviewWrap.style.display = 'none';
        });
    }

    // Live preview elements
    const previewSubtotal = document.getElementById('res-preview-subtotal');
    const previewAddons = document.getElementById('res-preview-addons');
    const previewAddonsCount = document.getElementById('res-preview-addons-count');
    const previewTotal = document.getElementById('res-preview-total');
    const previewRateBadge = document.getElementById('res-breakdown-rate-badge');

    // Generate real Job Order preview number immediately
    function refreshAssignedJo() {
        if (assignedJoElem) {
            assignedJoElem.innerText = LaundryStore.generateJobOrderId();
        }
    }
    refreshAssignedJo();

    // Default date to today
    const today = new Date().toISOString().split('T')[0];
    if (dateInput) {
        dateInput.value = today;
        dateInput.min = today;
    }

    // Toggle Payment Method Panels
    function handlePaymentMethodChange() {
        const method = paymentSelect ? paymentSelect.value : 'counter';
        if (gcashPanel) gcashPanel.style.display = (method === 'gcash') ? 'block' : 'none';
        if (mayaPanel) mayaPanel.style.display = (method === 'maya') ? 'block' : 'none';
    }
    if (paymentSelect) {
        paymentSelect.addEventListener('change', handlePaymentMethodChange);
        handlePaymentMethodChange();
    }

    function getSelectedAddons() {
        const addons = [];
        const checkboxes = document.querySelectorAll('.res-addon-checkbox');
        checkboxes.forEach(cb => {
            if (cb.checked) addons.push(cb.value);
        });
        return addons;
    }

    function calculateEstPrice() {
        const sId = serviceSelect?.value || 'wash-dry-fold';
        const weight = parseFloat(weightInput?.value) || 6.0;
        const activeAddons = getSelectedAddons();

        const calc = LaundryStore.calculatePrice(sId, weight, activeAddons, false);
        const grandTotal = Number(calc.grandTotal !== undefined ? calc.grandTotal : (calc.total || 0));

        if (priceDisplay) {
            priceDisplay.innerText = `₱${grandTotal.toFixed(2)}`;
        }
        if (previewSubtotal) {
            previewSubtotal.innerText = `₱${calc.subtotal.toFixed(2)}`;
        }
        if (previewAddons) {
            previewAddons.innerText = `₱${calc.addOnTotal.toFixed(2)}`;
        }
        if (previewAddonsCount) {
            previewAddonsCount.innerText = activeAddons.length;
        }
        if (previewTotal) {
            previewTotal.innerText = `₱${grandTotal.toFixed(2)}`;
        }
        if (previewRateBadge && calc.service) {
            previewRateBadge.innerText = `₱${calc.service.pricePerKg}/kg (Min ${calc.service.minKg}kg)`;
        }
        return { ...calc, activeAddons, grandTotal };
    }

    if (serviceSelect) serviceSelect.addEventListener('change', calculateEstPrice);
    if (weightInput) {
        weightInput.addEventListener('input', calculateEstPrice);
        weightInput.addEventListener('change', calculateEstPrice);
    }

    // Listen to add-on checkboxes
    const addonCheckboxes = document.querySelectorAll('.res-addon-checkbox');
    addonCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            calculateEstPrice();
            if (window.LaundryStore && LaundryStore.playAudioChime) {
                LaundryStore.playAudioChime('tap');
            }
        });
    });

    calculateEstPrice();

    // Special Instruction Preset Option Chips Toggle
    const instructionChips = document.querySelectorAll('#res-instruction-chips .instruction-chip');
    instructionChips.forEach(chip => {
        chip.addEventListener('click', function(e) {
            e.preventDefault();
            this.classList.toggle('active');
            if (window.LaundryStore && LaundryStore.playAudioChime) {
                LaundryStore.playAudioChime('tap');
            }
        });
    });

    // Form submission
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('res-name')?.value.trim();
        const phone = document.getElementById('res-phone')?.value.trim();
        const sId = serviceSelect?.value || 'wash-dry-fold';
        const weight = parseFloat(weightInput?.value) || 6.0;
        const date = dateInput?.value || today;
        const slot = slotSelect?.value || '10:00 AM - 12:00 PM';
        
        // Compile Special Instructions from Chips + Custom Input
        const activeChips = Array.from(document.querySelectorAll('#res-instruction-chips .instruction-chip.active'))
            .map(chip => chip.getAttribute('data-val') || chip.innerText.replace('✓', '').trim());
        const customNotes = document.getElementById('res-notes')?.value.trim();
        
        let compiledInstructions = activeChips.join(', ');
        if (customNotes) {
            compiledInstructions = compiledInstructions 
                ? `${compiledInstructions} • Note: ${customNotes}` 
                : customNotes;
        }
        if (!compiledInstructions) {
            compiledInstructions = 'Standard Care & Handling';
        }

        if (!name || !phone) {
            showToast('Please enter customer name and mobile phone number.', 'error');
            return;
        }

        const calc = calculateEstPrice();
        const joId = (assignedJoElem && assignedJoElem.innerText) ? assignedJoElem.innerText : LaundryStore.generateJobOrderId();
        const serviceDef = LAUNDRY_SERVICES[sId] || LAUNDRY_SERVICES['wash-dry-fold'];
        const totalAmountVal = Number(calc.grandTotal !== undefined ? calc.grandTotal : (calc.total || 0));

        // Payment info handling
        const payMethod = paymentSelect ? paymentSelect.value : 'counter';
        let paymentStatus = 'unpaid';
        let paymentMethodLabel = 'Pay at Counter Upon Drop-off';
        let refNumber = '';
        let proofImage = null;

        if (payMethod === 'gcash') {
            refNumber = document.getElementById('res-gcash-ref')?.value.trim();
            proofImage = gcashProofData;
            const parts = [];
            if (refNumber) parts.push(`Ref: ${refNumber}`);
            if (proofImage) parts.push('📸 Screenshot Attached');
            paymentMethodLabel = parts.length > 0 ? `GCash (${parts.join(', ')})` : 'GCash Online Payment';
            paymentStatus = 'pending_verification';
        } else if (payMethod === 'maya') {
            refNumber = document.getElementById('res-maya-ref')?.value.trim();
            proofImage = mayaProofData;
            const parts = [];
            if (refNumber) parts.push(`Ref: ${refNumber}`);
            if (proofImage) parts.push('📸 Screenshot Attached');
            paymentMethodLabel = parts.length > 0 ? `Maya (${parts.join(', ')})` : 'Maya Online Payment';
            paymentStatus = 'pending_verification';
        }

        const newOrder = {
            id: joId,
            customerName: name,
            customerPhone: phone,
            customerAddress: 'Counter Drop-off (Store Visit)',
            serviceId: sId,
            serviceName: serviceDef.name,
            weight: weight,
            addOns: calc.activeAddons || ['fabcon'],
            subtotal: calc.subtotal || 0,
            addOnTotal: calc.addOnTotal || 0,
            deliveryFee: 0,
            totalAmount: totalAmountVal,
            paymentStatus: paymentStatus,
            paymentMethod: paymentMethodLabel,
            paymentRefNumber: refNumber,
            paymentProofImage: proofImage,
            status: 'reserved',
            dropOffDate: date,
            dropOffSlot: slot,
            notes: compiledInstructions,
            isDelivery: false,
            isOnlineReservation: true,
            createdAt: new Date().toISOString(),
            history: [
                {
                    status: 'reserved',
                    timestamp: new Date().toISOString(),
                    note: `Drop-off slot reserved online for ${date} (${slot}) [${paymentMethodLabel}]`
                }
            ]
        };

        // Save order and trigger notifications
        LaundryStore.saveOrder(newOrder);
        LaundryStore.triggerNotification(newOrder, 'reserved');

        // Populate Ticket Modal
        const ticketJoElem = document.getElementById('ticket-jo-id');
        if (ticketJoElem) ticketJoElem.innerText = newOrder.id;
        const ticketCustElem = document.getElementById('ticket-cust-name');
        if (ticketCustElem) ticketCustElem.innerText = newOrder.customerName;
        const ticketDateElem = document.getElementById('ticket-date');
        if (ticketDateElem) ticketDateElem.innerText = newOrder.dropOffDate;
        const ticketTimeElem = document.getElementById('ticket-time');
        if (ticketTimeElem) ticketTimeElem.innerText = newOrder.dropOffSlot;
        const ticketAmtElem = document.getElementById('ticket-amount');
        if (ticketAmtElem) ticketAmtElem.innerText = `₱${newOrder.totalAmount.toFixed(2)}`;
        const ticketPayElem = document.getElementById('ticket-payment-method');
        if (ticketPayElem) {
            ticketPayElem.innerText = (paymentStatus === 'pending_verification') 
                ? `⏳ ${paymentMethodLabel} (Pending Staff Verification)` 
                : paymentMethodLabel;
        }
        const ticketInstrElem = document.getElementById('ticket-instructions');
        if (ticketInstrElem) {
            ticketInstrElem.innerText = compiledInstructions;
        }

        // Sync track input immediately with newly assigned Job Order
        const trackInput = document.getElementById('track-jo-input');
        if (trackInput) {
            trackInput.value = newOrder.id;
        }

        // Generate QR Code for Ticket Pass
        const qrContainer = document.getElementById('ticket-qr-container');
        if (qrContainer) {
            qrContainer.innerHTML = '';
            try {
                if (typeof QRCode !== 'undefined') {
                    const passUrl = window.location.origin + window.location.pathname.replace('index.html', '') + 'tracker.html?jo=' + encodeURIComponent(newOrder.id);
                    new QRCode(qrContainer, {
                        text: passUrl,
                        width: 140,
                        height: 140,
                        colorDark: '#0284c7',
                        colorLight: '#ffffff',
                        correctLevel: (window.QRCode && QRCode.CorrectLevel) ? QRCode.CorrectLevel.H : 2
                    });
                } else {
                    qrContainer.innerHTML = `<div style="font-size:0.75rem; color:#64748b; padding:10px;">Pass: <strong>${newOrder.id}</strong></div>`;
                }
            } catch (err) {
                console.warn('Ticket QR generation error:', err);
            }
        }

        const ticketModal = document.getElementById('reservation-ticket-modal');
        if (ticketModal) ticketModal.classList.add('active');

        showToast(`Job Order Created: ${newOrder.id}! Payment: ${paymentMethodLabel}`, 'success');
        form.reset();
        gcashProofData = null;
        mayaProofData = null;
        if (gcashPreviewWrap) gcashPreviewWrap.style.display = 'none';
        if (mayaPreviewWrap) mayaPreviewWrap.style.display = 'none';
        if (dateInput) dateInput.value = today;
        refreshAssignedJo();
        calculateEstPrice();
        handlePaymentMethodChange();
    });

    // Close Ticket Modal
    const closeBtn = document.getElementById('btn-close-ticket-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('reservation-ticket-modal')?.classList.remove('active');
        });
    }

    // Copy Job Order button
    const copyJoBtn = document.getElementById('btn-copy-ticket-jo');
    if (copyJoBtn) {
        copyJoBtn.addEventListener('click', () => {
            const joId = document.getElementById('ticket-jo-id')?.innerText;
            if (joId) {
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(joId).then(() => {
                        showToast(`📋 Copied: ${joId}`);
                    }).catch(() => {
                        showToast(`Job Order: ${joId}`);
                    });
                } else {
                    showToast(`Job Order: ${joId}`);
                }
            }
        });
    }

    // Modal Track Live button
    const trackNowBtn = document.getElementById('btn-ticket-track-now');
    if (trackNowBtn) {
        trackNowBtn.addEventListener('click', () => {
            const joId = document.getElementById('ticket-jo-id')?.innerText;
            document.getElementById('reservation-ticket-modal')?.classList.remove('active');
            if (window.switchHeroTab) window.switchHeroTab('track');
            const trackInput = document.getElementById('track-jo-input');
            if (trackInput && joId) {
                trackInput.value = joId;
            }
            renderOrderTracking(joId, true); // Auto-scrolls and pulses!
        });
    }

    // Modal Print button
    const printBtn = document.getElementById('btn-ticket-print');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            window.print();
        });
    }
}

/**
 * NAVBAR ACTIVE STATE & SCROLL SPY
 */
function initNavLinks() {
    const navLinks = document.querySelectorAll('#main-nav-links .nav-link');

    function setActiveNav(navKey) {
        navLinks.forEach(link => {
            if (link.getAttribute('data-nav') === navKey) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    const navHome = document.querySelector('[data-nav="home"]');
    const navReserve = document.getElementById('nav-reserve-link');
    const navTrack = document.getElementById('nav-track-link');
    const navServices = document.querySelector('[data-nav="services"]');
    const navEstimator = document.querySelector('[data-nav="estimator"]');
    const navContact = document.querySelector('[data-nav="contact"]');

    if (navHome) {
        navHome.addEventListener('click', (e) => {
            setActiveNav('home');
        });
    }

    if (navReserve) {
        navReserve.addEventListener('click', (e) => {
            e.preventDefault();
            setActiveNav('reserve');
            if (window.switchHeroTab) window.switchHeroTab('reserve');
            const card = document.getElementById('hero-action-card');
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => {
                    document.getElementById('res-name')?.focus();
                }, 350);
            }
        });
    }

    if (navTrack) {
        navTrack.addEventListener('click', (e) => {
            e.preventDefault();
            setActiveNav('track');
            if (window.switchHeroTab) window.switchHeroTab('track');
            const trackInput = document.getElementById('track-jo-input');
            const resultBox = document.getElementById('tracker-result-box');
            if (resultBox && resultBox.style.display !== 'none') {
                slideDownToTracker();
            } else if (trackInput) {
                trackInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => trackInput.focus(), 300);
            }
        });
    }

    if (navServices) {
        navServices.addEventListener('click', () => {
            setActiveNav('services');
        });
    }

    if (navEstimator) {
        navEstimator.addEventListener('click', () => {
            setActiveNav('estimator');
        });
    }

    if (navContact) {
        navContact.addEventListener('click', () => {
            setActiveNav('contact');
        });
    }

    // Scroll spy: Automatically sync active nav link when scrolling between sections
    let scrollTimeout;
    window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            const sections = [
                { key: 'contact', el: document.getElementById('contact-section') },
                { key: 'services', el: document.getElementById('services-section') },
                { key: 'estimator', el: document.getElementById('estimator-section') },
                { key: 'home', el: document.getElementById('hero-section') }
            ];

            const scrollPos = window.scrollY + 180;

            for (const sec of sections) {
                if (sec.el) {
                    const top = sec.el.offsetTop;
                    const height = sec.el.offsetHeight;
                    if (scrollPos >= top && scrollPos < top + height) {
                        if (sec.key === 'home') {
                            const isReserveActive = document.getElementById('tab-btn-reserve')?.classList.contains('active');
                            setActiveNav(isReserveActive ? 'reserve' : 'home');
                        } else {
                            setActiveNav(sec.key);
                        }
                        break;
                    }
                }
            }
        }, 50);
    }, { passive: true });
}

/**
 * CONTACT US & INQUIRY FORM
 */
function initContactForm() {
    const form = document.getElementById('contact-inquiry-form');
    if (!form) return;

    const anonToggle = document.getElementById('inq-anonymous-toggle');
    const nameInput = document.getElementById('inq-name');
    const contactInput = document.getElementById('inq-contact');
    const nameStar = document.getElementById('inq-name-req-star');
    const contactStar = document.getElementById('inq-contact-req-star');

    if (anonToggle) {
        anonToggle.addEventListener('change', function () {
            if (this.checked) {
                if (nameInput) {
                    nameInput.value = 'Anonymous Customer';
                    nameInput.readOnly = true;
                    nameInput.style.backgroundColor = '#f1f5f9';
                    nameInput.style.color = '#64748b';
                }
                if (contactInput) {
                    contactInput.placeholder = 'Optional for anonymous (or phone for reply)';
                    contactInput.required = false;
                }
                if (nameStar) nameStar.style.display = 'none';
                if (contactStar) contactStar.style.display = 'none';
            } else {
                if (nameInput) {
                    nameInput.value = '';
                    nameInput.readOnly = false;
                    nameInput.style.backgroundColor = '';
                    nameInput.style.color = '';
                    nameInput.required = true;
                }
                if (contactInput) {
                    contactInput.placeholder = 'e.g. 0917-123-4567 or email';
                    contactInput.required = true;
                }
                if (nameStar) nameStar.style.display = 'inline';
                if (contactStar) contactStar.style.display = 'inline';
            }
        });
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();

        const isAnon = anonToggle ? anonToggle.checked : false;
        const name = isAnon ? 'Anonymous Customer' : document.getElementById('inq-name').value.trim();
        const contact = document.getElementById('inq-contact').value.trim() || 'Anonymous (No Contact)';
        const subject = document.getElementById('inq-subject').value;
        const message = document.getElementById('inq-message').value.trim();

        if (!isAnon && !name) {
            showToast('Please provide your name or check Send as Anonymous.', 'error');
            return;
        }
        if (!message) {
            showToast('Please type your message.', 'error');
            return;
        }

        const inquiry = LaundryStore.saveInquiry({
            name: name,
            contact: contact,
            subject: subject,
            message: message,
            isAnonymous: isAnon
        });

        if (typeof AquartCloudSync !== 'undefined') {
            AquartCloudSync.pushInquiry(inquiry);
        }

        LaundryStore.playAudioChime('ready');
        showToast(isAnon 
            ? `Anonymous Inquiry #${inquiry.id} sent! Thank you.` 
            : `Inquiry #${inquiry.id} sent! Our station desk will assist you shortly.`);
        
        form.reset();
        if (anonToggle) {
            anonToggle.checked = false;
            if (nameInput) {
                nameInput.readOnly = false;
                nameInput.style.backgroundColor = '';
                nameInput.style.color = '';
                nameInput.required = true;
            }
            if (contactInput) {
                contactInput.placeholder = 'e.g. 0917-123-4567 or email';
                contactInput.required = true;
            }
            if (nameStar) nameStar.style.display = 'inline';
            if (contactStar) contactStar.style.display = 'inline';
        }
    });
}

/**
 * CUSTOMER SERVICE FEEDBACK MODAL LISTENERS & LOGIC
 */
function initFeedbackModalListeners() {
    const modal = document.getElementById('service-feedback-modal');
    const closeBtn = document.getElementById('btn-close-feedback-modal');
    const closeDoneBtn = document.getElementById('btn-close-feedback-done');
    const form = document.getElementById('customer-rating-form');
    const ratingInput = document.getElementById('feedback-rating-val');
    const ratingLabel = document.getElementById('feedback-rating-label');
    const stars = document.querySelectorAll('#star-rating-selector .star-rating-item');
    const formWrap = document.getElementById('feedback-form-container');
    const thankWrap = document.getElementById('feedback-thankyou-container');

    const labels = {
        1: '1 Star - Needs Improvement',
        2: '2 Stars - Fair Service',
        3: '3 Stars - Satisfactory',
        4: '4 Stars - Very Good & Fresh!',
        5: '5 Stars - Spotless & Excellent!'
    };

    if (closeBtn) closeBtn.addEventListener('click', () => modal?.classList.remove('active'));
    if (closeDoneBtn) closeDoneBtn.addEventListener('click', () => modal?.classList.remove('active'));

    stars.forEach(star => {
        star.addEventListener('click', function () {
            const r = parseInt(this.getAttribute('data-rating'), 10) || 5;
            if (ratingInput) ratingInput.value = r;
            if (ratingLabel) ratingLabel.innerText = labels[r] || `${r} Stars`;

            stars.forEach(s => {
                const sVal = parseInt(s.getAttribute('data-rating'), 10);
                if (sVal <= r) {
                    s.classList.add('active');
                    s.style.color = '#f59e0b';
                } else {
                    s.classList.remove('active');
                    s.style.color = '#cbd5e1';
                }
            });

            if (window.LaundryStore && LaundryStore.playAudioChime) {
                LaundryStore.playAudioChime('tap');
            }
        });
    });

    if (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            const jo = document.getElementById('feedback-modal-jo')?.innerText.trim();
            const order = LaundryStore.getOrderById(jo);
            const rating = parseInt(ratingInput?.value, 10) || 5;
            const comment = document.getElementById('feedback-comment')?.value.trim();

            LaundryStore.saveFeedback({
                orderId: jo,
                customerName: order ? order.customerName : 'Valued Customer',
                customerPhone: order ? order.customerPhone : '',
                serviceName: order ? order.serviceName : 'Laundry Service',
                rating: rating,
                comment: comment
            });

            if (window.LaundryStore && LaundryStore.playAudioChime) {
                LaundryStore.playAudioChime('ready');
            }

            if (formWrap) formWrap.style.display = 'none';
            if (thankWrap) thankWrap.style.display = 'block';

            showToast('Salamat! Your rating & feedback has been submitted.', 'success');
        });
    }
}

/**
 * MOBILE NAVIGATION & TOUCH ERGONOMICS (≤768px)
 */
function initMobileNavOptimization() {
    // Hamburger drawer controls
    const burgerBtn = document.getElementById('mobile-hamburger-btn');
    const drawer = document.getElementById('mobile-nav-drawer');
    const backdrop = document.getElementById('mobile-nav-backdrop');
    const closeDrawerBtn = document.getElementById('mobile-drawer-close');

    function toggleDrawer(open) {
        if (!drawer || !backdrop) return;
        if (open) {
            drawer.classList.add('active');
            backdrop.classList.add('active');
            document.body.style.overflow = 'hidden';
        } else {
            drawer.classList.remove('active');
            backdrop.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    if (burgerBtn) burgerBtn.addEventListener('click', () => toggleDrawer(true));
    if (closeDrawerBtn) closeDrawerBtn.addEventListener('click', () => toggleDrawer(false));
    if (backdrop) backdrop.addEventListener('click', () => toggleDrawer(false));

    // Drawer links navigation
    document.querySelectorAll('.mobile-drawer-link').forEach(link => {
        link.addEventListener('click', function () {
            toggleDrawer(false);
            const nav = this.getAttribute('data-nav');
            if (nav === 'reserve') {
                if (window.switchHeroTab) window.switchHeroTab('reserve');
                document.getElementById('hero-action-card')?.scrollIntoView({ behavior: 'smooth' });
            } else if (nav === 'track') {
                if (window.switchHeroTab) window.switchHeroTab('track');
                slideDownToTracker();
            }
        });
    });

    // Mobile Fixed Bottom Navigation Bar Items
    const bottomNavTrack = document.getElementById('mobile-nav-btn-track');
    const bottomNavReserve = document.getElementById('mobile-nav-btn-reserve');

    if (bottomNavTrack) {
        bottomNavTrack.addEventListener('click', () => {
            bottomNavTrack.classList.add('active');
            bottomNavReserve?.classList.remove('active');
            if (window.switchHeroTab) window.switchHeroTab('track');
            slideDownToTracker();
        });
    }

    if (bottomNavReserve) {
        bottomNavReserve.addEventListener('click', () => {
            bottomNavReserve.classList.add('active');
            bottomNavTrack?.classList.remove('active');
            if (window.switchHeroTab) window.switchHeroTab('reserve');
            document.getElementById('hero-action-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
                document.getElementById('res-name')?.focus();
            }, 300);
        });
    }
}

window.showToast = showToast;
window.renderOrderTracking = renderOrderTracking;
