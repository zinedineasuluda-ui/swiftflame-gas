// ============================================================================
// SwiftFlame Gas • Complete Cloud Storefront Logic (100% Matched to index.html)
// ============================================================================

let stations = {};
let activeBranchSlug = '';
let currentOrderType = 'refill'; // 'refill' or 'new'
let cart = JSON.parse(localStorage.getItem('swiftflame_cart') || '[]');
let currentUser = JSON.parse(localStorage.getItem('swiftflame_current_user') || 'null');
let customerGpsUrl = '';
let activeTrackedOrder = null;
let activeOrderChannel = null;

// Brand pricing & sizes for all 6 brands in #brand-select
const brandCatalogMap = {
    'TotalEnergies': [
        { id: 'total-6', brand: 'TotalEnergies', size: '6kg', refill: 1380, newCyl: 4300, badge: 'Popular • Meko' },
        { id: 'total-13', brand: 'TotalEnergies', size: '13kg', refill: 2900, newCyl: 6900, badge: 'Best Seller' },
        { id: 'total-22', brand: 'TotalEnergies', size: '22.5kg', refill: 4950, newCyl: 10800, badge: 'Hotels / Cafes' },
        { id: 'total-50', brand: 'TotalEnergies', size: '50kg', refill: 10500, newCyl: 19800, badge: 'Commercial' }
    ],
    'K-Gas': [
        { id: 'kgas-6', brand: 'K-Gas', size: '6kg', refill: 1350, newCyl: 4200, badge: 'Popular • Meko' },
        { id: 'kgas-13', brand: 'K-Gas', size: '13kg', refill: 2850, newCyl: 6800, badge: 'Best Seller' },
        { id: 'kgas-22', brand: 'K-Gas', size: '22.5kg', refill: 4850, newCyl: 10500, badge: 'Hotels / Cafes' },
        { id: 'kgas-50', brand: 'K-Gas', size: '50kg', refill: 10400, newCyl: 19500, badge: 'Commercial' }
    ],
    'ProGas': [
        { id: 'progas-6', brand: 'ProGas', size: '6kg', refill: 1340, newCyl: 4100, badge: 'Popular' },
        { id: 'progas-13', brand: 'ProGas', size: '13kg', refill: 2800, newCyl: 6500, badge: 'Best Seller' },
        { id: 'progas-22', brand: 'ProGas', size: '22.5kg', refill: 4800, newCyl: 10200, badge: 'Hotels / Cafes' },
        { id: 'progas-50', brand: 'ProGas', size: '50kg', refill: 10200, newCyl: 19000, badge: 'Commercial' }
    ],
    'Afrigas': [
        { id: 'afrigas-6', brand: 'Afrigas', size: '6kg', refill: 1350, newCyl: 4150, badge: 'Popular' },
        { id: 'afrigas-13', brand: 'Afrigas', size: '13kg', refill: 2820, newCyl: 6600, badge: 'Best Seller' },
        { id: 'afrigas-22', brand: 'Afrigas', size: '22.5kg', refill: 4820, newCyl: 10300, badge: 'Hotels / Cafes' },
        { id: 'afrigas-50', brand: 'Afrigas', size: '50kg', refill: 10300, newCyl: 19200, badge: 'Commercial' }
    ],
    'Rubis Gas': [
        { id: 'rubis-6', brand: 'Rubis Gas', size: '6kg', refill: 1360, newCyl: 4250, badge: 'Popular' },
        { id: 'rubis-13', brand: 'Rubis Gas', size: '13kg', refill: 2880, newCyl: 6750, badge: 'Best Seller' },
        { id: 'rubis-22', brand: 'Rubis Gas', size: '22.5kg', refill: 4900, newCyl: 10600, badge: 'Hotels / Cafes' },
        { id: 'rubis-50', brand: 'Rubis Gas', size: '50kg', refill: 10450, newCyl: 19600, badge: 'Commercial' }
    ],
    'MenGas': [
        { id: 'mengas-6', brand: 'MenGas', size: '6kg', refill: 1320, newCyl: 4000, badge: 'Value' },
        { id: 'mengas-13', brand: 'MenGas', size: '13kg', refill: 2780, newCyl: 6400, badge: 'Best Seller' },
        { id: 'mengas-22', brand: 'MenGas', size: '22.5kg', refill: 4750, newCyl: 10000, badge: 'Hotels / Cafes' },
        { id: 'mengas-50', brand: 'MenGas', size: '50kg', refill: 10100, newCyl: 18800, badge: 'Commercial' }
    ]
};

function getBranchCatalogForBrand(brand) {
    const baseItems = brandCatalogMap[brand] || brandCatalogMap['TotalEnergies'] || [];
    const activeStation = Array.isArray(stations)
        ? stations.find(s => s.slug === activeBranchSlug)
        : (stations && stations[activeBranchSlug]) || Object.values(stations || {}).find(s => s.slug === activeBranchSlug);
    const branchInventory = activeStation?.inventory || [];

    return baseItems.map(item => {
        const invMatch = branchInventory.find(inv =>
            (inv.brand || '').toLowerCase() === brand.toLowerCase() &&
            String(inv.size_kg ? `${Number(inv.size_kg)}kg` : (inv.cylinder_size || '')).toLowerCase() === item.size.toLowerCase()
        );

        if (!invMatch) return item;

        const liveRefill = Number(invMatch.refill_price);
        const liveNewCyl = Number(invMatch.new_cylinder_price ?? invMatch.new_price);

        return {
            ...item,
            refill: liveRefill > 0 ? liveRefill : item.refill,
            newCyl: liveNewCyl > 0 ? liveNewCyl : item.newCyl
        };
    });
}

// ============================================================================
// 1. INITIALIZE CLOUD TENANTS & STATION SWITCHER (changeStation)
// ============================================================================
async function initStorefront() {
    updateAuthUI();
    renderCart();
    renderProducts();

    const brandSelect = document.getElementById('brand-select');
    if (brandSelect) {
        brandSelect.addEventListener('change', renderProducts);
    }

    try {
        if (typeof SwiftFlameDB === 'undefined') return;

        const activeTenants = await SwiftFlameDB.getTenants(true);
        stations = {};

        activeTenants.forEach(function (t) {
            stations[t.slug] = {
                id: t.id,
                slug: t.slug,
                name: t.name,
                whatsapp: t.whatsapp || '254700123456',
                hotline: t.hotline || '0700 123 456',
                mpesaType: t.mpesa_type || 'Buy Goods Till',
                mpesaAccount: t.mpesa_account || '8459201',
                accountName: t.account_name || t.name.toUpperCase(),
                zones: Array.isArray(t.zones) ? t.zones : ['Westlands', 'Kilimani', 'Kileleshwa', 'Lavington']
            };
        });

        const selectIds = ['station-select', 'reg-branch', 'auth-rider-branch'];
        if (activeTenants.length > 0) {
            const optionsHtml = activeTenants.map(function (t) {
                return '<option value="' + t.slug + '">' + t.name + '</option>';
            }).join('');

            selectIds.forEach(function (id) {
                const el = document.getElementById(id);
                if (el) el.innerHTML = optionsHtml;
            });

            const urlSlug = new URLSearchParams(window.location.search).get('station');
            const initialSlug = (urlSlug && stations[urlSlug]) ? urlSlug : activeTenants[0].slug;
            changeStation(initialSlug);
        }
    } catch (err) {
        console.error('Error loading cloud branches:', err);
    }
}

function changeStation(slug) {
    if (!stations[slug]) return;
    activeBranchSlug = slug;
    const s = stations[slug];

    const selectEl = document.getElementById('station-select');
    if (selectEl) selectEl.value = slug;

    const setText = function (id, text) {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    };

    setText('station-banner-name', s.name);
    setText('station-hotline', s.hotline);
    setText('station-hero-pill', '⚡ Active Branch: ' + s.name + ' • Digital Scale Verified');
    setText('order-branch-name', s.name);
    setText('coverage-branch-name', s.name);
    setText('cart-branch-label', 'Dispatching from: ' + s.name + ' (' + s.mpesaType + ': ' + s.mpesaAccount + ')');
    setText('station-manager-label', 'Assigned Dispatch Depot • ' + s.name);

    const callBtn = document.getElementById('station-call-btn');
    if (callBtn) callBtn.href = 'tel:+' + s.whatsapp.replace(/\D/g, '');

    const zonesGrid = document.getElementById('station-zones-grid');
    if (zonesGrid) {
        zonesGrid.innerHTML = s.zones.map(function (z) {
            return '<div class="bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-200 font-semibold flex items-center gap-2">📍 ' + z + '</div>';
        }).join('');
    }
}

// ============================================================================
// 2. ORDER TYPE TOGGLE & PRODUCT GRID (#product-grid)
// ============================================================================
function setOrderType(type) {
    currentOrderType = type === 'new' ? 'new' : 'refill';

    const refillBtn = document.getElementById('btn-refill');
    const newBtn = document.getElementById('btn-new');

    if (refillBtn && newBtn) {
        if (currentOrderType === 'refill') {
            refillBtn.className = 'flex-1 md:flex-none px-5 py-2.5 rounded-lg text-sm font-bold bg-orange-600 text-white transition';
            newBtn.className = 'flex-1 md:flex-none px-5 py-2.5 rounded-lg text-sm font-bold text-slate-600 hover:text-slate-900 transition';
        } else {
            newBtn.className = 'flex-1 md:flex-none px-5 py-2.5 rounded-lg text-sm font-bold bg-orange-600 text-white transition';
            refillBtn.className = 'flex-1 md:flex-none px-5 py-2.5 rounded-lg text-sm font-bold text-slate-600 hover:text-slate-900 transition';
        }
    }

    renderProducts();
}

function renderProducts() {
    const grid = document.getElementById('product-grid');
    if (!grid) return;

    const brandSelect = document.getElementById('brand-select');
    const brand = brandSelect ? brandSelect.value : 'TotalEnergies';
    const items = getBranchCatalogForBrand(brand);
    const typeLabel = currentOrderType === 'refill' ? 'Gas Refill (Swap)' : 'New Complete Cylinder';

    grid.innerHTML = items.map(function (item) {
        const price = currentOrderType === 'refill' ? item.refill : item.newCyl;
        return (
            '<div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:border-orange-500 transition flex flex-col justify-between gap-4">' +
                '<div>' +
                    '<div class="flex justify-between items-center mb-2">' +
                        '<span class="text-xs font-extrabold uppercase text-orange-600">' + item.brand + '</span>' +
                        '<span class="bg-orange-100 text-orange-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full">' + item.badge + '</span>' +
                    '</div>' +
                    '<h3 class="text-2xl font-extrabold text-slate-900">' + item.size + ' Cylinder</h3>' +
                    '<p class="text-xs text-slate-500 mt-1">' + typeLabel + '</p>' +
                    '<div class="mt-4 bg-slate-50 border border-slate-100 rounded-xl p-3">' +
                        '<div class="text-[11px] font-bold uppercase text-slate-400">Price</div>' +
                        '<div class="text-2xl font-extrabold text-slate-900">KES ' + price.toLocaleString() + '</div>' +
                    '</div>' +
                '</div>' +
                '<button onclick="addToCart(\'' + item.brand + '\', \'' + item.size + '\', ' + price + ')" ' +
                    'class="w-full bg-slate-900 hover:bg-orange-600 text-white font-bold py-3 rounded-xl text-sm transition">' +
                    '+ Add to Cart' +
                '</button>' +
            '</div>'
        );
    }).join('');
}

// ============================================================================
// 3. CART DRAWER (#cart-modal), GPS PIN & CHECKOUT
// ============================================================================
function toggleCart(forceOpen) {
    const modal = document.getElementById('cart-modal');
    if (!modal) return;

    const isHidden = modal.classList.contains('hidden');
    const shouldOpen = (forceOpen !== undefined && forceOpen !== null) ? forceOpen : isHidden;

    if (shouldOpen) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } else {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function addToCart(brand, size, price) {
    const typeText = currentOrderType === 'refill' ? 'Refill' : 'New Cylinder';
    const key = brand + '-' + size + '-' + typeText;
    const existing = cart.find(function (c) { return c.key === key; });

    if (existing) {
        existing.qty += 1;
    } else {
        cart.push({
            key: key,
            brand: brand,
            size: size,
            type: typeText,
            price: price,
            qty: 1
        });
    }

    saveCart();
    toggleCart(true);
}

function updateCartQty(key, delta) {
    const idx = cart.findIndex(function (c) { return c.key === key; });
    if (idx === -1) return;

    cart[idx].qty += delta;
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
    saveCart();
}

function saveCart() {
    localStorage.setItem('swiftflame_cart', JSON.stringify(cart));
    renderCart();
}

function renderCart() {
    const totalQty = cart.reduce(function (sum, item) { return sum + item.qty; }, 0);
    const totalAmt = cart.reduce(function (sum, item) { return sum + item.price * item.qty; }, 0);

    const badge = document.getElementById('cart-badge');
    if (badge) badge.innerText = totalQty;

    const totalEl = document.getElementById('cart-total');
    if (totalEl) totalEl.innerText = 'KES ' + totalAmt.toLocaleString();

    const container = document.getElementById('cart-items');
    if (!container) return;

    if (cart.length === 0) {
        container.innerHTML = '<p class="text-center text-slate-400 text-sm py-8">Your gas cart is empty.</p>';
        return;
    }

    container.innerHTML = cart.map(function (item) {
        return (
            '<div class="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-xl p-3">' +
                '<div>' +
                    '<div class="font-bold text-sm text-slate-900">' + item.brand + ' ' + item.size + ' (' + item.type + ')</div>' +
                    '<div class="text-xs text-slate-500">KES ' + item.price.toLocaleString() + ' each</div>' +
                '</div>' +
                '<div class="flex items-center gap-2">' +
                    '<button onclick="updateCartQty(\'' + item.key + '\', -1)" class="w-7 h-7 rounded-lg bg-slate-200 font-bold text-slate-800">-</button>' +
                    '<span class="text-sm font-extrabold w-5 text-center">' + item.qty + '</span>' +
                    '<button onclick="updateCartQty(\'' + item.key + '\', 1)" class="w-7 h-7 rounded-lg bg-slate-900 text-white font-bold">+</button>' +
                '</div>' +
            '</div>'
        );
    }).join('');
}

function getCustomerLocation() {
    const statusEl = document.getElementById('gps-status');
    const btnEl = document.getElementById('gps-btn');

    if (!navigator.geolocation) {
        if (statusEl) statusEl.innerText = 'GPS not supported on this browser.';
        return;
    }

    if (btnEl) btnEl.innerText = '⏳ Pinning GPS Coordinates...';

    navigator.geolocation.getCurrentPosition(
        function (pos) {
            const lat = pos.coords.latitude.toFixed(6);
            const lng = pos.coords.longitude.toFixed(6);
            customerGpsUrl = 'https://www.google.com/maps?q=' + lat + ',' + lng;
            if (btnEl) btnEl.innerText = '✅ Exact Gate GPS Pinned!';
            if (statusEl) statusEl.innerText = 'Pinned: ' + lat + ', ' + lng;
        },
        function () {
            if (btnEl) btnEl.innerText = '📍 Pin My Exact GPS Location';
            if (statusEl) statusEl.innerText = 'Location permission denied. Type your estate & apartment above.';
        }
    );
}

async function placeOrderAndTrack() {
    if (cart.length === 0) return alert('Please add at least one cylinder to your cart first.');

    const station = stations[activeBranchSlug] || Object.values(stations)[0];
    if (!station) return alert('No active gas shop selected. Add a branch in superadmin.html first.');

    const custName = document.getElementById('cust-name').value.trim() || (currentUser && currentUser.full_name) || 'Customer';
    const custAddress = document.getElementById('cust-address').value.trim();
    const paymentMethod = document.getElementById('cust-payment').value;
    const custPhone = (currentUser && currentUser.phone) || prompt('Enter your M-Pesa / Phone Number for delivery updates:') || '';

    if (!custAddress) return alert('Please enter your Estate, Apartment & House Number.');
    if (!custPhone) return alert('Please enter a phone number so our rider can reach you.');

    const totalAmount = cart.reduce(function (sum, item) { return sum + item.price * item.qty; }, 0);
    const summary = cart.map(function (item) { return item.qty + 'x ' + item.size + ' Cylinder (' + item.brand + ' ' + item.type + ')'; }).join(', ');
    const orderId = 'SF-' + Math.floor(1000 + Math.random() * 9000);
    const mapLink = customerGpsUrl || ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(custAddress + ', Nairobi'));

    try {
        const created = await SwiftFlameDB.createOrder({
            id: orderId,
            tenant_id: station.id,
            customer_name: custName,
            customer_phone: custPhone,
            delivery_address: custAddress + ' (' + paymentMethod + ')',
            map_link: mapLink,
            items: cart,
            summary: summary,
            total_amount: totalAmount,
            stage: 1,
            payment_status: 'Unpaid'
        });

        cart = [];
        saveCart();
        toggleCart(false);
        activeTrackedOrder = created;
        updateTrackerSteps(created);

        const trackerSection = document.getElementById('tracker');
        if (trackerSection) trackerSection.scrollIntoView({ behavior: 'smooth' });

        alert('✅ Order #' + orderId + ' Confirmed with ' + station.name + '!\n\nPay KES ' + totalAmount.toLocaleString() + ' on delivery to ' + station.accountName + ' (' + station.mpesaType + ': ' + station.mpesaAccount + ').');
    } catch (err) {
        alert('❌ Failed to place order: ' + err.message);
    }
}

function checkoutWhatsApp() {
    if (cart.length === 0) return alert('Your cart is empty.');
    const station = stations[activeBranchSlug] || Object.values(stations)[0];
    const waNumber = station ? station.whatsapp : '254700123456';
    const custName = document.getElementById('cust-name').value.trim() || 'Customer';
    const custAddress = document.getElementById('cust-address').value.trim() || 'Nairobi';
    const totalAmount = cart.reduce(function (sum, item) { return sum + item.price * item.qty; }, 0);
    const summary = cart.map(function (item) { return item.qty + 'x ' + item.brand + ' ' + item.size + ' (' + item.type + ')'; }).join('\n');

    const msg = encodeURIComponent(
        '🔥 *NEW GAS ORDER*\n' +
        'Branch: ' + (station ? station.name : 'SwiftFlame') + '\n' +
        'Customer: ' + custName + '\n' +
        'Location: ' + custAddress + '\n\n' +
        summary + '\n\n' +
        'Total: KES ' + totalAmount.toLocaleString()
    );
    window.open('https://wa.me/' + waNumber + '?text=' + msg, '_blank');
}

// ============================================================================
// 4. LIVE 4-STEP ORDER TRACKER (#step-1 .. #step-4)
// ============================================================================
async function lookupOrder() {
    const input = document.getElementById('track-input');
    const cleanId = input ? input.value.trim().toUpperCase().replace('#', '') : '';
    if (!cleanId) return alert('Enter an Order ID (e.g. SF-8492) to track.');

    const res = await supabaseClient
        .from('orders')
        .select('*, tenants(name), profiles(full_name, plate_number)')
        .eq('id', cleanId)
        .maybeSingle();

    if (res.error || !res.data) return alert('Order #' + cleanId + ' was not found.');

    activeTrackedOrder = res.data;
    updateTrackerSteps(res.data);

    if (activeOrderChannel) supabaseClient.removeChannel(activeOrderChannel);
    activeOrderChannel = supabaseClient
        .channel('live-track-' + cleanId)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: 'id=eq.' + cleanId }, function () {
            lookupOrder();
        })
        .subscribe();
}

function updateTrackerSteps(order) {
    const stage = order.stage || 1;
    const titleEl = document.getElementById('track-order-title');
    const detailsEl = document.getElementById('track-order-details');
    const riderEl = document.getElementById('station-rider-info');
    const etaEl = document.getElementById('eta-display');

    if (titleEl) titleEl.innerText = 'Order #' + order.id + ' • ' + order.payment_status;
    if (detailsEl) detailsEl.innerText = order.summary + ' • Destination: ' + order.delivery_address;
    if (riderEl) {
        riderEl.innerText = order.profiles
            ? order.profiles.full_name + ' • ' + (order.profiles.plate_number || 'Dispatch Bike') + ' ⭐ 4.9'
            : 'Assigning nearest verified rider...';
    }
    if (etaEl) {
        const etas = ['⏱️ ETA: 25 mins', '⏱️ ETA: 18 mins', '⏱️ ETA: 8 mins', '✅ Delivered'];
        etaEl.innerText = etas[stage - 1] || '⏱️ ETA: 15 mins';
    }

    for (let i = 1; i <= 4; i++) {
        const stepEl = document.getElementById('step-' + i);
        if (!stepEl) continue;

        if (i < stage) {
            stepEl.className = 'border-2 border-green-500 bg-green-50 rounded-xl p-4 text-center transition';
        } else if (i === stage) {
            stepEl.className = 'border-2 border-orange-500 bg-orange-50 rounded-xl p-4 text-center transition';
        } else {
            stepEl.className = 'border-2 border-slate-200 bg-slate-50 opacity-50 rounded-xl p-4 text-center transition';
        }
    }
}

async function advanceStage() {
    if (!activeTrackedOrder) return alert('Track or place an order first.');
    const next = Math.min(4, (activeTrackedOrder.stage || 1) + 1);
    await SwiftFlameDB.updateOrder(activeTrackedOrder.id, { stage: next });
    await lookupOrder();
}

function resetTracker() {
    activeTrackedOrder = null;
    const input = document.getElementById('track-input');
    if (input) input.value = '';
    updateTrackerSteps({
        id: 'SF-8492',
        payment_status: 'Demo Active',
        summary: '1x 13kg Cylinder (TotalEnergies)',
        delivery_address: 'Kilimani, Argwings Kodhek Rd',
        stage: 3
    });
}

// ============================================================================
// 5. SIGN IN / SIGN UP MODAL (#auth-modal)
// ============================================================================
function openAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function switchAuthTab(tab) {
    const signInForm = document.getElementById('signin-form');
    const signUpForm = document.getElementById('signup-form');
    const tabSignIn = document.getElementById('tab-signin');
    const tabSignUp = document.getElementById('tab-signup');

    const isSignIn = tab === 'signin';
    if (signInForm) signInForm.classList.toggle('hidden', !isSignIn);
    if (signUpForm) signUpForm.classList.toggle('hidden', isSignIn);

    if (tabSignIn && tabSignUp) {
        if (isSignIn) {
            tabSignIn.className = 'flex-1 py-2 rounded-lg text-sm font-bold bg-white shadow-sm text-slate-900 transition';
            tabSignUp.className = 'flex-1 py-2 rounded-lg text-sm font-bold text-slate-500 hover:text-slate-900 transition';
        } else {
            tabSignUp.className = 'flex-1 py-2 rounded-lg text-sm font-bold bg-white shadow-sm text-slate-900 transition';
            tabSignIn.className = 'flex-1 py-2 rounded-lg text-sm font-bold text-slate-500 hover:text-slate-900 transition';
        }
    }
}

function toggleBranchField() {
    const role = document.getElementById('reg-role') ? document.getElementById('reg-role').value : 'customer';
    const branchWrapper = document.getElementById('reg-branch-wrapper') || document.getElementById('branch-field');
    if (branchWrapper) {
        branchWrapper.classList.toggle('hidden', role === 'customer');
    }
}

function updateAuthUI() {
    const authBtn = document.getElementById('auth-nav-btn');
    if (currentUser && authBtn) {
        authBtn.innerText = '👤 ' + currentUser.full_name + ' (Sign Out)';
        authBtn.onclick = logoutUser;
    }
}

async function handleSignIn(e) {
    e.preventDefault();
    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value.trim();

    if (!identifier || !password) return alert('Enter your phone number and password.');

    try {
        const user = await SwiftFlameDB.loginUser(identifier, password);
        if (!user) return alert('Invalid phone number or password.');

        if (user.tenants && user.tenants.is_active === false) {
            return alert('Subscription Suspended: ' + user.tenants.name + ' is inactive.');
        }
        if (user.role === 'rider' && !user.is_approved) {
            return alert('Pending Approval: Ask your Station Manager to approve your rider account in admin.html first.');
        }

        localStorage.setItem('swiftflame_current_user', JSON.stringify(user));
        currentUser = user;

        if (user.role === 'manager') window.location.href = 'admin.html';
        else if (user.role === 'rider') window.location.href = 'rider.html';
        else {
            closeAuthModal();
            updateAuthUI();
            alert('Welcome back, ' + user.full_name + '!');
        }
    } catch (err) {
        alert('Sign-in failed: ' + err.message);
    }
}

async function handleSignUp(e) {
    e.preventDefault();
    const role = document.getElementById('reg-role') ? document.getElementById('reg-role').value : 'customer';
    const fullName = document.getElementById('reg-name') ? document.getElementById('reg-name').value.trim() : '';
    const phone = document.getElementById('reg-phone') ? document.getElementById('reg-phone').value.trim() : '';
    const password = document.getElementById('reg-password') ? document.getElementById('reg-password').value.trim() : '';
    const plateNumber = document.getElementById('reg-plate') ? document.getElementById('reg-plate').value.trim() : null;
    const branchSlug = (document.getElementById('reg-branch') && document.getElementById('reg-branch').value) || activeBranchSlug;

    if (!fullName || !phone || !password) return alert('Please fill in all fields.');

    try {
        const tenantId = (role !== 'customer' && stations[branchSlug]) ? stations[branchSlug].id : null;
        const newUser = await SwiftFlameDB.registerUser({
            tenantId: tenantId,
            fullName: fullName,
            phone: phone,
            password: password,
            role: role,
            plateNumber: plateNumber
        });

        if (role !== 'customer') {
            closeAuthModal();
            alert('✅ Registration submitted! Ask your Station Manager / Super Admin to approve your account.');
        } else {
            localStorage.setItem('swiftflame_current_user', JSON.stringify(newUser));
            currentUser = newUser;
            closeAuthModal();
            updateAuthUI();
            alert('✅ Account created! Welcome, ' + fullName + '.');
        }
    } catch (err) {
        alert('Sign-up failed: ' + err.message);
    }
}

function logoutUser() {
    localStorage.removeItem('swiftflame_current_user');
    currentUser = null;
    window.location.reload();
}

document.addEventListener('DOMContentLoaded', initStorefront);