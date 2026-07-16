// ============================================================
// Supabase-Dexie Compatibility Layer
// Replaces Dexie.js with Supabase cloud database
// ============================================================
const SUPABASE_URL = 'https://hdpdxsrqmsqmaypqngmv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_abJACn7svfWHkZ3Tc1tpHg_drI94t3f';

// Lazy Supabase client - only created when first needed
let _supabaseClient = null;
function getSupabase() {
    if (!_supabaseClient) {
        if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
            console.error('[SUPABASE] Supabase JS SDK not loaded! Check your internet connection.');
            alert('Supabase JS SDK not loaded. Please check your internet connection and refresh.');
            throw new Error('Supabase JS SDK not available');
        }
        _supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('[SUPABASE] Client initialized successfully');
    }
    return _supabaseClient;
}

class DexieQueryBuilder {
    constructor(tableName, key, isReverse = false) {
        this.tableName = tableName;
        this.key = key;
        this.isReverse = isReverse;
        this.filters = [];
        this._buildQuery();
    }

    _buildQuery() {
        this.query = getSupabase().from(this.tableName).select('*');
        if (this.isReverse) {
            this.query = this.query.order(this.key || 'id', { ascending: false });
        }
    }

    equals(val) {
        if (this.key) {
            this.query = this.query.eq(this.key, val);
        }
        return this;
    }

    above(val) {
        if (this.key) {
            this.query = this.query.gt(this.key, val);
        }
        return this;
    }

    below(val) {
        if (this.key) {
            this.query = this.query.lt(this.key, val);
        }
        return this;
    }

    between(start, end, includeStart = true, includeEnd = true) {
        if (this.key) {
            if (includeStart) this.query = this.query.gte(this.key, start);
            else this.query = this.query.gt(this.key, start);
            
            if (includeEnd) this.query = this.query.lte(this.key, end);
            else this.query = this.query.lt(this.key, end);
        }
        return this;
    }

    startsWithIgnoreCase(val) {
        if (this.key) {
            this.query = this.query.ilike(this.key, `${val}%`);
        }
        return this;
    }

    and(fn) {
        if (typeof fn === 'function') {
            this.filters.push(fn);
        }
        return this;
    }

    filter(fn) {
        return this.and(fn);
    }

    or(key) {
        return this;
    }

    async _exec() {
        const { data, error } = await this.query;
        if (error) { console.error(`Supabase query error (${this.tableName}):`, error); return []; }
        let list = data || [];
        if (this.tableName === 'settings') {
            list = list.map(item => {
                if (item && item.value_json) {
                    try { item.value = JSON.parse(item.value_json); } catch(e){}
                }
                return item;
            });
        }
        if (this.filters.length > 0) {
            list = list.filter(item => {
                return this.filters.every(fn => {
                    try { return fn(item); } catch(e) { return false; }
                });
            });
        }
        return list;
    }

    async toArray() {
        return await this._exec();
    }

    async first() {
        const list = await this._exec();
        return list[0] || undefined;
    }

    async count() {
        const list = await this._exec();
        return list.length;
    }

    async modify(changesOrFn) {
        const list = await this._exec();
        const pk = this.tableName === 'settings' ? 'key' : 'id';
        for (let item of list) {
            if (typeof changesOrFn === 'function') {
                changesOrFn(item);
                await getSupabase().from(this.tableName).update(item).eq(pk, item[pk]);
            } else if (typeof changesOrFn === 'object') {
                await getSupabase().from(this.tableName).update(changesOrFn).eq(pk, item[pk]);
            }
        }
        return list.length;
    }

    async delete() {
        const list = await this._exec();
        const pk = this.tableName === 'settings' ? 'key' : 'id';
        for (let item of list) {
            await getSupabase().from(this.tableName).delete().eq(pk, item[pk]);
        }
        return list.length;
    }

    reverse() {
        this.isReverse = true;
        this.query = this.query.order(this.key || 'id', { ascending: false });
        return this;
    }
}

class DexieTable {
    constructor(tableName) {
        this.tableName = tableName;
    }
    
    getPk() {
        return this.tableName === 'settings' ? 'key' : 'id';
    }

    async add(item) {
        if (!item) return;
        const pk = this.getPk();
        if (item.id === undefined) delete item.id;
        
        let payload = { ...item };
        if (this.tableName === 'settings') {
            if (payload.key === 'journalHandle') return;
            if (payload.value !== undefined) {
                payload.value_json = JSON.stringify(payload.value);
                delete payload.value;
            }
        }
        
        const { data, error } = await getSupabase().from(this.tableName).insert(payload).select();
        if (error) { 
            console.error(`Error adding to ${this.tableName}:`, error); 
            alert(`Database Error (Adding to ${this.tableName}): ${error.message}\n\nHint: Check if RLS is disabled on this table in Supabase.`);
            throw error; 
        }
        return data?.[0]?.[pk];
    }
    
    async put(item) {
        if (!item) return;
        const pk = this.getPk();
        
        let payload = { ...item };
        if (this.tableName === 'settings') {
            if (payload.key === 'journalHandle') return;
            if (payload.value !== undefined) {
                payload.value_json = JSON.stringify(payload.value);
                delete payload.value;
            }
        }

        const { data, error } = await getSupabase().from(this.tableName).upsert(payload).select();
        if (error) { console.error(`Error putting in ${this.tableName}:`, error); throw error; }
        return data?.[0]?.[pk];
    }
    
    async update(id, changes) {
        if (!id) return 0;
        const pk = this.getPk();
        const { data, error } = await getSupabase().from(this.tableName).update(changes).eq(pk, id).select();
        if (error) { console.error(`Error updating ${this.tableName}:`, error); throw error; }
        return data ? data.length : 0;
    }
    
    async delete(id) {
        if (!id) return;
        const pk = this.getPk();
        const { error } = await getSupabase().from(this.tableName).delete().eq(pk, id);
        if (error) { console.error(`Error deleting from ${this.tableName}:`, error); throw error; }
    }
    
    async clear() {
        const pk = this.getPk();
        const { error } = await getSupabase().from(this.tableName).delete().neq(pk, '00000000-0000-0000-0000-000000000000');
        if (error) { console.error(`Error clearing ${this.tableName}:`, error); throw error; }
    }
    
    async count() {
        const { count, error } = await getSupabase().from(this.tableName).select('*', { count: 'exact', head: true });
        if (error) { console.error(`Error counting ${this.tableName}:`, error); return 0; }
        return count;
    }
    
    async get(id) {
        if (typeof id === 'object') {
            let q = getSupabase().from(this.tableName).select('*');
            for (let k in id) q = q.eq(k, id[k]);
            const { data, error } = await q.maybeSingle();
            if (error) { console.error(`Error getting from ${this.tableName}:`, error); return undefined; }
            if (data && this.tableName === 'settings' && data.value_json) {
                try { data.value = JSON.parse(data.value_json); } catch(e){}
            }
            return data || undefined;
        }
        const pk = this.getPk();
        const { data, error } = await getSupabase().from(this.tableName).select('*').eq(pk, id).maybeSingle();
        if (error) { console.error(`Error getting from ${this.tableName}:`, error); return undefined; }
        if (data && this.tableName === 'settings' && data.value_json) {
            try { data.value = JSON.parse(data.value_json); } catch(e){}
        }
        return data || undefined;
    }
    
    async toArray() {
        const { data, error } = await getSupabase().from(this.tableName).select('*').limit(10000);
        if (error) { console.error(`Error toArray ${this.tableName}:`, error); return []; }
        return data || [];
    }
    
    async bulkAdd(items) {
        if (!items || items.length === 0) return;
        items.forEach(i => { if (i.id === undefined) delete i.id; });
        const { error } = await getSupabase().from(this.tableName).insert(items);
        if (error) { console.error(`Error bulkAdd ${this.tableName}:`, error); throw error; }
    }
    
    async bulkPut(items) {
        if (!items || items.length === 0) return;
        const { error } = await getSupabase().from(this.tableName).upsert(items);
        if (error) { console.error(`Error bulkPut ${this.tableName}:`, error); throw error; }
    }
    
    filter(fn) {
        const builder = new DexieQueryBuilder(this.tableName, null);
        return builder.filter(fn);
    }

    where(keyOrObj) {
        if (typeof keyOrObj === 'object' && keyOrObj !== null) {
            const builder = new DexieQueryBuilder(this.tableName, null);
            for (let k in keyOrObj) {
                builder.query = builder.query.eq(k, keyOrObj[k]);
            }
            return builder;
        }
        return new DexieQueryBuilder(this.tableName, keyOrObj);
    }
    
    orderBy(key) {
        const builder = new DexieQueryBuilder(this.tableName, key);
        builder.query = builder.query.order(key || 'id', { ascending: true });
        return builder;
    }
    
    reverse() {
        return new DexieQueryBuilder(this.tableName, null, true);
    }
}

// ============================================================
// SupabaseDexieWrapper - drop-in replacement for Dexie class
// ============================================================
class SupabaseDexieWrapper {
    constructor(dbName) {
        this.name = dbName;
        console.log('[SUPABASE] Creating DB wrapper for:', dbName);
        const tables = [
            { prop: 'inventory', table: 'inventory' },
            { prop: 'sales', table: 'sales' },
            { prop: 'services', table: 'services' },
            { prop: 'sessions', table: 'sessions' },
            { prop: 'dailyReports', table: 'daily_reports' },
            { prop: 'customers', table: 'customers' },
            { prop: 'users', table: 'users' },
            { prop: 'journal', table: 'journal' },
            { prop: 'grns', table: 'grns' },
            { prop: 'expenses', table: 'expenses' },
            { prop: 'settings', table: 'settings' },
            { prop: 'vehicles', table: 'vehicles' },
            { prop: 'suppliers', table: 'suppliers' }
        ];
        for (let t of tables) {
            this[t.prop] = new DexieTable(t.table);
        }
    }
    
    version(v) {
        return this;
    }
    
    stores(schema) {
        return this;
    }
    
    async transaction(mode, ...args) {
        const cb = args.pop();
        return await cb();
    }
}

// Override Dexie IMMEDIATELY (no async operations here!)
window.Dexie = SupabaseDexieWrapper;
console.log('[SUPABASE] Dexie override installed. All db operations will go to Supabase.');
