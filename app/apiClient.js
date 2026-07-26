// =====================================================================
//  apiClient.js — pengganti @supabase/supabase-js, backend Node/Express sendiri
// =====================================================================
// app.js TIDAK DIUBAH SAMA SEKALI dari versi Supabase — file ini cuma
// menyediakan global `supabase.createClient(...)` yang mengembalikan objek
// tiruan (shim) dengan permukaan `.auth.*` dan `.from(table)...` yang sama
// persis dipanggil app.js (chainable, thenable seperti query builder
// supabase-js asli). Setiap chain diterjemahkan ke satu panggilan fetch ke
// backend Express (lihat elio-hpp-aapanel/backend/src/routes/*.ts).
//
// Konsekuensi dari pendekatan ini: kalau nanti app.js dapat query baru yang
// belum ada di TABLES di bawah, itu akan gagal diam-diam (lihat fallback di
// execute()) — bukan generic query proxy. Sengaja begitu: permukaan yang
// didukung sudah dipetakan lengkap dari app.js versi saat ini (lihat
// STATUS_MIGRASI.md), bukan ditebak.

(function () {
  const BASE = (typeof API_BASE_URL !== "undefined" && API_BASE_URL) || "";
  const TOKEN_KEY = "hpp_token";

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
  }
  function setToken(t) {
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  // ---- transformasi kunci: app.js (dan skema Postgres lama) pakai
  // snake_case di semua tempat; backend baru (Prisma) pakai camelCase.
  // Konversi generik berdasar aturan huruf, BUKAN daftar field per tabel —
  // aman karena setiap @map() di schema.prisma memetakan camelCase ke
  // snake_case dengan kata yang sama persis (lihat backend/prisma/schema.prisma).
  function toCamel(s) { return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase()); }
  function toSnake(s) { return s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()); }
  function mapKeysDeep(val, fn) {
    if (Array.isArray(val)) return val.map((v) => mapKeysDeep(v, fn));
    if (val && typeof val === "object") {
      const out = {};
      for (const k in val) out[fn(k)] = mapKeysDeep(val[k], fn);
      return out;
    }
    return val;
  }
  // Prisma Decimal ter-serialize sebagai string ("123.45") lewat res.json() —
  // beberapa titik di app.js manggil .toFixed()/aritmetika langsung tanpa
  // Number() (mis. kondimen hpp_per_satuan). String angka murni diubah balik
  // ke Number di sini supaya app.js tidak perlu tahu bedanya. Regex ketat
  // (cuma digit/minus/titik) supaya id (UUID) & timestamp ISO tidak kesenggol.
  const NUMERIC_RE = /^-?\d+(\.\d+)?$/;
  function numifyDeep(val) {
    if (Array.isArray(val)) return val.map(numifyDeep);
    if (val && typeof val === "object") {
      const out = {};
      for (const k in val) {
        const v = val[k];
        out[k] = typeof v === "string" && NUMERIC_RE.test(v) ? Number(v) : numifyDeep(v);
      }
      return out;
    }
    return val;
  }

  async function apiFetch(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    const token = getToken();
    if (token) headers.Authorization = "Bearer " + token;

    let res;
    try {
      res = await fetch(BASE + path, Object.assign({}, opts, { headers }));
    } catch (e) {
      return { data: null, error: { message: "Gagal terhubung ke server." } };
    }
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    if (!res.ok) {
      return { data: null, error: { message: (body && body.error) || ("Error " + res.status) } };
    }
    return { data: body == null ? body : numifyDeep(mapKeysDeep(body, toSnake)), error: null };
  }

  function toBackendBody(row) {
    return JSON.stringify(mapKeysDeep(row, toCamel));
  }

  // ---------------------------------------------------------------------
  //  Query builder shim
  // ---------------------------------------------------------------------
  function from(table) {
    const state = { table, method: "select", filters: [], inFilters: [], body: null, limitN: null };

    const builder = {
      select() { return builder; },
      order() { return builder; },
      single() { return builder; },
      maybeSingle() { return builder; },
      limit(n) { state.limitN = n; return builder; },
      eq(col, val) { state.filters.push([col, val]); return builder; },
      in(col, vals) { state.inFilters.push([col, vals]); return builder; },
      insert(rows) { state.method = "insert"; state.body = rows; return builder; },
      update(patch) { state.method = "update"; state.body = patch; return builder; },
      upsert(row) { state.method = "upsert"; state.body = row; return builder; },
      delete() { state.method = "delete"; return builder; },
      then(onFulfilled, onRejected) { return execute(state).then(onFulfilled, onRejected); }
    };
    return builder;
  }

  function eqVal(state, col) {
    const f = state.filters.find((x) => x[0] === col);
    return f ? f[1] : undefined;
  }
  function inVal(state, col) {
    const f = state.inFilters.find((x) => x[0] === col);
    return f ? f[1] : [];
  }

  // ---- Tabel milik HPP sendiri: CRUD sederhana lewat backend Express ----
  function simpleTable(resourcePath) {
    return async (state) => {
      if (state.method === "select") return apiFetch(resourcePath);
      if (state.method === "insert") return apiFetch(resourcePath, { method: "POST", body: toBackendBody(state.body) });
      throw new Error(`${resourcePath}: operasi ${state.method} tidak didukung`);
    };
  }

  // ---- produk, kategori_produk, cabang_hpp, kondimen: insert/update/soft-delete ----
  function crudTable(resourcePath, deleteBodyMatches) {
    return async (state) => {
      if (state.method === "select") return apiFetch(resourcePath);
      if (state.method === "insert") return apiFetch(resourcePath, { method: "POST", body: toBackendBody(state.body) });
      if (state.method === "update") {
        const id = eqVal(state, "id");
        if (deleteBodyMatches(state.body)) return apiFetch(`${resourcePath}/${id}`, { method: "DELETE" });
        return apiFetch(`${resourcePath}/${id}`, { method: "PUT", body: toBackendBody(state.body) });
      }
      throw new Error(`${resourcePath}: operasi ${state.method} tidak didukung`);
    };
  }

  // ---- resep_bahan / biaya_operasional_produk: baca per-produk (tunggal
  // atau bulk via .in()), delete+insert selalu lewat /replace (aman dipanggil
  // dua kali berurutan — lihat catatan di STATUS_MIGRASI.md soal kenapa) ----
  function childOfProdukTable(resourcePath) {
    return async (state) => {
      if (state.method === "select") {
        const single = eqVal(state, "produk_id");
        if (single !== undefined) return apiFetch(`${resourcePath}?produkId=${encodeURIComponent(single)}`);
        const bulk = inVal(state, "produk_id");
        return apiFetch(`${resourcePath}?produkIds=${bulk.map(encodeURIComponent).join(",")}`);
      }
      if (state.method === "delete") {
        const produkId = eqVal(state, "produk_id");
        return apiFetch(`${resourcePath}/replace`, { method: "POST", body: toBackendBody({ produk_id: produkId, rows: [] }) });
      }
      if (state.method === "insert") {
        const rows = state.body;
        const produkId = rows[0] && rows[0].produk_id;
        return apiFetch(`${resourcePath}/replace`, { method: "POST", body: toBackendBody({ produk_id: produkId, rows }) });
      }
      throw new Error(`${resourcePath}: operasi ${state.method} tidak didukung`);
    };
  }

  async function handleHargaAcuan(state) {
    if (state.method !== "select") throw new Error("harga_acuan_material: read-only");
    const { data, error } = await apiFetch("/api/harga-acuan-material");
    if (error) return { data: null, error };
    return { data: data.rows, error: null };
  }

  async function handleMaterialKonversi(state) {
    if (state.method === "select") return apiFetch("/api/material-konversi");
    if (state.method === "upsert") return apiFetch("/api/material-konversi", { method: "POST", body: toBackendBody(state.body) });
    throw new Error(`material_konversi: operasi ${state.method} tidak didukung`);
  }

  async function handleProdukLog(state) {
    if (state.method === "select") {
      const limit = state.limitN || 100;
      return apiFetch(`/api/produk-log?limit=${limit}`);
    }
    if (state.method === "insert") return apiFetch("/api/produk-log", { method: "POST", body: toBackendBody(state.body) });
    throw new Error(`produk_log: operasi ${state.method} tidak didukung`);
  }

  async function handleKondimenBahan(state) {
    const kondimenId = eqVal(state, "kondimen_id");
    if (state.method === "select") return apiFetch(`/api/kondimen/${encodeURIComponent(kondimenId)}/bahan`);
    if (state.method === "delete") {
      return apiFetch(`/api/kondimen/${encodeURIComponent(kondimenId)}/bahan/replace`, { method: "POST", body: toBackendBody({ rows: [] }) });
    }
    if (state.method === "insert") {
      const rows = state.body;
      const kid = rows[0] && rows[0].kondimen_id;
      return apiFetch(`/api/kondimen/${encodeURIComponent(kid)}/bahan/replace`, { method: "POST", body: toBackendBody({ rows }) });
    }
    throw new Error(`kondimen_bahan: operasi ${state.method} tidak didukung`);
  }

  const TABLES = {
    kondimen: crudTable("/api/kondimen", (body) => body && body.is_deleted === true),
    kategori_produk: crudTable("/api/kategori-produk", (body) => body && body.is_deleted === true),
    cabang_hpp: crudTable("/api/cabang-hpp", (body) => body && body.aktif === false),
    produk: crudTable("/api/produk", (body) => body && body.is_deleted === true),
    resep_bahan: childOfProdukTable("/api/resep-bahan"),
    biaya_operasional_produk: childOfProdukTable("/api/biaya-operasional-produk"),
    produk_hpp_history: simpleTable("/api/produk-hpp-history"),
    material_manual: simpleTable("/api/material-manual"),
    material_konversi: { execute: handleMaterialKonversi },
    harga_acuan_material: { execute: handleHargaAcuan },
    produk_log: { execute: handleProdukLog },
    kondimen_bahan: { execute: handleKondimenBahan }
  };

  async function execute(state) {
    const entry = TABLES[state.table];
    if (!entry) return { data: null, error: { message: `Tabel "${state.table}" belum didukung apiClient.js` } };
    const fn = typeof entry === "function" ? entry : entry.execute;
    try {
      return await fn(state);
    } catch (e) {
      return { data: null, error: { message: e.message || String(e) } };
    }
  }

  // ---------------------------------------------------------------------
  //  Auth shim — PIN bersama, bukan Supabase Auth (lihat backend/src/lib/auth.ts)
  // ---------------------------------------------------------------------
  const auth = {
    async signInWithPassword({ password }) {
      const { data, error } = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ pin: password })
      });
      if (error || !data || !data.token) return { data: null, error: error || { message: "Login gagal." } };
      setToken(data.token);
      return { data: { session: { user: { email: HPP_ACCOUNT_EMAIL } } }, error: null };
    },
    async getSession() {
      if (!getToken()) return { data: { session: null } };
      const { error } = await apiFetch("/api/auth/me");
      if (error) { setToken(null); return { data: { session: null } }; }
      return { data: { session: { user: { email: HPP_ACCOUNT_EMAIL } } } };
    },
    async signOut() {
      setToken(null);
      return { error: null };
    }
  };

  window.supabase = {
    createClient() {
      return { auth, from };
    }
  };
})();
