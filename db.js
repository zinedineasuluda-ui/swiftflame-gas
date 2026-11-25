// db.js — Shared Multi-Tenant Cloud Layer for SwiftFlame SaaS
const SUPABASE_URL = 'https://sfdkqiiounxmfdvvctsz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_yQX82G2MNlAMtpyDwdq_5A_4tKHoo6v';


const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SwiftFlameDB = {
    // 1. Fetch all tenants (Super Admin) or only active tenants (Storefront)
    async getTenants(onlyActive = false) {
        let query = supabaseClient.from('tenants').select('*').order('created_at', { ascending: false });
        if (onlyActive) query = query.eq('is_active', true);
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    // 2. Super Admin: Onboard a new Nairobi gas shop + Station Manager + default inventory
    async onboardTenant(shopPayload, managerPayload) {
        const { data: tenant, error: tErr } = await supabaseClient
            .from('tenants')
            .insert([shopPayload])
            .select()
            .single();
        if (tErr) throw tErr;

        const { error: mErr } = await supabaseClient
            .from('profiles')
            .insert([{
                tenant_id: tenant.id,
                full_name: managerPayload.name,
                phone: managerPayload.phone,
                password_hash: managerPayload.password || '1234',
                role: 'manager',
                is_approved: true
            }]);
        if (mErr) throw mErr;

        const defaultBrands = [
            { brand: 'K-Gas', size_kg: 6, full_stock: 20, empty_stock: 5, refill_price: 1350, new_cylinder_price: 4200 },
            { brand: 'K-Gas', size_kg: 13, full_stock: 25, empty_stock: 8, refill_price: 2850, new_cylinder_price: 6800 },
            { brand: 'Total', size_kg: 13, full_stock: 20, empty_stock: 6, refill_price: 2900, new_cylinder_price: 6900 },
            { brand: 'ProGas', size_kg: 13, full_stock: 18, empty_stock: 4, refill_price: 2800, new_cylinder_price: 6500 }
        ].map(item => ({ ...item, tenant_id: tenant.id }));

        await supabaseClient.from('inventory').insert(defaultBrands);
        return tenant;
    },

    // 3. Super Admin: Suspend or Activate a shop's SaaS license
    async setTenantStatus(tenantId, isActive) {
        const { error } = await supabaseClient
            .from('tenants')
            .update({ is_active: isActive })
            .eq('id', tenantId);
        if (error) throw error;
    },

    // 4. Auth: Register a Customer or Rider (Riders start with is_approved = false)
    async registerUser({ tenantId, fullName, phone, password, role, plateNumber }) {
        const { data, error } = await supabaseClient
            .from('profiles')
            .insert([{
                tenant_id: tenantId || null,
                full_name: fullName,
                phone,
                password_hash: password,
                role,
                plate_number: plateNumber || null,
                is_approved: role === 'customer'
            }])
            .select('*, tenants(id, name, slug, is_active, mpesa_type, mpesa_account, account_name)')
            .single();
        if (error) throw error;
        return data;
    },

    // 5. Auth: Sign In Manager, Rider, or Customer from Cloud DB
    async loginUser(phone, password) {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*, tenants(id, name, slug, is_active, mpesa_type, mpesa_account, account_name)')
            .eq('phone', phone)
            .eq('password_hash', password)
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    // 6. Manager: Fetch & Approve/Revoke Branch Riders
    async getBranchRiders(tenantId) {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('role', 'rider')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async setRiderApproval(riderId, isApproved) {
        const { error } = await supabaseClient
            .from('profiles')
            .update({ is_approved: isApproved })
            .eq('id', riderId);
        if (error) throw error;
    },

    // 7. Orders: Create, Fetch, Update Stage/Rider/M-Pesa Payment
    async createOrder(orderPayload) {
        const { data, error } = await supabaseClient
            .from('orders')
            .insert([orderPayload])
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async getOrders(tenantId = null) {
        let query = supabaseClient
            .from('orders')
            .select('*, profiles(id, full_name, plate_number)')
            .order('created_at', { ascending: false });
        if (tenantId) query = query.eq('tenant_id', tenantId);
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    async updateOrder(orderId, updates) {
        const { data, error } = await supabaseClient
            .from('orders')
            .update(updates)
            .eq('id', orderId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // 8. Real-Time WebSocket Subscription for Live Orders
    subscribeToBranchOrders(tenantId, onChangeCallback) {
        return supabaseClient
            .channel(`branch-orders-${tenantId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
                (payload) => onChangeCallback(payload)
            )
            .subscribe();
    }
};