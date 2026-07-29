// =====================================================================
//  HPP ELIO — APP LOGIC (terhubung Supabase: Elio Cashier)
// =====================================================================

const $ = (s, r = document) => r.querySelector(s);
const $all = (s, r = document) => Array.from(r.querySelectorAll(s));
function esc(s){ const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; }
function toast(msg){
  const el = $("#toast"); el.textContent = msg; el.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("show"), 2200);
}
function rp(n){ return "Rp " + Math.round(n || 0).toLocaleString("id-ID"); }

function infoTanggal(tgl){
  if (!tgl) return { teks: "tanggal tidak diketahui", lama: false };
  const d = new Date(tgl);
  if (isNaN(d)) return { teks: "tanggal tidak diketahui", lama: false };
  const bulan = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  const teks = d.getDate() + " " + bulan[d.getMonth()] + " " + d.getFullYear();
  const selisihHari = Math.floor((Date.now() - d.getTime()) / 86400000);
  return { teks, lama: selisihHari > 30, hari: selisihHari };
}

if (typeof supabase === "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    document.body.innerHTML = '<div style="max-width:420px;margin:80px auto;padding:30px;text-align:center;color:#1B211C;"><h2>Gagal memuat aplikasi</h2><p style="color:#5F665F;font-size:14px;line-height:1.6;margin-top:8px;">Pustaka Supabase tidak bisa dimuat. Periksa koneksi internet lalu muat ulang.</p></div>';
  });
  throw new Error("Supabase library not loaded");
}

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let hargaAcuan = [];
let konversiMap = {};
let manualList = [];
let produkList = [];
let kategoriList = [];   // {id, nama, parent_id, level}
let cabangList = [];      // {id, nama, aktif}
let editingProdukId = null;

// ---------------------------------------------------------------------
//  AUTH — PIN keypad
// ---------------------------------------------------------------------
let pinBuffer = "";

async function checkSession(){
  const { data } = await sb.auth.getSession();
  if (data.session){ currentUser = data.session.user; showMenu(); }
  else showLogin();
}
function showLogin(){
  $("#loginScreen").classList.remove("hidden");
  $("#menuScreen").classList.add("hidden");
  $("#appScreen").classList.add("hidden");
  pinBuffer = ""; renderPinDots();
}
function showMenu(){
  $("#loginScreen").classList.add("hidden");
  $("#appScreen").classList.add("hidden");
  $("#menuScreen").classList.remove("hidden");
  const email = currentUser?.email || "—";
  const label = email.split("@")[0];
  $("#userEmailM").textContent = label;
  $("#userAvatarM").textContent = label.charAt(0).toUpperCase();
}
function showApp(){
  $("#loginScreen").classList.add("hidden");
  $("#menuScreen").classList.add("hidden");
  $("#appScreen").classList.remove("hidden");
  const email = currentUser?.email || "—";
  const label = email.split("@")[0];
  $("#userEmail").textContent = label;
  $("#userAvatar").textContent = label.charAt(0).toUpperCase();
}
// Router menu
document.addEventListener("DOMContentLoaded", () => {
  const bind = (id, fn) => { const el = $(id); if (el) el.addEventListener("click", fn); };
  bind("#menuFnb", () => { showApp(); $("#appTitle").textContent = "HPP Elio — FNB"; $("#fnbSection").classList.remove("hidden"); $("#jasaSection").classList.add("hidden"); switchTab("list"); bootData(); });
  bind("#menuJasa", () => { showApp(); $("#appTitle").textContent = "HPP Elio — Jasa"; $("#fnbSection").classList.add("hidden"); $("#jasaSection").classList.remove("hidden"); });
  bind("#backMenu", () => showMenu());
  bind("#logoutBtnM", async () => { await sb.auth.signOut(); currentUser = null; showLogin(); });
  bind("#themeToggle", toggleTheme);
});

// ---------- DARK MODE ----------
function terapkanTheme(t){
  document.documentElement.setAttribute("data-theme", t);
  const btn = $("#themeToggle");
  if (btn){
    btn.innerHTML = t === "dark"
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>';
  }
}
function toggleTheme(){
  const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  try{ localStorage.setItem("hpp_theme", cur); }catch(e){}
  terapkanTheme(cur);
}
(function initTheme(){
  let t = "light";
  try{ t = localStorage.getItem("hpp_theme") || "light"; }catch(e){}
  terapkanTheme(t);
})();
function renderPinDots(err){
  $all(".pin-dot").forEach((d, i) => {
    d.classList.toggle("filled", i < pinBuffer.length);
    d.classList.toggle("error", !!err);
  });
}
async function submitPin(){
  const pin = pinBuffer;
  $("#loginErr").textContent = "";
  try{
    const { error } = await sb.auth.signInWithPassword({ email: HPP_ACCOUNT_EMAIL, password: pin });
    if (error){
      renderPinDots(true);
      $("#loginErr").textContent = "PIN salah. Coba lagi.";
      setTimeout(() => { pinBuffer = ""; renderPinDots(); }, 500);
      return;
    }
    const { data } = await sb.auth.getSession();
    currentUser = data.session.user; showMenu();
  }catch(e){
    $("#loginErr").textContent = "Gagal terhubung. Periksa internet.";
  }
}
$("#keypad").addEventListener("click", (e) => {
  const k = e.target.closest(".key")?.dataset.k; if (!k) return;
  if (k === "clear"){ pinBuffer = ""; renderPinDots(); return; }
  if (k === "back"){ pinBuffer = pinBuffer.slice(0, -1); renderPinDots(); return; }
  if (pinBuffer.length < 4){ pinBuffer += k; renderPinDots(); if (pinBuffer.length === 4) setTimeout(submitPin, 150); }
});
$("#logoutBtn").addEventListener("click", async () => { await sb.auth.signOut(); currentUser = null; showLogin(); });

// ---------------------------------------------------------------------
//  DATA BOOT — ambil harga acuan, konversi, manual, produk
// ---------------------------------------------------------------------
async function bootData(){
  tampilkanSkeleton();
  await Promise.all([loadHargaAcuan(), loadKonversi(), loadManual(), loadKategori(), loadCabang(), loadKondimen()]);
  await loadProduk();
}
function tampilkanSkeleton(){
  const el = $("#prodList");
  if (!el) return;
  let s = "";
  for (let i = 0; i < 5; i++){
    s += `<div class="skel-card">
      <div class="skel skel-line" style="width:${40 + Math.random()*30}%"></div>
      <div class="skel skel-line" style="width:${55 + Math.random()*25}%;height:10px;"></div>
    </div>`;
  }
  el.innerHTML = s;
  const sbar = $("#appSidebar");
  if (sbar) sbar.innerHTML = '<div class="side-title">Kategori</div>' + Array(5).fill('<div class="skel skel-line" style="height:32px;margin:6px 8px;border-radius:8px;"></div>').join("");
}
async function loadKondimen(){
  const { data } = await sb.from("kondimen").select("*").eq("is_deleted", false).order("nama");
  kondimenList = (data || []).map(r => ({
    id: r.id, nama: r.nama, satuan_hasil: r.satuan_hasil, total_hasil: Number(r.total_hasil) || 1,
    hpp_total: Number(r.hpp_total) || 0, hpp_per_satuan: Number(r.hpp_per_satuan) || 0, catatan: r.catatan,
  }));
}
async function loadKategori(){
  const { data } = await sb.from("kategori_produk").select("*").eq("is_deleted", false).order("level").order("urutan");
  kategoriList = (data || []).map(r => ({ id: r.id, nama: r.nama, parent_id: r.parent_id, level: r.level, urutan: r.urutan }));
}
async function loadCabang(){
  const { data } = await sb.from("cabang_hpp").select("*").order("created_at");
  cabangList = (data || []).map(r => ({ id: r.id, nama: r.nama, aktif: r.aktif }));
  // pulihkan fokus cabang tersimpan
  try{ const saved = localStorage.getItem("hpp_fokus_cabang") || ""; if (!saved || cabangList.some(c => c.id === saved)) filterCabangId = saved; }catch(e){}
  isiCabangPicker();
}
function isiCabangPicker(){
  // dropdown cabang kini dirender di hero (produk & dashboard) via renderCabangDropdown
  renderCabangDropdown();
}
function pilihCabang(id){
  filterCabangId = id || "";
  try{ localStorage.setItem("hpp_fokus_cabang", filterCabangId); }catch(e){}
  if (currentTab === "dash") renderDashboard();
  else renderProdukList();
}
function renderCabangDropdown(){
  const wraps = document.querySelectorAll(".hero-cab");
  const aktif = cabangList.filter(c => c.aktif !== false);
  const curNama = filterCabangId ? ((cabangList.find(c => c.id === filterCabangId) || {}).nama || "—") : "Semua cabang";
  wraps.forEach(wrap => {
    wrap.innerHTML = `
      <div class="cab-dd ${filterCabangId ? "aktif" : ""}">
        <button class="cab-dd-btn" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>
          <span class="cab-dd-cur">${esc(curNama)}</span>
          <svg class="cab-dd-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="cab-dd-menu">
          <div class="cab-dd-menu-title">Fokus cabang</div>
          <button class="cab-dd-item ${!filterCabangId ? "sel" : ""}" data-cab="">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
            <span>Semua cabang</span>
            ${!filterCabangId ? '<svg class="chk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>' : ""}
          </button>
          ${aktif.map(c => `
            <button class="cab-dd-item ${filterCabangId === c.id ? "sel" : ""}" data-cab="${esc(c.id)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>
              <span>${esc(c.nama)}</span>
              ${filterCabangId === c.id ? '<svg class="chk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>' : ""}
            </button>`).join("")}
        </div>
      </div>`;
    const dd = wrap.querySelector(".cab-dd");
    const btn = wrap.querySelector(".cab-dd-btn");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasOpen = dd.classList.contains("open");
      document.querySelectorAll(".cab-dd.open").forEach(x => x.classList.remove("open"));
      if (!wasOpen) dd.classList.add("open");
    });
    wrap.querySelectorAll(".cab-dd-item").forEach(it => it.addEventListener("click", (e) => {
      e.stopPropagation();
      dd.classList.remove("open");
      pilihCabang(it.dataset.cab);
    }));
  });
}
// tutup dropdown/search-results saat klik di luar area terkait (bukan cuma
// saat pilih item — dulu #k-hasil cuma bisa hilang lewat klik item, jadi
// nyangkut kalau user berubah pikiran dan mau klik kartu lain)
document.addEventListener("click", (e) => {
  document.querySelectorAll(".cab-dd.open").forEach(x => x.classList.remove("open"));
  document.querySelectorAll(".search-results:not(.hidden)").forEach(el => {
    if (!el.closest(".search-wrap")?.contains(e.target)) el.classList.add("hidden");
  });
});
function katChildren(parentId){
  return kategoriList
    .filter(k => (k.parent_id || null) === (parentId || null))
    .sort((a, b) => (a.urutan || 0) - (b.urutan || 0) || a.nama.localeCompare(b.nama));
}
function katPath(id){
  const names = [];
  let cur = kategoriList.find(k => k.id === id);
  while (cur){ names.unshift(cur.nama); cur = cur.parent_id ? kategoriList.find(k => k.id === cur.parent_id) : null; }
  return names.join(" › ");
}
function katPathNoRoot(id){
  // path tanpa kategori level 1 (FNB) — karena sudah tersirat di header
  const parts = [];
  let cur = kategoriList.find(k => k.id === id);
  while (cur){ if (cur.level > 1) parts.unshift(cur.nama); cur = cur.parent_id ? kategoriList.find(k => k.id === cur.parent_id) : null; }
  return parts.join(" › ") || "Tanpa kategori";
}
function katRootFnb(){
  // id kategori root FNB (level 1, nama FNB)
  const f = kategoriList.find(k => k.level === 1 && k.nama.toUpperCase() === "FNB");
  return f ? f.id : null;
}
async function loadHargaAcuan(){
  const { data, error } = await sb.from("harga_acuan_material").select("*");
  if (error){ console.error(error); return; }
  hargaAcuan = (data || []).map(r => ({
    nama: r.nama_kanonik || r.nama_asli,
    nama_normal: r.nama_normal,
    harga: Number(r.harga_per_unit_beli) || 0,
    sumber: r.sumber,
    tanggal: r.tanggal_terakhir || null,
  }));
}
async function loadKonversi(){
  const { data } = await sb.from("material_konversi").select("*");
  konversiMap = {};
  (data || []).forEach(r => { konversiMap[r.nama_normal] = { isi: Number(r.isi_per_kemasan), unit: r.satuan_pakai }; });
}
async function loadManual(){
  const { data } = await sb.from("material_manual").select("*");
  manualList = (data || []).map(r => ({
    nama: r.nama, nama_normal: (r.nama || "").toLowerCase().trim(),
    harga: Number(r.harga_per_satuan) || 0, satuan: r.satuan, sumber: "manual",
  }));
}
async function loadProduk(){
  const { data } = await sb.from("produk").select("*").eq("is_deleted", false).eq("jenis", "fnb").order("created_at", { ascending: false });
  produkList = data || [];
  await hitungIndikatorProduk();
  renderProdukList();
}

async function hitungIndikatorProduk(){
  const ids = produkList.map(p => p.id);
  if (!ids.length) return;
  // Tren HPP: ambil 2 riwayat terakhir per produk
  const { data: hist } = await sb.from("produk_hpp_history")
    .select("produk_id, hpp, created_at").in("produk_id", ids)
    .order("created_at", { ascending: false });
  const perProduk = {};
  (hist || []).forEach(h => { (perProduk[h.produk_id] = perProduk[h.produk_id] || []).push(h); });

  // Bahan usang: ambil semua resep produk, cek tanggal harga acuan
  const { data: reseps } = await sb.from("resep_bahan").select("produk_id, bahan_nama_normal, sumber_bahan").in("produk_id", ids);
  const resepPer = {};
  (reseps || []).forEach(r => { (resepPer[r.produk_id] = resepPer[r.produk_id] || []).push(r); });

  produkList.forEach(p => {
    // tren
    const h = perProduk[p.id] || [];
    if (h.length >= 2 && h[1].hpp > 0){
      const now = Number(h[0].hpp), prev = Number(h[1].hpp);
      p._tren = now > prev ? "naik" : now < prev ? "turun" : "sama";
      p._trenPersen = prev ? Math.round((now - prev) / prev * 100) : 0;
    } else p._tren = null;
    // bahan usang
    const rs = resepPer[p.id] || [];
    let adaUsang = false;
    rs.forEach(r => {
      if (r.sumber_bahan === "manual" || r.sumber_bahan === "kondimen") return;
      const ac = hargaAcuan.find(a => a.nama_normal === r.bahan_nama_normal);
      if (ac && ac.tanggal && infoTanggal(ac.tanggal).lama) adaUsang = true;
    });
    p._bahanUsang = adaUsang;
  });
}

async function catatLog(produkId, produkNama, aksi, detail){
  await sb.from("produk_log").insert({ produk_id: produkId, produk_nama: produkNama, aksi, detail: detail || "", oleh: "user HPP" });
}

// gabungan sumber bahan untuk pencarian
function allBahan(){
  const acuan = hargaAcuan.map(b => ({ ...b, konv: konversiMap[b.nama_normal] || null }));
  const manual = manualList.map(b => ({ ...b, konv: { isi: 1, unit: b.satuan } }));
  const kondimen = kondimenList.map(k => ({
    nama: "★ " + k.nama, nama_normal: "kondimen:" + k.id,
    harga: k.hpp_per_satuan, sumber: "kondimen",
    konv: { isi: 1, unit: k.satuan_hasil },
  }));
  return [...kondimen, ...acuan, ...manual];
}

// ---------------------------------------------------------------------
//  POPUP PILIH BAHAN — checkbox multi-pilih + filter, dipakai form Tambah
//  Produk (lihat wiring #f-cari di renderAddView). bahanInfoHtml() juga
//  dipakai editor Kondimen untuk baris hasil carinya sendiri (dropdown
//  biasa di sana, bukan modal — cukup satu bahan sekali klik).
// ---------------------------------------------------------------------
const SRC_LABEL = { warehouse: "Gudang", harian: "Harian", manual: "Manual", kondimen: "Kondimen" };
function bahanInfoHtml(b){
  const hargaBeli = b.harga || 0;
  const punyaKonv = !!b.konv;
  const perUnit = punyaKonv ? hargaBeli / (b.konv.isi || 1) : null;
  const infoHarga = punyaKonv
    ? `<b>${perUnit.toFixed(2)}</b>/${esc(b.konv.unit)}` + (b.konv.isi > 1 ? ` <span class="si-beli">(${rp(hargaBeli)}/kemasan isi ${b.konv.isi} ${esc(b.konv.unit)})</span>` : ` <span class="si-beli">(${rp(hargaBeli)})</span>`)
    : `${rp(hargaBeli)} <span class="si-warn">· satuan belum diatur</span>`;
  const tgl = b.tanggal ? infoTanggal(b.tanggal) : null;
  const tglHtml = tgl ? `<span class="${tgl.lama ? "si-usang" : "si-tgl"}">${tgl.lama ? "⚠ " : ""}${tgl.teks}</span>` : "";
  return `<div class="si-top"><span class="si-nm">${esc(b.nama)}</span><span class="src">${esc(SRC_LABEL[b.sumber] || b.sumber)}</span></div>
    <div class="si-info">${infoHarga}${tglHtml}</div>`;
}

let bahanModalSelected = new Map(); // nama_normal -> qty pakai
let bahanModalQuery = "";

function bukaBahanModal(){
  let modal = $("#bahanModal");
  if (!modal){
    modal = document.createElement("div");
    modal.id = "bahanModal";
    modal.className = "dash-modal hidden";
    modal.innerHTML = `<div class="dm-backdrop"></div>
      <div class="dm-panel bm-panel">
        <div class="dm-head"><h3>Pilih Bahan</h3><button class="icon-btn" id="bmClose" aria-label="Tutup"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
        <div class="bm-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input type="text" id="bmCari" placeholder="Cari bahan…" autocomplete="off">
        </div>
        <div class="bm-actions">
          <button class="btn btn-sm" id="bmTambahManual">+ Bahan manual</button>
          <button class="btn btn-sm" id="bmKelolaKondimen">★ Kelola Kondimen</button>
        </div>
        <div class="dm-body" id="bmList"></div>
        <div class="bm-foot"><span id="bmCount">Belum ada dipilih</span><button class="btn btn-primary btn-sm" id="bmTambah" disabled>Tambahkan</button></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector(".dm-backdrop").addEventListener("click", tutupBahanModal);
    modal.querySelector("#bmClose").addEventListener("click", tutupBahanModal);
    modal.querySelector("#bmCari").addEventListener("input", (e) => { bahanModalQuery = e.target.value; renderBahanModalList(); });
    modal.querySelector("#bmTambahManual").addEventListener("click", () => { const q = bahanModalQuery.trim(); tutupBahanModal(); bukaBahanManualModal(q); });
    modal.querySelector("#bmKelolaKondimen").addEventListener("click", () => { tutupBahanModal(); bukaKondimenQuickModal(); });
    modal.querySelector("#bmTambah").addEventListener("click", konfirmasiBahanModal);
  }
  bahanModalSelected = new Map();
  bahanModalQuery = "";
  modal.querySelector("#bmCari").value = "";
  renderBahanModalList();
  modal.classList.remove("hidden");
  requestAnimationFrame(() => modal.classList.add("show"));
  setTimeout(() => modal.querySelector("#bmCari").focus(), 60);
}
function tutupBahanModal(){
  const modal = $("#bahanModal");
  if (!modal) return;
  modal.classList.remove("show");
  setTimeout(() => modal.classList.add("hidden"), 200);
}
function renderBahanModalList(){
  const listEl = $("#bmList");
  if (!listEl) return;
  const sudahAda = new Set(formBahan.map(b => b.nama_normal));
  const q = bahanModalQuery.trim().toLowerCase();
  const list = allBahan().filter(b => !sudahAda.has(b.nama_normal) && (!q || b.nama.toLowerCase().includes(q)));
  if (!list.length){
    const cocokTapiSudahAda = allBahan().some(b => (!q || b.nama.toLowerCase().includes(q)) && sudahAda.has(b.nama_normal));
    listEl.innerHTML = `<div class="empty" style="padding:24px;font-size:13px;">${cocokTapiSudahAda ? "Bahan yang cocok sudah semua ditambahkan." : "Tidak ada bahan cocok."}</div>`;
  } else {
    listEl.innerHTML = list.map(b => {
      const checked = bahanModalSelected.has(b.nama_normal);
      const qty = checked ? bahanModalSelected.get(b.nama_normal) : "";
      const unit = b.konv ? b.konv.unit : "";
      return `<label class="bm-row ${checked ? "checked" : ""}" data-nn="${esc(b.nama_normal)}">
      <input type="checkbox" ${checked ? "checked" : ""}>
      <div class="bm-row-body">${bahanInfoHtml(b)}</div>
      <div class="bm-qty-wrap"><input type="number" class="bm-qty" min="0" step="0.01" placeholder="qty" value="${qty || ""}">${unit ? `<span class="bm-qty-unit">${esc(unit)}</span>` : ""}</div>
    </label>`;
    }).join("");
    $all(".bm-row", listEl).forEach(row => {
      const nn = row.dataset.nn;
      const qtyInput = row.querySelector(".bm-qty");
      row.addEventListener("click", (e) => {
        if (e.target === qtyInput) return; // biar bisa klik & ketik di kolom qty tanpa toggle checkbox
        e.preventDefault();
        const akanChecked = !bahanModalSelected.has(nn);
        if (akanChecked) bahanModalSelected.set(nn, parseFloat(qtyInput.value) || 0);
        else bahanModalSelected.delete(nn);
        row.classList.toggle("checked", akanChecked);
        row.querySelector("input[type=checkbox]").checked = akanChecked;
        updateBmFooter();
        if (akanChecked) setTimeout(() => qtyInput.focus(), 30);
      });
      qtyInput.addEventListener("input", () => {
        if (bahanModalSelected.has(nn)) bahanModalSelected.set(nn, parseFloat(qtyInput.value) || 0);
      });
      qtyInput.addEventListener("click", (e) => e.stopPropagation());
    });
  }
  updateBmFooter();
}
function updateBmFooter(){
  const n = bahanModalSelected.size;
  $("#bmCount").textContent = n ? `${n} bahan dipilih` : "Belum ada dipilih";
  $("#bmTambah").disabled = !n;
}
function konfirmasiBahanModal(){
  const n = bahanModalSelected.size;
  bahanModalSelected.forEach((qty, nn) => addBahanByNormal(nn, qty));
  tutupBahanModal();
  if (n) toast(n === 1 ? "1 bahan ditambahkan" : `${n} bahan ditambahkan`);
}

// ---------------------------------------------------------------------
//  DAFTAR PRODUK
// ---------------------------------------------------------------------
function statusFromMargin(hpp, harga){
  if (!harga || harga <= 0) return null;
  const margin = (harga - hpp) / harga * 100;
  if (margin < 0) return { cls: "status-rugi", txt: "Rugi", margin };
  if (margin < 50) return { cls: "status-tipis", txt: "Margin tipis", margin };
  return { cls: "status-sehat", txt: "Sehat", margin };
}
let filterKategoriId = "";
let filterStatus = "all";  // all | sudah | belum
let filterCabangId = "";   // "" = semua cabang
let dashCabang = "";       // filter cabang khusus dashboard
let cariProduk = "";
let currentTab = "list";

function renderSidebar(){
  const el = $("#appSidebar");
  if (!el) return;
  if (currentTab === "kelola"){ renderKelolaSidebar(el); return; }
  // Produk & Tambah: pohon kategori (di bawah FNB)
  const rootId = katRootFnb();
  const lvl2 = katChildren(rootId);
  const forAdd = currentTab === "add";
  const aktifId = forAdd ? formKategoriId : filterKategoriId;

  let html = `<div class="side-title">Kategori</div>`;
  // mobile dropdown
  let dopts = `<option value="">Semua kategori</option>`;
  const walk = (pid, depth) => {
    katChildren(pid).forEach(k => {
      dopts += `<option value="${k.id}" ${k.id===aktifId?"selected":""}>${"— ".repeat(depth)}${esc(k.nama)}</option>`;
      walk(k.id, depth+1);
    });
  };
  walk(rootId, 0);
  html += `<div class="side-dropdown field" style="margin-bottom:6px;"><select id="sideCatSelect">${dopts}</select></div>`;

  html += `<div class="cat-tree">`;
  if (!forAdd){
    const basisFokus = produkFokus();
    const belumTotal = basisFokus.filter(produkBelumDiisi).length;
    html += `<div class="cat-item ${!filterKategoriId?"active":""}" data-cat=""><span class="cat-nm">Semua produk</span>${catCntBadge(basisFokus.length, belumTotal)}</div>`;
  }
  lvl2.forEach(k => {
    const cnt = countProdukInKat(k.id), belum = countBelumInKat(k.id);
    html += `<div class="cat-item ${k.id===aktifId?"active":""}" data-cat="${k.id}"><span class="cat-nm">${esc(k.nama)}</span>${catCntBadge(cnt, belum)}</div>`;
    katChildren(k.id).forEach(sub => {
      const c2 = countProdukInKat(sub.id), b2 = countBelumInKat(sub.id);
      html += `<div class="cat-item lvl2 ${sub.id===aktifId?"active":""}" data-cat="${sub.id}"><span class="cat-nm">${esc(sub.nama)}</span>${catCntBadge(c2, b2)}</div>`;
    });
  });
  html += `</div>`;
  el.innerHTML = html;

  const pilih = (id) => {
    if (forAdd){ formKategoriId = id; renderKatTingkat && renderKatTingkat(); renderSidebar(); }
    else { filterKategoriId = id; renderProdukList(); }
  };
  $all(".cat-item", el).forEach(it => it.addEventListener("click", () => pilih(it.dataset.cat)));
  const dd = $("#sideCatSelect");
  if (dd) dd.addEventListener("change", (e) => pilih(e.target.value));
}

function countProdukInKat(katId){
  return produkFokus().filter(p => {
    let cur = kategoriList.find(k => k.id === p.kategori_id);
    while (cur){ if (cur.id === katId) return true; cur = cur.parent_id ? kategoriList.find(k => k.id === cur.parent_id) : null; }
    return false;
  }).length;
}
function countBelumInKat(katId){
  return produkFokus().filter(p => {
    if (!produkBelumDiisi(p)) return false;
    let cur = kategoriList.find(k => k.id === p.kategori_id);
    while (cur){ if (cur.id === katId) return true; cur = cur.parent_id ? kategoriList.find(k => k.id === cur.parent_id) : null; }
    return false;
  }).length;
}
function catCntBadge(cnt, belum){
  // badge merah kalau ada produk belum diisi di kategori ini
  const merah = belum > 0 ? " cat-cnt-belum" : "";
  const title = belum > 0 ? ` title="${belum} produk belum diisi"` : "";
  return `<span class="cat-cnt${merah}"${title}>${cnt}</span>`;
}

function renderKelolaSidebar(el){
  const menu = [
    { k:"kategori", t:"Kategori", ic:'<path d="M3 7h18M3 12h18M3 17h18"/>' },
    { k:"kondimen", t:"Material Kondimen", ic:'<path d="M12 2l2 5 5 .5-4 3.5 1 5-4-2.5L8 19l1-5-4-3.5 5-.5z"/>' },
    { k:"cabang", t:"Cabang", ic:'<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1"/>' },
    { k:"log", t:"Log perubahan", ic:'<path d="M12 8v4l3 3M3 12a9 9 0 1018 0 9 9 0 00-18 0z"/>' },
  ];
  el.innerHTML = `<div class="side-title">Pengaturan</div><div class="side-menu">` +
    menu.map(m => `<div class="side-menu-item ${kelolaSub===m.k?"active":""}" data-sub="${m.k}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${m.ic}</svg>${m.t}</div>`).join("") +
    `</div>`;
  $all("[data-sub]", el).forEach(t => t.addEventListener("click", () => { kelolaSub = t.dataset.sub; renderSidebar(); renderKelolaBody(); }));
}
function produkBelumDiisi(p){
  return !Number(p.hpp_terakhir);
}
function produkFokus(){
  // produk sesuai fokus cabang header (dipakai hero, sidebar, dashboard)
  return filterCabangId ? produkList.filter(p => p.cabang_hpp_id === filterCabangId) : produkList;
}
function produkCocokFilter(p){
  // filter kategori
  let okKat = !filterKategoriId;
  if (filterKategoriId){
    let cur = kategoriList.find(k => k.id === p.kategori_id);
    while (cur){ if (cur.id === filterKategoriId){ okKat = true; break; } cur = cur.parent_id ? kategoriList.find(k => k.id === cur.parent_id) : null; }
  }
  if (!okKat) return false;
  // filter cabang
  if (filterCabangId && p.cabang_hpp_id !== filterCabangId) return false;
  // filter pencarian nama
  if (cariProduk && !p.nama.toLowerCase().includes(cariProduk.toLowerCase())) return false;
  // filter status
  if (filterStatus === "belum") return produkBelumDiisi(p);
  if (filterStatus === "sudah") return !produkBelumDiisi(p);
  return true;
}
function renderHero(){
  const el = $("#prodHero");
  if (!el) return;
  const basis = produkFokus();
  const total = basis.length;
  const belum = basis.filter(produkBelumDiisi).length;
  const sudah = total - belum;
  const persen = total ? Math.round(sudah / total * 100) : 0;
  // ringkasan margin (hanya produk terisi)
  let rugi = 0, tipis = 0, sehat = 0;
  basis.forEach(p => {
    if (produkBelumDiisi(p)) return;
    const st = statusFromMargin(Number(p.hpp_terakhir), Number(p.harga_jual_disarankan));
    if (!st) return;
    if (st.cls === "status-rugi") rugi++;
    else if (st.cls === "status-tipis") tipis++;
    else sehat++;
  });
  const cabFokus = filterCabangId ? (cabangList.find(c => c.id === filterCabangId) || {}).nama : "";
  const act = (s) => filterStatus === s ? "active" : "";
  el.innerHTML = `<div class="hero">
    <div class="hero-clip"></div>
    <div class="hero-top">
      <div>
        <div class="hero-title">${cabFokus ? esc(cabFokus) : "Daftar Produk"}</div>
        <div class="hero-sub">${cabFokus ? "Fokus cabang · HPP & harga jual" : "Kelola HPP & harga jual makanan-minuman"}</div>
      </div>
      <div class="hero-right">
        <div class="hero-cab"></div>
        ${rugi ? `<div class="hero-alert">⚠ ${rugi} produk rugi</div>` : (sehat && !belum ? `<div class="hero-ok">✓ Semua sehat</div>` : "")}
      </div>
    </div>
    <div class="hero-stats">
      <div class="hero-stat ${act("all")}" data-status="all"><div class="n">${total}</div><div class="l">Produk</div></div>
      <div class="hero-divider"></div>
      <div class="hero-stat ${act("sudah")}" data-status="sudah"><div class="n">${sudah}</div><div class="l">Sudah diisi</div></div>
      <div class="hero-divider"></div>
      <div class="hero-stat ${act("belum")}" data-status="belum"><div class="n">${belum}</div><div class="l">Belum diisi</div>${belum ? '<span class="stat-dot"></span>' : ''}</div>
    </div>
    <div class="hero-progress">
      <div class="hp-bar"><div class="hp-fill" style="width:${persen}%"></div></div>
      <div class="hp-text">${persen}% selesai${(sehat+tipis+rugi) ? ` &middot; <span style="color:#B8E0C4">${sehat} sehat</span>${tipis?` &middot; <span style="color:#FBE2B8">${tipis} tipis</span>`:""}${rugi?` &middot; <span style="color:#F5C4BE">${rugi} rugi</span>`:""}` : ""}</div>
    </div>
  </div>`;
  $all(".hero-stat", el).forEach(s => s.addEventListener("click", () => {
    filterStatus = s.dataset.status;
    renderProdukList();
  }));
  renderCabangDropdown();
}
function renderProdukList(){
  renderHero();
  renderSidebar();
  const el = $("#prodList");
  const list = produkList.filter(produkCocokFilter);

  // toolbar cari + ekspor
  const toolbar = `<div class="prod-toolbar">
    <div class="search-box">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <input type="text" id="cariProduk" placeholder="Cari produk…" value="${esc(cariProduk)}">
      ${cariProduk ? '<button id="cariClear" aria-label="Hapus">&times;</button>' : ''}
    </div>
    <button class="btn btn-sm" id="btnUpdateHarga"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg> Update Harga</button>
    <button class="btn btn-sm" id="btnExportPdf"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg> Ekspor PDF</button>
  </div>`;

  if (!list.length){
    let rich;
    if (!produkList.length){
      rich = `<div class="empty-rich">
        <div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v18H3zM3 9h18M9 21V9"/></svg></div>
        <h3>Belum ada produk</h3><p>Mulai hitung HPP menu pertama Anda.</p>
        <button class="btn btn-primary btn-sm" id="empty-add">+ Tambah produk</button>
      </div>`;
    } else if (cariProduk){
      rich = `<div class="empty-rich"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg></div><h3>Tidak ditemukan</h3><p>Tidak ada produk cocok "${esc(cariProduk)}".</p></div>`;
    } else if (filterStatus === "belum"){
      rich = `<div class="empty-rich"><div class="ic" style="background:var(--green-light);color:#1E7D46;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg></div><h3>Semua sudah diisi 🎉</h3><p>Tidak ada produk yang tertunda.</p></div>`;
    } else {
      rich = `<div class="empty-rich"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v18H3z"/></svg></div><h3>Kosong</h3><p>${filterStatus === "sudah" ? "Belum ada produk yang diisi." : "Tidak ada produk di kategori ini."}</p></div>`;
    }
    el.innerHTML = toolbar + rich;
    pasangToolbar();
    const ea = $("#empty-add"); if (ea) ea.addEventListener("click", () => { editingProdukId = null; switchTab("add"); });
    return;
  }

  // dashboard insight strip (hanya kalau ada produk terisi & filter "semua")
  let dash = "";
  const terisi = produkList.filter(p => !produkBelumDiisi(p));
  if (terisi.length && !filterKategoriId && !cariProduk && filterStatus === "all"){
    const margins = terisi.map(p => { const h = Number(p.harga_jual_disarankan); return h ? (h - Number(p.hpp_terakhir))/h*100 : 0; });
    const avgMargin = Math.round(margins.reduce((a,b)=>a+b,0) / margins.length);
    const untung = [...terisi].sort((a,b) => (Number(b.harga_jual_disarankan)-Number(b.hpp_terakhir)) - (Number(a.harga_jual_disarankan)-Number(a.hpp_terakhir)))[0];
    const mahal = [...terisi].sort((a,b) => Number(b.hpp_terakhir) - Number(a.hpp_terakhir))[0];
    const kondimenMahal = [...kondimenList].sort((a,b) => b.hpp_per_satuan - a.hpp_per_satuan)[0];
    dash = `<div class="insight-strip">
      <div class="insight ${avgMargin >= 50 ? "good" : avgMargin < 0 ? "bad" : ""}">
        <div class="il"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18M7 14l4-4 3 3 5-6"/></svg>Rata-rata margin</div>
        <div class="iv">${avgMargin}%</div><div class="is">dari ${terisi.length} produk terisi</div>
      </div>
      <div class="insight good">
        <div class="il"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 7 7 .5-5.5 4.5L18 21l-6-4-6 4 1.5-7L2 9.5 9 9z"/></svg>Paling untung</div>
        <div class="iv" style="font-size:15px;">${esc(untung.nama)}</div><div class="is">laba ${rp(Number(untung.harga_jual_disarankan)-Number(untung.hpp_terakhir))}/porsi</div>
      </div>
      <div class="insight">
        <div class="il"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>HPP tertinggi</div>
        <div class="iv" style="font-size:15px;">${esc(mahal.nama)}</div><div class="is">${rp(mahal.hpp_terakhir)}/porsi</div>
      </div>
      ${kondimenMahal ? `<div class="insight">
        <div class="il"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2 5 5 .5-4 3.5 1 5-4-2.5L8 19l1-5-4-3.5 5-.5z"/></svg>Kondimen termahal</div>
        <div class="iv" style="font-size:15px;">${esc(kondimenMahal.nama)}</div><div class="is">${kondimenMahal.hpp_per_satuan.toFixed(2)}/${esc(kondimenMahal.satuan_hasil)}</div>
      </div>` : ""}
    </div>`;
  }

  // kelompokkan per kategori (path tanpa FNB)
  const grup = {};
  list.forEach(p => {
    const key = p.kategori_id ? katPathNoRoot(p.kategori_id) : "Tanpa kategori";
    (grup[key] = grup[key] || []).push(p);
  });
  el.innerHTML = Object.keys(grup).sort().map(key => {
    const rows = grup[key].map(p => {
      const cab = cabangList.find(c => c.id === p.cabang_hpp_id);
      const belum = produkBelumDiisi(p);
      const st = statusFromMargin(Number(p.hpp_terakhir), Number(p.harga_jual_disarankan));
      const tgl = infoTanggal(p.created_at).teks;
      // kelas garis tepi berdasar margin
      const edge = belum ? "edge-belum" : st ? (st.cls === "status-rugi" ? "edge-rugi" : st.cls === "status-tipis" ? "edge-tipis" : "edge-sehat") : "";
      // panah tren HPP
      let tren = "";
      if (!belum && p._tren === "naik") tren = `<span class="tren tren-naik" title="HPP naik ${Math.abs(p._trenPersen)}% dari sebelumnya">▲ ${Math.abs(p._trenPersen)}%</span>`;
      else if (!belum && p._tren === "turun") tren = `<span class="tren tren-turun" title="HPP turun ${Math.abs(p._trenPersen)}% dari sebelumnya">▼ ${Math.abs(p._trenPersen)}%</span>`;
      // tanda bahan usang
      const usang = (!belum && p._bahanUsang) ? `<span class="tanda-usang" title="Ada bahan dengan harga acuan >30 hari — HPP mungkin tidak akurat"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>` : "";
      const statusHtml = belum
        ? `<span class="status-pill status-belum"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h16.9a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>Belum diisi</span>`
        : (st ? `<span class="status-pill ${st.cls}">${st.txt}</span>` : "");
      return `<tr class="prod-row ${belum ? "belum" : ""} ${edge}" data-id="${esc(p.id)}">
        <td><span class="pnm">${esc(p.nama)}</span>${usang}</td>
        <td>${statusHtml}</td>
        <td>
          ${cab ? `<div class="ct-cab">${esc(cab.nama)}</div>` : ""}
          <div class="ct-tgl">${tgl}</div>
        </td>
        <td class="r"><span class="num-val">${belum ? "—" : rp(p.hpp_terakhir)}</span>${tren}</td>
        <td class="r">
          <span class="num-val hl">${belum ? "—" : rp(p.harga_jual_aktual ?? p.harga_jual_disarankan)}</span>
          ${(!belum && p.harga_jual_aktual !== null && p.harga_jual_aktual !== undefined) ? `<div class="sub-note">saran ${rp(p.harga_jual_disarankan)}</div>` : ""}
        </td>
        <td class="r"><span class="num-val">${p.target_margin_persen}%</span></td>
        <td class="r"><button class="prod-dup" data-dup="${esc(p.id)}" title="Duplikat produk"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button></td>
      </tr>`;
    }).join("");
    return `<div style="margin-bottom:6px;">
      <div class="grup-head"><span>${esc(key)}</span><span class="cnt">${grup[key].length}</span><span class="garis"></span></div>
      <div class="prod-table-wrap"><table class="prod-table">
        <thead><tr><th>Produk</th><th>Status</th><th>Cabang &amp; tanggal</th><th class="r">HPP</th><th class="r">Harga jual</th><th class="r">Margin</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
  }).join("");
  el.innerHTML = toolbar + dash + el.innerHTML;
  pasangToolbar();
  $all(".prod-row", el).forEach(it => it.addEventListener("click", (e) => {
    if (e.target.closest(".prod-dup")) return;
    openEdit(it.dataset.id);
  }));
  $all("[data-dup]", el).forEach(b => b.addEventListener("click", (e) => { e.stopPropagation(); duplikatProduk(b.dataset.dup); }));
}

function exportPdf(){
  const list = produkList.filter(produkCocokFilter);
  if (!list.length){ toast("Tidak ada produk untuk diekspor"); return; }
  const grup = {};
  list.forEach(p => { const k = p.kategori_id ? katPathNoRoot(p.kategori_id) : "Tanpa kategori"; (grup[k] = grup[k] || []).push(p); });
  const tglCetak = new Date().toLocaleDateString("id-ID", { day:"numeric", month:"long", year:"numeric" });
  let rows = "";
  Object.keys(grup).sort().forEach(key => {
    rows += `<tr class="grp"><td colspan="4">${esc(key)}</td></tr>`;
    grup[key].forEach(p => {
      const belum = produkBelumDiisi(p);
      rows += `<tr>
        <td>${esc(p.nama)}${belum ? ' <span style="color:#8A5A12;font-size:10px;">(belum diisi)</span>' : ''}</td>
        <td class="r">${belum ? "—" : rp(p.hpp_terakhir)}</td>
        <td class="r">${belum ? "—" : rp(p.harga_jual_disarankan)}</td>
        <td class="r">${p.target_margin_persen}%</td>
      </tr>`;
    });
  });
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Daftar HPP Elio</title>
    <style>
      body{ font-family:Arial,sans-serif; color:#111; padding:24px; }
      h1{ font-size:20px; margin:0 0 2px; color:#0F5132; }
      .sub{ color:#666; font-size:12px; margin-bottom:16px; }
      table{ width:100%; border-collapse:collapse; font-size:13px; }
      th{ text-align:left; border-bottom:2px solid #0F5132; padding:8px 6px; color:#0F5132; }
      th.r,td.r{ text-align:right; }
      td{ padding:7px 6px; border-bottom:1px solid #eee; }
      tr.grp td{ background:#EAF1EC; font-weight:700; color:#0A3D26; font-size:12px; text-transform:uppercase; }
      .foot{ margin-top:16px; font-size:11px; color:#999; }
    </style></head><body>
    <h1>Daftar HPP — Elio (FNB)</h1>
    <div class="sub">Dicetak ${tglCetak} · ${list.length} produk</div>
    <table>
      <thead><tr><th>Produk</th><th class="r">HPP</th><th class="r">Harga Jual</th><th class="r">Margin</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="foot">HPP Elio — dokumen internal</div>
    </body></html>`;
  const w = window.open("", "_blank");
  if (!w){ toast("Izinkan pop-up untuk ekspor PDF"); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 350);
}

function pasangToolbar(){
  const inp = $("#cariProduk");
  if (inp){
    inp.addEventListener("input", (e) => {
      cariProduk = e.target.value;
      const pos = e.target.selectionStart;
      renderProdukList();
      const again = $("#cariProduk"); if (again){ again.focus(); again.setSelectionRange(pos, pos); }
    });
  }
  const clr = $("#cariClear");
  if (clr) clr.addEventListener("click", () => { cariProduk = ""; renderProdukList(); });
  const exp = $("#btnExportPdf");
  if (exp) exp.addEventListener("click", exportPdf);
  const upd = $("#btnUpdateHarga");
  if (upd) upd.addEventListener("click", updateSemuaHarga);
}

// Hitung ulang HPP semua produk (dan kondimen yang jadi bahannya) pakai
// harga acuan Cashflow terkini — tanpa harus buka+simpan tiap produk satu-satu.
// Rumusnya sengaja ditulis ulang di sini (bukan manggil recalc()/hitungKondimenHpp()
// yang baca state form global formBahan/kondimenEdit) supaya loop lintas-produk ini
// tidak bentrok kalau user kebetulan lagi buka form Tambah/Edit di tab lain saat
// tombol ini ditekan.
async function updateSemuaHarga(){
  const btn = $("#btnUpdateHarga");
  const labelAsli = btn ? btn.innerHTML : "";
  if (btn){ btn.disabled = true; btn.innerHTML = "Memperbarui…"; }

  await loadHargaAcuan();
  await loadKonversi();

  // 1) Kondimen dulu — HPP produk yang pakai kondimen (★) bergantung ke nilai ini
  let kondimenBerubah = 0, kondimenDilewati = 0, kondimenGagal = 0;
  for (const k of kondimenList){
    const { data: bahanRows } = await sb.from("kondimen_bahan").select("*").eq("kondimen_id", k.id);
    const bahan = (bahanRows || []).map(b => {
      const found = allBahan().find(x => x.nama_normal === b.bahan_nama_normal);
      return {
        harga: found ? found.harga : 0,
        konv: b.isi_kemasan ? { isi: Number(b.isi_kemasan), unit: b.satuan || "gr" } : (found && found.konv ? found.konv : null),
        qty: Number(b.qty_pakai) || 0,
        override: (b.harga_override !== null && b.harga_override !== undefined) ? Number(b.harga_override) : null,
      };
    });
    if (!bahan.length || bahan.some(b => !b.konv)){ kondimenDilewati++; continue; }
    let total = 0;
    bahan.forEach(b => { total += (b.override != null ? b.override : b.harga / (b.konv.isi || 1)) * (b.qty || 0); });
    const per = k.total_hasil > 0 ? total / k.total_hasil : 0;
    const hppTotal = Math.round(total * 100) / 100, hppPer = Math.round(per * 100) / 100;
    if (hppTotal !== k.hpp_total || hppPer !== k.hpp_per_satuan){
      const { error: errK } = await sb.from("kondimen").update({ hpp_total: hppTotal, hpp_per_satuan: hppPer, updated_at: new Date().toISOString() }).eq("id", k.id);
      if (errK){ console.error("update kondimen gagal:", k.nama, errK); kondimenGagal++; continue; }
      k.hpp_total = hppTotal; k.hpp_per_satuan = hppPer;
      kondimenBerubah++;
    }
  }

  // 2) Produk — pakai kondimenList yang sudah direfresh di atas (lewat allBahan())
  let produkBerubah = 0, produkGagal = 0;
  for (const p of produkList){
    const { data: reseps } = await sb.from("resep_bahan").select("*").eq("produk_id", p.id);
    if (!reseps || !reseps.length) continue; // belum diisi, tidak ada yang direfresh

    let material = 0;
    reseps.forEach(r => {
      const found = allBahan().find(x => x.nama_normal === r.bahan_nama_normal);
      const harga = found ? found.harga : 0;
      const konv = found ? found.konv : null;
      const override = (r.harga_override !== null && r.harga_override !== undefined) ? Number(r.harga_override) : null;
      const eff = override != null ? override : (konv ? harga / (konv.isi || 1) : harga);
      material += eff * (Number(r.qty_pakai) || 0);
    });

    const { data: opexs } = await sb.from("biaya_operasional_produk").select("*").eq("produk_id", p.id);
    let opex = 0;
    (opexs || []).forEach(o => { opex += o.mode === "persen" ? (Number(o.value) / 100) * material : Number(o.value); });

    const overheadPersen = Number(p.overhead_persen) || 15;
    const marginPersen = Number(p.target_margin_persen) || 60;
    const overhead = (overheadPersen / 100) * (material + opex);
    const final = material + opex + overhead;
    const hargaJual = marginPersen < 100 ? final / (1 - marginPersen / 100) : final;

    const hppBaru = Math.round(final), hargaBaru = Math.round(hargaJual);
    const hppLama = Math.round(Number(p.hpp_terakhir) || 0);
    if (hppBaru !== hppLama){
      const { error: errP } = await sb.from("produk").update({ hpp_terakhir: hppBaru, harga_jual_disarankan: hargaBaru, updated_at: new Date().toISOString() }).eq("id", p.id);
      if (errP){ console.error("update produk gagal:", p.nama, errP); produkGagal++; continue; }
      await sb.from("produk_hpp_history").insert({ produk_id: p.id, hpp: hppBaru, harga_jual: hargaBaru, margin_persen: marginPersen });
      await catatLog(p.id, p.nama, "update-harga", `HPP ${rp(hppLama)} → ${rp(hppBaru)}, harga jual ${rp(hargaBaru)}`);
      produkBerubah++;
    }
  }

  await loadKondimen();
  await loadProduk(); // render ulang toolbar + kartu produk dgn angka baru

  let ringkasan = produkBerubah ? `${produkBerubah} produk diperbarui harganya` : "Semua harga produk sudah paling baru";
  if (kondimenBerubah) ringkasan += `, ${kondimenBerubah} kondimen ikut diperbarui`;
  if (kondimenDilewati) ringkasan += `. ${kondimenDilewati} kondimen dilewati (satuan bahan belum lengkap)`;
  if (produkGagal || kondimenGagal) ringkasan += `. Gagal: ${produkGagal} produk, ${kondimenGagal} kondimen`;
  toast(ringkasan);

  if (btn && document.body.contains(btn)){ btn.disabled = false; btn.innerHTML = labelAsli; }
}

async function duplikatProduk(id){
  const p = produkList.find(x => x.id === id);
  if (!p) return;
  const namaBaru = prompt("Nama produk baru (salinan):", p.nama + " (salinan)");
  if (!namaBaru) return;
  // salin produk
  const { data: baru, error } = await sb.from("produk").insert({
    nama: namaBaru.trim(), kategori: p.kategori || "FNB", jenis: "fnb",
    kategori_id: p.kategori_id, cabang_hpp_id: p.cabang_hpp_id,
    overhead_persen: p.overhead_persen, target_margin_persen: p.target_margin_persen,
    hpp_terakhir: p.hpp_terakhir, harga_jual_disarankan: p.harga_jual_disarankan,
  }).select("id").single();
  if (error){ toast("Gagal menduplikat"); console.error(error); return; }
  // salin resep & opex
  const { data: resep } = await sb.from("resep_bahan").select("*").eq("produk_id", id);
  if (resep && resep.length){
    await sb.from("resep_bahan").insert(resep.map(r => ({
      produk_id: baru.id, bahan_nama_normal: r.bahan_nama_normal, sumber_bahan: r.sumber_bahan,
      qty_pakai: r.qty_pakai, harga_override: r.harga_override,
    })));
  }
  const { data: opex } = await sb.from("biaya_operasional_produk").select("*").eq("produk_id", id);
  if (opex && opex.length){
    await sb.from("biaya_operasional_produk").insert(opex.map(o => ({
      produk_id: baru.id, label: o.label, mode: o.mode, value: o.value,
    })));
  }
  await catatLog(baru.id, namaBaru.trim(), "buat", "Duplikat dari " + p.nama);
  toast("Produk diduplikat");
  await loadProduk();
}

// ---------------------------------------------------------------------
//  TAMBAH / EDIT PRODUK
// ---------------------------------------------------------------------
let formBahan = [];  // {nama, nama_normal, harga, sumber, konv:{isi,unit}|null, qty, override}
let formOpex = [];   // {label, mode:'manual'|'persen', value}
let formOverheadPersen = 15;
let formMargin = 60;
let formHargaAktual = null; // harga jual sungguhan di outlet (opsional) — null = belum diisi, ikut harga disarankan
let formProses = [];  // {teks, level}  level: penting|hati|normal|info
let kondimenList = []; // {id, nama, satuan_hasil, hpp_per_satuan, ...}

const PROSES_LEVEL = {
  normal: { label: "Normal", warna: "#5A655F", bg: "transparent" },
  penting:{ label: "Sangat penting", warna: "#9B2C22", bg: "rgba(155,44,34,0.08)" },
  hati:   { label: "Hati-hati", warna: "#8A5A12", bg: "rgba(138,90,18,0.10)" },
  info:   { label: "Tips / info", warna: "#0F5132", bg: "rgba(15,81,50,0.07)" },
};

function newForm(){
  formBahan = []; formOpex = []; formOverheadPersen = 15; formMargin = 60; formHargaAktual = null; editingProdukId = null; formKategoriId = ""; formProses = [];
  const d = bacaDraft();
  if (d && !editingProdukId){
    // ada draft tersimpan — tawarkan pulihkan
    setTimeout(() => {
      if (confirm("Ada draft menu yang belum disimpan. Pulihkan?")){ pulihkanDraft(d); }
      else { hapusDraft(); }
    }, 100);
  }
  renderAddView();
}

function renderAddView(){
  const v = $("#viewAdd");
  const isEdit = !!editingProdukId;
  v.innerHTML = `
    <div class="sub-hero">
      <div class="sub-hero-clip"><div class="sub-hero-grid"></div><div class="sub-hero-glow"></div></div>
      <div class="sub-hero-inner">
        <div class="sub-hero-ic">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${isEdit
            ? '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z"/>'
            : '<path d="M12 5v14M5 12h14"/>'}</svg>
        </div>
        <div>
          <div class="sub-hero-badge"><span class="dot"></span> ${isEdit ? "Ubah Data" : "Input Baru"}</div>
          <h1 class="sub-hero-title">${isEdit ? "Edit Produk" : "Tambah Produk"}</h1>
          <p class="sub-hero-sub">${isEdit ? "Perbarui bahan, biaya, dan cara proses produk." : "Hitung HPP & harga jual dari bahan, kondimen, dan overhead."}</p>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="field">
        <label>Nama produk</label>
        <input type="text" id="f-nama" placeholder="Nasi goreng ikan asin">
      </div>
      <div class="field">
        <label>Kategori</label>
        <div id="f-kat-tingkat"></div>
      </div>
      <div class="field">
        <label>Cabang</label>
        <select id="f-cabang">${cabangList.filter(c => c.aktif).map(c => `<option value="${c.id}">${esc(c.nama)}</option>`).join("")}</select>
      </div>
    </div>

    <div class="card">
      <h2><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2M7 2v20M21 15V2a5 5 0 00-3 4.5V13a2 2 0 002 2h1z"/></svg>Bahan</h2>
      <div class="search-wrap">
        <div class="search-input">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
          <input type="text" id="f-cari" placeholder="Klik untuk pilih bahan…" autocomplete="off" readonly style="cursor:pointer;">
        </div>
      </div>
      <div id="f-bahan"></div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h2 style="margin:0;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>Cara Proses</h2>
        <button class="btn btn-sm" id="f-add-proses">+ Tambah langkah</button>
      </div>
      <div class="proses-legend">
        <span><i style="background:${PROSES_LEVEL.penting.warna}"></i>Sangat penting</span>
        <span><i style="background:${PROSES_LEVEL.hati.warna}"></i>Hati-hati</span>
        <span><i style="background:${PROSES_LEVEL.info.warna}"></i>Tips</span>
        <span><i style="background:${PROSES_LEVEL.normal.warna}"></i>Normal</span>
      </div>
      <div id="f-proses"></div>
    </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <label style="font-size:13px;color:var(--ink-soft);font-weight:500;">Biaya operasional lain</label>
        <button class="btn btn-sm" id="f-add-opex">+ Tambah</button>
      </div>
      <div id="f-opex"></div>
      <div class="slider-field" style="margin-top:16px;">
        <div class="slider-top"><label>Overhead gaji &amp; tak langsung</label><span class="val" id="f-oh-val">${formOverheadPersen}%</span></div>
        <input type="range" id="f-oh" min="0" max="40" value="${formOverheadPersen}" step="1">
        <div class="opex-note">% dari (material + biaya operasional)</div>
      </div>
    </div>

    <div class="card">
      <div class="sum-line"><span class="lbl">HPP material</span><span class="amt" id="s-material">Rp 0</span></div>
      <div class="sum-line"><span class="lbl">Biaya operasional</span><span class="amt" id="s-opex">Rp 0</span></div>
      <div class="sum-line"><span class="lbl">Overhead gaji &amp; tak langsung</span><span class="amt" id="s-overhead">Rp 0</span></div>
      <div class="sum-line sum-final"><span class="lbl">HPP final</span><span class="amt" id="s-final">Rp 0</span></div>

      <div class="slider-field" style="margin-top:16px;">
        <div class="slider-top"><label>Target margin</label><span class="val" id="f-mg-val">${formMargin}%</span></div>
        <input type="range" id="f-mg" min="30" max="80" value="${formMargin}" step="1">
      </div>

      <div class="price-box">
        <span class="lbl">Harga jual disarankan</span>
        <span class="amt" id="s-harga">Rp 0</span>
      </div>

      <div class="field" style="margin-top:14px;">
        <label>Harga jual aktual di outlet (opsional)</label>
        <input type="number" id="f-harga-aktual" placeholder="Isi kalau beda dari harga disarankan" value="${formHargaAktual !== null && formHargaAktual !== undefined ? formHargaAktual : ""}">
      </div>
      <div class="bmm-hasil" id="s-selisih" style="display:none;"></div>

      <button class="btn btn-primary btn-block" id="f-simpan">${editingProdukId ? "Simpan Perubahan" : "Simpan Produk"}</button>
      ${!editingProdukId ? '<button class="btn btn-block" id="f-draft" style="margin-top:8px;">Simpan sebagai draft</button>' : ""}
      ${editingProdukId ? '<button class="btn btn-danger btn-block" id="f-hapus" style="margin-top:8px;">Hapus Produk</button>' : ""}
    </div>
  `;

  // search behaviour — klik kotak "Bahan" membuka popup pilih-banyak (checkbox + filter),
  // bukan dropdown inline lagi. Dipakai juga oleh pencarian bahan di editor Kondimen (lihat bahanInfoHtml).
  const cari = $("#f-cari");
  cari.addEventListener("focus", () => { cari.blur(); bukaBahanModal(); });
  cari.addEventListener("click", () => bukaBahanModal());

  $("#f-oh").addEventListener("input", (e) => { formOverheadPersen = +e.target.value; $("#f-oh-val").textContent = formOverheadPersen + "%"; recalc(); autoDraft(); });
  $("#f-mg").addEventListener("input", (e) => { formMargin = +e.target.value; $("#f-mg-val").textContent = formMargin + "%"; recalc(); autoDraft(); });
  $("#f-harga-aktual").addEventListener("input", (e) => { const v = e.target.value.trim(); formHargaAktual = v === "" ? null : (parseFloat(v) || 0); recalc(); autoDraft(); });
  $("#f-add-opex").addEventListener("click", () => { formOpex.push({ label: "", mode: "manual", value: 0 }); renderOpex(); recalc(); });
  $("#f-add-proses").addEventListener("click", () => { formProses.push({ teks: "", level: "normal" }); renderProses(); autoDraft(); });
  $("#f-simpan").addEventListener("click", saveProduk);
  const draftBtn = $("#f-draft");
  if (draftBtn) draftBtn.addEventListener("click", () => { simpanDraft(); toast("Draft disimpan"); });
  const namaInp = $("#f-nama");
  if (namaInp) namaInp.addEventListener("input", autoDraft);
  const hapusBtn = $("#f-hapus");
  if (hapusBtn) hapusBtn.addEventListener("click", deleteProduk);

  renderFormBahan(); renderOpex(); renderProses(); recalc();
  renderKatTingkat();
}

function renderProses(){
  const el = $("#f-proses");
  if (!el) return;
  if (!formProses.length){ el.innerHTML = '<div class="empty" style="padding:16px;font-size:13px;">Belum ada langkah. Klik "+ Tambah langkah" untuk menulis cara membuat.</div>'; return; }
  el.innerHTML = formProses.map((s, i) => {
    const lv = PROSES_LEVEL[s.level] || PROSES_LEVEL.normal;
    return `<div class="proses-row" data-i="${i}" style="background:${lv.bg};border-left:3px solid ${lv.warna};">
      <div class="proses-no" style="background:${lv.warna}">${i + 1}</div>
      <div class="proses-body">
        <textarea class="proses-teks" data-i="${i}" rows="2" placeholder="Tulis langkah ${i + 1}…">${esc(s.teks)}</textarea>
        <div class="proses-actions">
          <select class="proses-level" data-i="${i}">
            ${Object.keys(PROSES_LEVEL).map(k => `<option value="${k}" ${k === s.level ? "selected" : ""}>${PROSES_LEVEL[k].label}</option>`).join("")}
          </select>
          <div class="proses-move">
            <button class="icon-btn" data-up="${i}" ${i === 0 ? "disabled" : ""} aria-label="Naik"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg></button>
            <button class="icon-btn" data-down="${i}" ${i === formProses.length - 1 ? "disabled" : ""} aria-label="Turun"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></button>
            <button class="icon-btn" data-del="${i}" aria-label="Hapus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");
  $all(".proses-teks", el).forEach(t => t.addEventListener("input", (e) => { formProses[+e.target.dataset.i].teks = e.target.value; autoDraft(); }));
  $all(".proses-level", el).forEach(s => s.addEventListener("change", (e) => { formProses[+e.target.dataset.i].level = e.target.value; renderProses(); autoDraft(); }));
  $all("[data-up]", el).forEach(b => b.addEventListener("click", () => { const i = +b.dataset.up; [formProses[i-1], formProses[i]] = [formProses[i], formProses[i-1]]; renderProses(); autoDraft(); }));
  $all("[data-down]", el).forEach(b => b.addEventListener("click", () => { const i = +b.dataset.down; [formProses[i+1], formProses[i]] = [formProses[i], formProses[i+1]]; renderProses(); autoDraft(); }));
  $all("[data-del]", el).forEach(b => b.addEventListener("click", () => { formProses.splice(+b.dataset.del, 1); renderProses(); autoDraft(); }));
}

// ---------- DRAFT (localStorage) ----------
const DRAFT_KEY = "hpp_draft_fnb";
function kumpulkanForm(){
  return {
    nama: ($("#f-nama") ? $("#f-nama").value : "") || "",
    kategori_id: formKategoriId,
    cabang_hpp_id: $("#f-cabang") ? $("#f-cabang").value : null,
    overhead: formOverheadPersen, margin: formMargin, hargaAktual: formHargaAktual,
    bahan: formBahan, opex: formOpex, proses: formProses,
    ts: Date.now(),
  };
}
function simpanDraft(){ try{ localStorage.setItem(DRAFT_KEY, JSON.stringify(kumpulkanForm())); }catch(e){} }
let draftTimer = null;
function autoDraft(){ if (editingProdukId) return; clearTimeout(draftTimer); draftTimer = setTimeout(simpanDraft, 800); }
function bacaDraft(){ try{ const s = localStorage.getItem(DRAFT_KEY); if (!s) return null; const d = JSON.parse(s); return (d.nama || (d.bahan && d.bahan.length) || (d.proses && d.proses.length)) ? d : null; }catch(e){ return null; } }
function hapusDraft(){ try{ localStorage.removeItem(DRAFT_KEY); }catch(e){} }
function pulihkanDraft(d){
  formKategoriId = d.kategori_id || "";
  formOverheadPersen = d.overhead ?? 15; formMargin = d.margin ?? 60; formHargaAktual = (d.hargaAktual ?? null);
  formBahan = d.bahan || []; formOpex = d.opex || []; formProses = d.proses || [];
  renderAddView();
  if ($("#f-nama")) $("#f-nama").value = d.nama || "";
  if ($("#f-cabang") && d.cabang_hpp_id) $("#f-cabang").value = d.cabang_hpp_id;
  renderKatTingkat(); renderSidebar(); recalc();
  toast("Draft dipulihkan");
}

let formKategoriId = "";  // kategori terpilih (id daun terdalam)
function renderKatTingkat(){
  // Dulu cuma nampilin path terpilih + suruh pilih dari panel sidebar kiri —
  // membingungkan karena aksinya di tempat lain dari field ini. Sekarang
  // dropdown langsung di sini (pola sama seperti dropdown kategori mobile di
  // renderSidebar), sidebar kiri tetap ada buat menjelajah/lihat pohon
  // kategori tapi bukan satu-satunya cara pilih lagi.
  const wrap = $("#f-kat-tingkat");
  if (!wrap) return;
  const rootId = katRootFnb();
  let opts = `<option value="">Pilih kategori…</option>`;
  const walk = (pid, depth) => {
    katChildren(pid).forEach(k => {
      opts += `<option value="${esc(k.id)}" ${k.id === formKategoriId ? "selected" : ""}>${"— ".repeat(depth)}${esc(k.nama)}</option>`;
      walk(k.id, depth + 1);
    });
  };
  walk(rootId, 0);
  wrap.innerHTML = `<select id="f-kat-select">${opts}</select>`;
  $("#f-kat-select").addEventListener("change", (e) => {
    formKategoriId = e.target.value;
    renderSidebar();
  });
}

function addBahanByNormal(nn, qty){
  const b = allBahan().find(x => x.nama_normal === nn);
  if (!b) return;
  if (formBahan.some(x => x.nama_normal === nn)){ toast("Bahan sudah ditambahkan"); return; }
  formBahan.push({ nama: b.nama, nama_normal: b.nama_normal, harga: b.harga, sumber: b.sumber, tanggal: b.tanggal || null, konv: b.konv ? { ...b.konv } : null, qty: qty || 0, override: null, hargaBeliOverride: null });
  renderFormBahan(); recalc();
}

// Dulu 3x prompt() berantai — kalau salah satu dialog native ke-dismiss atau
// tidak muncul (ketemu langsung waktu QA: browser tertentu mensupresi
// prompt()/confirm()), fungsinya diam-diam berhenti tanpa pesan apa pun,
// kelihatan seperti "tombolnya tidak berfungsi". Diganti form biasa di modal.
let bahanManualTarget = "produk"; // "produk" (formBahan) | "kondimen" (kondimenEdit.bahan)
function bukaBahanManualModal(prefill, target){
  bahanManualTarget = target || "produk";
  let modal = $("#bahanManualModal");
  if (!modal){
    modal = document.createElement("div");
    modal.id = "bahanManualModal";
    modal.className = "dash-modal hidden";
    modal.innerHTML = `<div class="dm-backdrop"></div>
      <div class="dm-panel" style="max-width:400px;">
        <div class="dm-head"><h3>Tambah Bahan Manual</h3><button class="icon-btn" id="bmmClose" aria-label="Tutup"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
        <div class="dm-body">
          <div class="field"><label>Nama bahan</label><input type="text" id="bmm-nama" placeholder="mis. Micin 500gram"></div>
          <div class="field"><label>Harga pembelian (Rp)</label><input type="number" id="bmm-hargabeli" min="0" step="1" placeholder="mis. 15000"></div>
          <div class="field-row">
            <div class="field"><label>Jumlah didapat</label><input type="number" id="bmm-jumlah" min="0" step="0.01" placeholder="mis. 500"></div>
            <div class="field"><label>Satuan</label><select id="bmm-satuan"><option value="gr">gr</option><option value="ml">ml</option><option value="pcs">pcs</option></select></div>
          </div>
          <div class="bmm-hasil" id="bmm-hasil"></div>
          <div class="field" style="margin-top:14px;"><label id="bmm-pakai-label">Jumlah pemakaian di resep ini</label><input type="number" id="bmm-pakai" min="0" step="0.01" placeholder="0"></div>
        </div>
        <div class="bm-foot"><span></span><button class="btn btn-primary btn-sm" id="bmmSimpan">Simpan &amp; Tambahkan</button></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector(".dm-backdrop").addEventListener("click", tutupBahanManualModal);
    modal.querySelector("#bmmClose").addEventListener("click", tutupBahanManualModal);
    modal.querySelector("#bmmSimpan").addEventListener("click", simpanBahanManual);
    modal.querySelector("#bmm-nama").addEventListener("keydown", (e) => { if (e.key === "Enter") simpanBahanManual(); });
    ["#bmm-hargabeli", "#bmm-jumlah", "#bmm-satuan"].forEach(sel => {
      modal.querySelector(sel).addEventListener("input", updateBmmHasil);
      modal.querySelector(sel).addEventListener("change", updateBmmHasil);
    });
  }
  modal.querySelector("#bmm-nama").value = prefill || "";
  modal.querySelector("#bmm-hargabeli").value = "";
  modal.querySelector("#bmm-jumlah").value = "";
  modal.querySelector("#bmm-satuan").value = "gr";
  modal.querySelector("#bmm-pakai").value = "";
  updateBmmHasil();
  modal.classList.remove("hidden");
  requestAnimationFrame(() => modal.classList.add("show"));
  setTimeout(() => modal.querySelector("#bmm-nama").focus(), 60);
}
function tutupBahanManualModal(){
  const modal = $("#bahanManualModal");
  if (!modal) return;
  modal.classList.remove("show");
  setTimeout(() => modal.classList.add("hidden"), 200);
}
// Konversi harga beli -> harga per satuan pakai kecil, sama seperti alur
// "Lengkapi satuan" buat bahan acuan — supaya orang tidak perlu bagi manual
// harga per kemasan / isi kemasan sendiri di kepala.
function hitungHargaManual(){
  const hargaBeli = parseFloat($("#bmm-hargabeli").value) || 0;
  const jumlah = parseFloat($("#bmm-jumlah").value) || 0;
  return jumlah > 0 ? hargaBeli / jumlah : 0;
}
function updateBmmHasil(){
  const hasilEl = $("#bmm-hasil");
  if (!hasilEl) return;
  const jumlah = parseFloat($("#bmm-jumlah").value) || 0;
  const satuan = $("#bmm-satuan").value;
  hasilEl.classList.toggle("filled", jumlah > 0);
  hasilEl.innerHTML = jumlah > 0
    ? `Harga per ${esc(satuan)}: <b>Rp ${hitungHargaManual().toFixed(2)}</b>`
    : `Isi harga & jumlah dulu buat lihat harga per ${esc(satuan)}`;
  const pakaiLabel = $("#bmm-pakai-label");
  const pakaiKonteks = bahanManualTarget === "kondimen" ? "di kondimen ini" : "di resep ini";
  if (pakaiLabel) pakaiLabel.textContent = `Jumlah pemakaian ${pakaiKonteks} (${satuan})`;
}
async function simpanBahanManual(){
  const nama = $("#bmm-nama").value.trim();
  const jumlah = parseFloat($("#bmm-jumlah").value) || 0;
  const satuan = $("#bmm-satuan").value;
  const qtyPakai = parseFloat($("#bmm-pakai").value) || 0;
  const harga = hitungHargaManual();
  if (!nama){ toast("Nama bahan wajib diisi"); return; }
  if (jumlah <= 0){ toast("Jumlah didapat harus lebih dari 0"); return; }
  const { error } = await sb.from("material_manual").insert({ nama, harga_per_satuan: harga, satuan });
  if (error){ toast("Gagal simpan bahan manual"); return; }
  await loadManual();
  const nn = nama.toLowerCase().trim();
  if (bahanManualTarget === "kondimen"){
    kondimenEdit.bahan.push({ nama, nama_normal: nn, harga, sumber: "manual", konv: { isi: 1, unit: satuan }, qty: qtyPakai, override: null });
    renderKondimenBahan(); refreshKondimenHpp();
  } else {
    formBahan.push({ nama, nama_normal: nn, harga, sumber: "manual", konv: { isi: 1, unit: satuan }, qty: qtyPakai, override: null, hargaBeliOverride: null });
    renderFormBahan(); recalc();
  }
  tutupBahanManualModal();
  toast("Bahan manual ditambahkan");
}

function bahanHargaBeli(b){
  // harga beli efektif: pakai override resep kalau ada, kalau tidak pakai acuan DB
  return (b.hargaBeliOverride !== null && b.hargaBeliOverride !== undefined) ? b.hargaBeliOverride : b.harga;
}
function bahanIsi(b){
  return b.konv ? b.konv.isi : 1;
}
function effPrice(b){
  // harga per satuan pakai. Kalau harga/satuan di-override langsung, pakai itu.
  if (b.override !== null && b.override !== undefined) return b.override;
  return b.konv ? bahanHargaBeli(b) / bahanIsi(b) : bahanHargaBeli(b);
}
function effUnit(b){ return b.konv ? b.konv.unit : "kemasan"; }

let bahanOpen = {};  // index -> true kalau baris terbuka

function renderFormBahan(){
  const el = $("#f-bahan");
  if (!formBahan.length){ el.innerHTML = '<div class="empty" style="padding:20px;">Belum ada bahan dipilih.</div>'; return; }
  el.innerHTML = formBahan.map((b, i) => {
    const price = effPrice(b), unit = effUnit(b), needsSetup = !b.konv;
    if (needsSetup){
      return `<div class="bahan-row" data-i="${i}">
        <div class="brow-main" style="cursor:default;">
          <span class="brow-nm">${esc(b.nama)}</span>
          <span></span><span></span>
          <button class="drow-reset" data-act="rm" aria-label="Hapus" style="width:18px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <div class="brow-warn">
          <span class="txt"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h16.9a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg> Lengkapi satuan dulu</span>
          <button class="btn btn-sm btn-primary" data-act="lengkapi" style="margin-left:auto;">Lengkapi</button>
        </div>
      </div>`;
    }
    const hb = bahanHargaBeli(b), isi = bahanIsi(b);
    const isPerPcs = isi === 1 && unit === "pcs";
    const hbOver = (b.hargaBeliOverride !== null && b.hargaBeliOverride !== undefined);
    const prOver = (b.override !== null && b.override !== undefined);
    const sub = price * (b.qty || 0);
    const tglInfo = infoTanggal(b.tanggal);
    const open = !!bahanOpen[i];
    return `<div class="bahan-row ${open ? "open" : ""}" data-i="${i}">
      <div class="brow-main" data-act="toggle">
        <span class="brow-nm">${esc(b.nama)}</span>
        <span class="brow-qty"><b>${b.qty || 0}</b> ${esc(unit)} &times; ${price.toFixed(2)}</span>
        <span class="brow-sub">${rp(sub)}</span>
        <svg class="brow-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </div>
      ${open ? `<div class="brow-detail">
        <div class="drow">
          <span class="drow-lbl">Harga beli <small>${hbOver ? "diubah manual" : "DB kasir &middot; " + tglInfo.teks}</small></span>
          <div class="drow-in"><input type="number" step="1" value="${hb}" data-act="hbeli"><span class="u">/kms</span></div>
          <button class="drow-reset" data-act="reset-hbeli" aria-label="Reset" ${hbOver ? "" : "style=visibility:hidden"}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15"/></svg></button>
        </div>
        ${!hbOver && tglInfo.lama ? `<div class="tgl-usang">Harga ${tglInfo.hari} hari lalu — mungkin sudah berubah</div>` : ""}
        ${isPerPcs ? "" : `<div class="drow">
          <span class="drow-lbl">Isi per kemasan</span>
          <div class="drow-in"><input type="number" step="1" value="${isi}" data-act="isi"><span class="u">${esc(unit)}</span></div>
          <span style="width:22px;"></span>
        </div>`}
        <div class="drow">
          <span class="drow-lbl">Harga per ${esc(unit)} <small>${prOver ? "diubah manual" : "otomatis"}</small></span>
          <div class="drow-in ${prOver ? "" : "calc"}"><input type="number" step="0.01" value="${price.toFixed(2)}" data-act="perunit"><span class="u">/${esc(unit)}</span></div>
          <button class="drow-reset" data-act="reset-perunit" aria-label="Auto" ${prOver ? "" : "style=visibility:hidden"}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15"/></svg></button>
        </div>
        <div class="drow">
          <span class="drow-lbl">Jumlah dipakai</span>
          <div class="drow-in"><input type="number" min="0" step="0.1" value="${b.qty}" data-act="qty"><span class="u">${esc(unit)}</span></div>
          <span style="width:22px;"></span>
        </div>
        <div class="drow" style="display:flex;justify-content:space-between;gap:8px;">
          <button class="btn btn-sm" data-act="ubahsatuan" style="font-size:12px;">Ubah satuan</button>
          <button class="btn btn-sm btn-danger" data-act="rm" style="font-size:12px;">Hapus bahan</button>
        </div>
      </div>` : ""}
    </div>`;
  }).join("");

  $all(".bahan-row", el).forEach(row => {
    const i = +row.dataset.i;
    const toggle = row.querySelector('[data-act="toggle"]');
    if (toggle) toggle.addEventListener("click", (e) => {
      if (e.target.closest("input,button")) return;
      bahanOpen[i] = !bahanOpen[i]; renderFormBahan();
    });
    $all('[data-act="rm"]', row).forEach(btn => btn.addEventListener("click", () => { formBahan.splice(i, 1); delete bahanOpen[i]; renderFormBahan(); recalc(); }));
    const qtyEl = row.querySelector('[data-act="qty"]');
    if (qtyEl) qtyEl.addEventListener("input", (e) => { formBahan[i].qty = parseFloat(e.target.value) || 0; recalc(); updateBrowMain(i); });
    const hbeliEl = row.querySelector('[data-act="hbeli"]');
    if (hbeliEl) hbeliEl.addEventListener("change", (e) => { formBahan[i].hargaBeliOverride = parseFloat(e.target.value) || 0; formBahan[i].override = null; renderFormBahan(); recalc(); });
    const isiEl = row.querySelector('[data-act="isi"]');
    if (isiEl) isiEl.addEventListener("change", (e) => { const v = parseFloat(e.target.value); if (v > 0){ formBahan[i].konv = { isi: v, unit: effUnit(formBahan[i]) }; formBahan[i].override = null; renderFormBahan(); recalc(); } });
    const perunitEl = row.querySelector('[data-act="perunit"]');
    if (perunitEl) perunitEl.addEventListener("change", (e) => { formBahan[i].override = parseFloat(e.target.value) || 0; renderFormBahan(); recalc(); });
    const resetHb = row.querySelector('[data-act="reset-hbeli"]');
    if (resetHb) resetHb.addEventListener("click", () => { formBahan[i].hargaBeliOverride = null; formBahan[i].override = null; renderFormBahan(); recalc(); });
    const resetPu = row.querySelector('[data-act="reset-perunit"]');
    if (resetPu) resetPu.addEventListener("click", () => { formBahan[i].override = null; renderFormBahan(); recalc(); });
    const lengkapiBtn = row.querySelector('[data-act="lengkapi"]');
    if (lengkapiBtn) lengkapiBtn.addEventListener("click", () => lengkapiSatuan(row, i));
    const ubahBtn = row.querySelector('[data-act="ubahsatuan"]');
    if (ubahBtn) ubahBtn.addEventListener("click", () => { formBahan[i].konv = null; formBahan[i].override = null; bahanOpen[i] = false; renderFormBahan(); const r = $(`.bahan-row[data-i="${i}"]`); lengkapiSatuan(r, i); });
  });
  recalc();
}

function updateBrowMain(i){
  const b = formBahan[i];
  const row = $(`.bahan-row[data-i="${i}"]`);
  if (!row) return;
  const price = effPrice(b), unit = effUnit(b);
  const qEl = row.querySelector(".brow-qty"), sEl = row.querySelector(".brow-sub");
  if (qEl) qEl.innerHTML = `<b>${b.qty || 0}</b> ${esc(unit)} &times; ${price.toFixed(2)}`;
  if (sEl) sEl.textContent = rp(price * (b.qty || 0));
}

function recalcSub(i){ recalc(); }

function editPrice(row, i){
  const cell = row.querySelector("[data-price]");
  const price = effPrice(formBahan[i]);
  cell.innerHTML = `<input type="number" step="0.01" value="${price.toFixed(2)}" data-pin>
    <button class="icon-btn" data-pok aria-label="Simpan"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg></button>`;
  const inp = cell.querySelector("[data-pin]"); inp.focus();
  cell.querySelector("[data-pok]").addEventListener("click", () => {
    formBahan[i].override = parseFloat(inp.value) || 0; renderFormBahan(); recalc();
  });
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") cell.querySelector("[data-pok]").click(); });
}

function deteksiSatuan(nama){
  const m = nama.match(/(\d+(?:\.\d+)?)\s?(kg|gr|g|ml|l|liter|oz|pcs)\b/i);
  if (!m) return null;
  const a = parseFloat(m[1]); const u = m[2].toLowerCase();
  if (u === "kg") return { isi: a * 1000, unit: "gr" };
  if (u === "g" || u === "gr") return { isi: a, unit: "gr" };
  if (u === "l" || u === "liter") return { isi: a * 1000, unit: "ml" };
  if (u === "ml") return { isi: a, unit: "ml" };
  if (u === "oz") return { isi: Math.round(a * 29.57), unit: "ml" };
  if (u === "pcs") return { isi: a, unit: "pcs" };
  return null;
}

async function simpanKonversi(b, i, isi, unit){
  if (!(isi > 0)){ toast("Isi per kemasan harus lebih dari 0"); return; }
  if (b.sumber !== "manual"){
    await sb.from("material_konversi").upsert({ nama_normal: b.nama_normal, nama: b.nama, isi_per_kemasan: isi, satuan_pakai: unit }, { onConflict: "nama_normal" });
    konversiMap[b.nama_normal] = { isi, unit };
  }
  formBahan[i].konv = { isi, unit };
  bahanOpen[i] = true;
  renderFormBahan(); recalc();
  toast("Satuan dilengkapi");
}

function lengkapiSatuan(row, i){
  const b = formBahan[i];
  const det = deteksiSatuan(b.nama);
  const warn = row.querySelector(".brow-warn");
  if (!warn) return;
  warn.innerHTML = `
    <div style="width:100%;">
      <div class="setup-hint ${det ? "detected" : ""}">${det ? "Terdeteksi dari nama: " + det.isi + " " + det.unit + " per kemasan — koreksi bila perlu" : "Kalau dibeli & dipakai per pcs yang sama, klik tombol hijau. Kalau dibeli per kemasan lalu dipakai per gram/ml, isi konversinya."}</div>
      <button class="btn btn-sm btn-primary" data-perpcs style="width:100%;margin-bottom:8px;">Pakai per pcs (sama dengan satuan beli)</button>
      <div class="setup-box">
        <input type="number" placeholder="isi per kemasan" value="${det ? det.isi : ""}" data-isi>
        <select data-unit>
          <option value="gr" ${det && det.unit === "gr" ? "selected" : ""}>gr</option>
          <option value="ml" ${det && det.unit === "ml" ? "selected" : ""}>ml</option>
          <option value="pcs" ${det && det.unit === "pcs" ? "selected" : ""}>pcs</option>
        </select>
        <button class="btn btn-sm btn-primary" data-savesat>Simpan</button>
      </div>
    </div>`;
  warn.querySelector("[data-perpcs]").addEventListener("click", () => simpanKonversi(b, i, 1, "pcs"));
  warn.querySelector("[data-savesat]").addEventListener("click", () => {
    const isi = parseFloat(warn.querySelector("[data-isi]").value);
    const unit = warn.querySelector("[data-unit]").value;
    simpanKonversi(b, i, isi, unit);
  });
}

function renderOpex(){
  const el = $("#f-opex");
  el.innerHTML = formOpex.map((o, i) => `
    <div class="opex-row" data-i="${i}">
      <div class="opex-grid">
        <input type="text" placeholder="mis. Gas, listrik" value="${esc(o.label)}" data-act="label">
        <div class="mode-toggle">
          <button data-mode="manual" class="${o.mode === "manual" ? "active" : ""}">Rp</button>
          <button data-mode="persen" class="${o.mode === "persen" ? "active" : ""}">%</button>
        </div>
        <input type="number" min="0" value="${o.value}" data-act="value">
        <span class="opex-hasil" data-hasil>Rp 0</span>
        <button class="icon-btn" data-act="rm" aria-label="Hapus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
      ${o.mode === "persen" ? '<div class="opex-note">% dari HPP material</div>' : ""}
    </div>`).join("");
  $all(".opex-row", el).forEach(row => {
    const i = +row.dataset.i;
    row.querySelector('[data-act="label"]').addEventListener("input", (e) => { formOpex[i].label = e.target.value; });
    row.querySelector('[data-act="value"]').addEventListener("input", (e) => { formOpex[i].value = parseFloat(e.target.value) || 0; recalc(); });
    row.querySelector('[data-act="rm"]').addEventListener("click", () => { formOpex.splice(i, 1); renderOpex(); recalc(); });
    $all("[data-mode]", row).forEach(btn => btn.addEventListener("click", () => { formOpex[i].mode = btn.dataset.mode; formOpex[i].value = btn.dataset.mode === "persen" ? 10 : 0; renderOpex(); recalc(); }));
  });
}

function calcMaterial(){
  let total = 0;
  formBahan.forEach((b, idx) => {
    const sub = effPrice(b) * (b.qty || 0);
    total += sub;
    const row = $(`.bahan-row[data-i="${idx}"] [data-sub]`);
    if (row) row.textContent = rp(sub);
  });
  return total;
}
function calcOpex(material){
  let total = 0;
  formOpex.forEach((o, idx) => {
    const nominal = o.mode === "persen" ? (o.value / 100) * material : o.value;
    total += nominal;
    const h = $(`.opex-row[data-i="${idx}"] [data-hasil]`);
    if (h) h.textContent = rp(nominal);
  });
  return total;
}
function recalc(){
  const material = calcMaterial();
  const opex = calcOpex(material);
  const overhead = (formOverheadPersen / 100) * (material + opex);
  const final = material + opex + overhead;
  const harga = formMargin < 100 ? final / (1 - formMargin / 100) : final;
  $("#s-material") && ($("#s-material").textContent = rp(material));
  $("#s-overhead") && ($("#s-overhead").textContent = rp(overhead));
  $("#s-opex") && ($("#s-opex").textContent = rp(opex));
  $("#s-final") && ($("#s-final").textContent = rp(final));
  $("#s-harga") && ($("#s-harga").textContent = rp(harga));
  const selEl = $("#s-selisih");
  if (selEl){
    if (formHargaAktual === null || formHargaAktual === undefined){
      selEl.style.display = "none";
    } else {
      const selisih = Math.round(formHargaAktual - harga);
      selEl.style.display = "block";
      selEl.className = "bmm-hasil" + (selisih !== 0 ? " filled" : "");
      selEl.innerHTML = selisih === 0
        ? "Sama dengan harga disarankan"
        : `<b>${selisih > 0 ? "+" : "-"}${rp(Math.abs(selisih))}</b> ${selisih > 0 ? "di atas" : "di bawah"} harga disarankan (${rp(harga)})`;
    }
  }
  return { material, overhead, opex, final, harga };
}

async function saveProduk(){
  const nama = $("#f-nama").value.trim();
  if (!nama){ toast("Nama produk wajib diisi"); return; }
  if (!formBahan.length){ toast("Tambahkan minimal satu bahan"); return; }
  const cabang_hpp_id = $("#f-cabang") ? $("#f-cabang").value : null;
  const calc = recalc();

  const produkRow = {
    nama,
    jenis: "fnb",
    kategori_id: formKategoriId || null,
    cabang_hpp_id: cabang_hpp_id || null,
    overhead_persen: formOverheadPersen,
    target_margin_persen: formMargin,
    hpp_terakhir: Math.round(calc.final),
    harga_jual_disarankan: Math.round(calc.harga),
    harga_jual_aktual: (formHargaAktual !== null && formHargaAktual !== undefined) ? Math.round(formHargaAktual) : null,
    cara_proses: JSON.stringify(formProses.filter(s => s.teks.trim())),
    updated_at: new Date().toISOString(),
  };

  let produkId = editingProdukId;
  const isEdit = !!editingProdukId;
  if (editingProdukId){
    const { error } = await sb.from("produk").update(produkRow).eq("id", editingProdukId);
    if (error){ toast("Gagal menyimpan"); console.error(error); return; }
    await sb.from("resep_bahan").delete().eq("produk_id", editingProdukId);
    await sb.from("biaya_operasional_produk").delete().eq("produk_id", editingProdukId);
  } else {
    const { data, error } = await sb.from("produk").insert(produkRow).select("id").single();
    if (error){ toast("Gagal menyimpan"); console.error(error); return; }
    produkId = data.id;
  }

  const resepRows = formBahan.map(b => ({
    produk_id: produkId, bahan_nama_normal: b.nama_normal, sumber_bahan: b.sumber,
    qty_pakai: b.qty || 0, harga_override: b.override,
  }));
  if (resepRows.length) await sb.from("resep_bahan").insert(resepRows);

  const opexRows = formOpex.filter(o => o.label.trim() || o.value).map(o => ({
    produk_id: produkId, label: o.label || "Biaya", mode: o.mode, value: o.value || 0,
  }));
  if (opexRows.length) await sb.from("biaya_operasional_produk").insert(opexRows);

  await catatLog(produkId, nama, isEdit ? "edit" : "buat",
    `HPP ${rp(calc.final)}, harga jual ${rp(calc.harga)}, margin ${formMargin}%`);

  // rekam riwayat HPP
  await sb.from("produk_hpp_history").insert({
    produk_id: produkId, hpp: Math.round(calc.final),
    harga_jual: Math.round(calc.harga), margin_persen: formMargin,
  });

  hapusDraft();
  toast(isEdit ? "Perubahan disimpan" : "Produk disimpan");
  await loadProduk();
  switchTab("list");
}

async function openEdit(id){
  const p = produkList.find(x => x.id === id); if (!p) return;
  editingProdukId = id;
  formOverheadPersen = Number(p.overhead_persen) || 15;
  formMargin = Number(p.target_margin_persen) || 60;
  formHargaAktual = (p.harga_jual_aktual !== null && p.harga_jual_aktual !== undefined) ? Number(p.harga_jual_aktual) : null;

  const { data: reseps } = await sb.from("resep_bahan").select("*").eq("produk_id", id);
  const { data: opexs } = await sb.from("biaya_operasional_produk").select("*").eq("produk_id", id);

  formBahan = (reseps || []).map(r => {
    const found = allBahan().find(b => b.nama_normal === r.bahan_nama_normal);
    return {
      nama: found ? found.nama : r.bahan_nama_normal,
      nama_normal: r.bahan_nama_normal,
      harga: found ? found.harga : 0,
      sumber: r.sumber_bahan || (found ? found.sumber : "acuan"),
      konv: found && found.konv ? { ...found.konv } : (konversiMap[r.bahan_nama_normal] || null),
      qty: Number(r.qty_pakai) || 0,
      override: r.harga_override !== null && r.harga_override !== undefined ? Number(r.harga_override) : null,
      hargaBeliOverride: null,
    };
  });
  formOpex = (opexs || []).map(o => ({ label: o.label, mode: o.mode, value: Number(o.value) || 0 }));
  formKategoriId = p.kategori_id || "";
  try{ formProses = p.cara_proses ? JSON.parse(p.cara_proses) : []; }catch(e){ formProses = []; }
  if (!Array.isArray(formProses)) formProses = [];

  switchTab("add");
  renderAddView();
  $("#f-nama").value = p.nama;
  if ($("#f-cabang") && p.cabang_hpp_id) $("#f-cabang").value = p.cabang_hpp_id;
  renderKatTingkat();
  recalc();
}

async function deleteProduk(){
  if (!editingProdukId) return;
  if (!confirm("Hapus produk ini? Resep dan biayanya ikut terhapus.")) return;
  const p = produkList.find(x => x.id === editingProdukId);
  const { error } = await sb.from("produk").update({ is_deleted: true }).eq("id", editingProdukId);
  if (error){ toast("Gagal menghapus"); return; }
  await catatLog(editingProdukId, p ? p.nama : "", "hapus", "");
  toast("Produk dihapus");
  await loadProduk();
  switchTab("list");
}

// ---------------------------------------------------------------------
//  TABS
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
//  DASHBOARD ANALISIS
// ---------------------------------------------------------------------
function marginProduk(p){
  const h = Number(p.harga_jual_disarankan);
  return h > 0 ? (h - Number(p.hpp_terakhir)) / h * 100 : null;
}
function statusProduk(p){
  if (produkBelumDiisi(p)) return "belum";
  const m = marginProduk(p);
  if (m == null) return "belum";
  if (m < 0) return "rugi";
  if (m < 50) return "tipis";
  return "sehat";
}
function donutSvg(sehat, tipis, rugi, size){
  const total = sehat + tipis + rugi;
  const r = size/2 - 10, cx = size/2, cy = size/2, C = 2 * Math.PI * r;
  if (!total) return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--line)" stroke-width="14"/><text x="${cx}" y="${cy+4}" text-anchor="middle" font-size="12" fill="var(--ink-faint)">0</text></svg>`;
  const segs = [["#1E7D46", sehat], ["var(--amber)", tipis], ["var(--red)", rugi]];
  let off = 0, arcs = "";
  segs.forEach(([col, val]) => {
    if (!val) return;
    const len = val / total * C;
    arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="14" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"/>`;
    off += len;
  });
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${arcs}
    <text x="${cx}" y="${cy-2}" text-anchor="middle" font-size="26" font-weight="800" fill="var(--ink)">${total}</text>
    <text x="${cx}" y="${cy+16}" text-anchor="middle" font-size="10" fill="var(--ink-faint)">PRODUK</text></svg>`;
}
function barChartSvg(rows, maxVal){
  const max = maxVal || Math.max(1, ...rows.map(r => r.val));
  return `<div class="bar-chart">` + rows.map(r => `
    <div class="bar-row">
      <div class="bar-label">${esc(r.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(r.val/max*100)}%;background:${r.col||"var(--green)"}"></div></div>
      <div class="bar-val">${r.val}</div>
    </div>`).join("") + `</div>`;
}

function renderDashboard(){
  const v = $("#viewDash");
  if (!v) return;
  const basis = produkFokus();
  const total = basis.length;
  const terisi = basis.filter(p => !produkBelumDiisi(p));
  const belum = total - terisi.length;
  let sehat=0, tipis=0, rugi=0;
  terisi.forEach(p => { const s = statusProduk(p); if (s==="sehat") sehat++; else if (s==="tipis") tipis++; else if (s==="rugi") rugi++; });
  const margins = terisi.map(marginProduk).filter(m => m != null);
  const avgMargin = margins.length ? Math.round(margins.reduce((a,b)=>a+b,0)/margins.length) : 0;
  const cabFokusNama = filterCabangId ? (cabangList.find(c => c.id === filterCabangId) || {}).nama : "";

  const perCabang = cabangList.map(c => {
    const prods = produkList.filter(p => p.cabang_hpp_id === c.id);
    const ter = prods.filter(p => !produkBelumDiisi(p));
    const mgs = ter.map(marginProduk).filter(m => m!=null);
    let cs=0,ct=0,cr=0; ter.forEach(p=>{const s=statusProduk(p); if(s==="sehat")cs++;else if(s==="tipis")ct++;else if(s==="rugi")cr++;});
    return { id: c.id, nama: c.nama, total: prods.length, terisi: ter.length,
      avgMargin: mgs.length ? Math.round(mgs.reduce((a,b)=>a+b,0)/mgs.length) : null,
      sehat: cs, tipis: ct, rugi: cr };
  });
  const tanpaCab = produkList.filter(p => !p.cabang_hpp_id);
  if (tanpaCab.length){
    const ter = tanpaCab.filter(p => !produkBelumDiisi(p));
    const mgs = ter.map(marginProduk).filter(m=>m!=null);
    let cs=0,ct=0,cr=0; ter.forEach(p=>{const s=statusProduk(p);if(s==="sehat")cs++;else if(s==="tipis")ct++;else if(s==="rugi")cr++;});
    perCabang.push({ id:"", nama:"Tanpa cabang", total:tanpaCab.length, terisi:ter.length, avgMargin: mgs.length?Math.round(mgs.reduce((a,b)=>a+b,0)/mgs.length):null, sehat:cs,tipis:ct,rugi:cr });
  }

  const rootId = katRootFnb();
  const katRows = katChildren(rootId).map(k => ({ label: k.nama, val: countProdukInKat(k.id), col: "var(--green)" }));

  const untung = [...terisi].sort((a,b)=>(Number(b.harga_jual_disarankan)-Number(b.hpp_terakhir))-(Number(a.harga_jual_disarankan)-Number(a.hpp_terakhir))).slice(0,5);
  const rugiList = [...terisi].filter(p=>marginProduk(p)<0).sort((a,b)=>marginProduk(a)-marginProduk(b)).slice(0,5);

  v.innerHTML = `
    <div class="dash-hero">
      <div class="dash-hero-clip">
        <div class="dash-hero-grid"></div>
        <div class="dash-hero-glow"></div>
      </div>
      <div class="dash-hero-inner">
        <div style="position:relative;z-index:1;">
          <div class="menu-hero-badge"><span class="dot"></span> ${cabFokusNama ? "Fokus Cabang" : "Ringkasan Analisis"}</div>
          <h1 class="dash-hero-title">${cabFokusNama ? esc(cabFokusNama) : "Dashboard HPP Elio"}</h1>
          <p class="dash-hero-sub">${cabFokusNama ? "Ringkasan performa produk &amp; margin cabang ini." : "Ringkasan performa produk &amp; margin seluruh cabang."}</p>
        </div>
        <div class="hero-cab"></div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi clickable" data-dash="total"><div class="kpi-ic" style="background:var(--green-light);color:var(--green)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v18H3zM3 9h18M9 21V9"/></svg></div><div><div class="kpi-v">${total}</div><div class="kpi-l">Total produk</div></div></div>
      <div class="kpi clickable" data-dash="terisi"><div class="kpi-ic" style="background:var(--green-light);color:#1E7D46"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg></div><div><div class="kpi-v">${terisi.length}<span class="kpi-sub">/${total}</span></div><div class="kpi-l">Sudah diisi</div></div></div>
      <div class="kpi clickable" data-dash="margin"><div class="kpi-ic" style="background:${avgMargin>=50?'var(--green-light)':avgMargin<0?'var(--red-light)':'var(--amber-light)'};color:${avgMargin>=50?'#1E7D46':avgMargin<0?'var(--red)':'var(--amber)'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18M7 14l4-4 3 3 5-6"/></svg></div><div><div class="kpi-v">${avgMargin}%</div><div class="kpi-l">Rata-rata margin</div></div></div>
      <div class="kpi clickable" data-dash="rugi"><div class="kpi-ic" style="background:${rugi?'var(--red-light)':'var(--green-light)'};color:${rugi?'var(--red)':'#1E7D46'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h16.9a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg></div><div><div class="kpi-v">${rugi}</div><div class="kpi-l">Produk rugi</div></div></div>
    </div>

    <div class="dash-2col">
      <div class="card">
        <h2><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6 3"/></svg>Kesehatan margin</h2>
        <div class="donut-wrap">
          ${donutSvg(sehat, tipis, rugi, 150)}
          <div class="donut-legend">
            <div><span class="dl-dot" style="background:#1E7D46"></span>Sehat <b>${sehat}</b></div>
            <div><span class="dl-dot" style="background:var(--amber)"></span>Margin tipis <b>${tipis}</b></div>
            <div><span class="dl-dot" style="background:var(--red)"></span>Rugi <b>${rugi}</b></div>
            <div><span class="dl-dot" style="background:var(--line-strong)"></span>Belum diisi <b>${belum}</b></div>
          </div>
        </div>
      </div>
      <div class="card">
        <h2><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18M7 16l4-4 3 3 5-6"/></svg>Produk per kategori</h2>
        ${katRows.some(r=>r.val) ? barChartSvg(katRows) : '<div class="empty" style="padding:20px;">Belum ada data.</div>'}
      </div>
    </div>

    ${filterCabangId ? "" : `<div class="card">
      <h2><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l7-4 7 4v14"/></svg>Ringkasan per cabang</h2>
      <div class="cabang-grid">
        ${perCabang.map(c => `
          <div class="cabang-card clickable" data-dash="cabang" data-cab="${esc(c.id || "")}">
            <div class="cc-head">
              <span class="cc-nama">${esc(c.nama)}</span>
              ${c.avgMargin!=null ? `<span class="cc-margin ${c.avgMargin>=50?'good':c.avgMargin<0?'bad':'mid'}">${c.avgMargin}%</span>` : `<span class="cc-margin mid" style="opacity:.5">—</span>`}
            </div>
            <div class="cc-sub">${c.terisi}/${c.total} produk terisi</div>
            <div class="cc-bar">
              ${c.terisi ? `
                ${c.sehat?`<span style="flex:${c.sehat};background:#1E7D46" title="${c.sehat} sehat"></span>`:""}
                ${c.tipis?`<span style="flex:${c.tipis};background:var(--amber)" title="${c.tipis} tipis"></span>`:""}
                ${c.rugi?`<span style="flex:${c.rugi};background:var(--red)" title="${c.rugi} rugi"></span>`:""}
              ` : `<span style="flex:1;background:var(--line)"></span>`}
            </div>
            <div class="cc-legend"><span>${c.sehat} sehat</span><span>${c.tipis} tipis</span><span>${c.rugi} rugi</span></div>
          </div>`).join("")}
      </div>
    </div>`}

    <div class="dash-2col">
      <div class="card">
        <h2><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 7 7 .5-5.5 4.5L18 21l-6-4-6 4 1.5-7L2 9.5 9 9z"/></svg>Paling untung</h2>
        ${untung.length ? untung.map((p,i)=>`<div class="lead-row clickable" data-open="${esc(p.id)}"><span class="lead-no">${i+1}</span><span class="lead-nm">${esc(p.nama)}</span><span class="lead-v good">${rp(Number(p.harga_jual_disarankan)-Number(p.hpp_terakhir))}</span></div>`).join("") : '<div class="empty" style="padding:20px;">Belum ada produk terisi.</div>'}
      </div>
      <div class="card">
        <h2><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h16.9a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>Perlu perhatian (rugi)</h2>
        ${rugiList.length ? rugiList.map((p,i)=>`<div class="lead-row clickable" data-open="${esc(p.id)}"><span class="lead-no bad">${i+1}</span><span class="lead-nm">${esc(p.nama)}</span><span class="lead-v bad">${Math.round(marginProduk(p))}%</span></div>`).join("") : '<div class="empty" style="padding:20px;">Tidak ada produk rugi.</div>'}
      </div>
    </div>`;

  // pasang interaksi klik
  renderCabangDropdown();
  $all("[data-dash]", v).forEach(card => card.addEventListener("click", () => {
    const t = card.dataset.dash;
    if (t === "total") openDashDetail("Semua produk", produkList);
    else if (t === "terisi") openDashDetail("Produk sudah diisi", terisi);
    else if (t === "margin") openDashDetail("Margin per produk", [...terisi].sort((a,b)=>(marginProduk(b)||0)-(marginProduk(a)||0)));
    else if (t === "rugi") openDashDetail("Produk rugi", produkList.filter(p=>statusProduk(p)==="rugi"));
    else if (t === "cabang"){
      const cid = card.dataset.cab;
      const nama = cid ? (cabangList.find(c=>c.id===cid)||{}).nama : "Tanpa cabang";
      openDashDetail("Cabang: " + (nama||"—"), produkList.filter(p => cid ? p.cabang_hpp_id===cid : !p.cabang_hpp_id));
    }
  }));
  $all("[data-open]", v).forEach(row => row.addEventListener("click", () => openEdit(row.dataset.open)));
}

function openDashDetail(judul, list){
  let modal = $("#dashModal");
  if (!modal){
    modal = document.createElement("div");
    modal.id = "dashModal";
    modal.className = "dash-modal hidden";
    modal.innerHTML = `<div class="dm-backdrop"></div><div class="dm-panel"><div class="dm-head"><h3 id="dmJudul"></h3><button class="icon-btn" id="dmClose" aria-label="Tutup"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div><div class="dm-body" id="dmBody"></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector(".dm-backdrop").addEventListener("click", tutupDashDetail);
    modal.querySelector("#dmClose").addEventListener("click", tutupDashDetail);
  }
  $("#dmJudul").textContent = judul;
  const body = $("#dmBody");
  if (!list.length){ body.innerHTML = '<div class="empty" style="padding:30px;">Tidak ada produk.</div>'; }
  else {
    body.innerHTML = list.map(p => {
      const belum = produkBelumDiisi(p);
      const st = belum ? null : statusFromMargin(Number(p.hpp_terakhir), Number(p.harga_jual_disarankan));
      const m = marginProduk(p);
      const cab = cabangList.find(c => c.id === p.cabang_hpp_id);
      const kat = p.kategori_id ? katPathNoRoot(p.kategori_id) : "";
      return `<div class="dm-row" data-open="${esc(p.id)}">
        <div class="dm-nm">${esc(p.nama)}<span class="dm-meta">${kat ? esc(kat) : ""}${cab ? " · " + esc(cab.nama) : ""}</span></div>
        ${belum
          ? '<span class="status-pill status-belum">Belum diisi</span>'
          : `<div class="dm-nums"><span>${rp(p.hpp_terakhir)}</span><span class="dm-mg ${st?st.cls:""}">${m!=null?Math.round(m)+"%":"—"}</span></div>`}
      </div>`;
    }).join("");
    $all(".dm-row", body).forEach(r => r.addEventListener("click", () => { tutupDashDetail(); openEdit(r.dataset.open); }));
  }
  modal.classList.remove("hidden");
  requestAnimationFrame(() => modal.classList.add("show"));
}
function tutupDashDetail(){
  const modal = $("#dashModal");
  if (!modal) return;
  modal.classList.remove("show");
  setTimeout(() => modal.classList.add("hidden"), 200);
}

function switchTab(tab){
  currentTab = tab;
  $("#tabDash") && $("#tabDash").classList.toggle("active", tab === "dash");
  $("#tabList").classList.toggle("active", tab === "list");
  $("#tabAdd").classList.toggle("active", tab === "add");
  $("#tabKelola").classList.toggle("active", tab === "kelola");
  $("#viewDash") && $("#viewDash").classList.toggle("hidden", tab !== "dash");
  $("#viewList").classList.toggle("hidden", tab !== "list");
  $("#viewAdd").classList.toggle("hidden", tab !== "add");
  $("#viewKelola").classList.toggle("hidden", tab !== "kelola");
  // hero & layout 2 kolom hanya di tab produk/tambah/kelola, bukan dashboard
  const hero = $("#prodHero"); if (hero) hero.style.display = tab === "list" ? "" : "none";
  const layout = document.querySelector("#fnbSection .app-layout"); if (layout) layout.style.display = tab === "dash" ? "none" : "";
  if (tab === "add" && !editingProdukId) newForm();
  if (tab === "kelola") renderKelola();
  else if (tab === "dash") renderDashboard();
  else renderSidebar();
}
$("#tabDash") && $("#tabDash").addEventListener("click", () => switchTab("dash"));
$("#tabList").addEventListener("click", () => switchTab("list"));
$("#tabAdd").addEventListener("click", () => { editingProdukId = null; switchTab("add"); });
$("#tabKelola").addEventListener("click", () => switchTab("kelola"));

// ---------------------------------------------------------------------
//  KELOLA: kategori, cabang, log
// ---------------------------------------------------------------------
let kelolaSub = "kategori";
function renderKelola(){
  const v = $("#viewKelola");
  v.innerHTML = `
    <div class="sub-hero">
      <div class="sub-hero-clip"><div class="sub-hero-grid"></div><div class="sub-hero-glow"></div></div>
      <div class="sub-hero-inner">
        <div class="sub-hero-ic">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        </div>
        <div>
          <div class="sub-hero-badge"><span class="dot"></span> Pengaturan</div>
          <h1 class="sub-hero-title">Kelola</h1>
          <p class="sub-hero-sub">Atur kategori, material kondimen, cabang, dan lihat log perubahan.</p>
        </div>
      </div>
    </div>
    <div id="kelola-body"></div>`;
  renderSidebar();
  renderKelolaBody();
}
function renderKelolaBody(){
  if (!$("#kelola-body")) return;
  if (kelolaSub === "kategori") renderKelolaKategori();
  else if (kelolaSub === "kondimen") renderKelolaKondimen();
  else if (kelolaSub === "cabang") renderKelolaCabang();
  else renderKelolaLog();
}

function renderKelolaKategori(){
  const body = $("#kelola-body");
  function treeHtml(parentId, depth){
    const anak = katChildren(parentId);
    return anak.map(k => `
      <div style="padding-left:${depth * 16}px;display:flex;align-items:center;gap:8px;padding-top:6px;padding-bottom:6px;border-bottom:1px solid var(--line);">
        <span style="flex:1;font-size:14px;${depth === 0 ? "font-weight:700;" : ""}">${depth > 0 ? "› " : ""}${esc(k.nama)}</span>
        ${k.level < 3 ? `<button class="btn btn-sm" data-add-sub="${k.id}" style="font-size:11px;">+ sub</button>` : ""}
        <button class="icon-btn" data-edit-kat="${k.id}" aria-label="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg></button>
        <button class="icon-btn" data-del-kat="${k.id}" aria-label="Hapus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
      ${treeHtml(k.id, depth + 1)}`).join("");
  }
  body.innerHTML = `
    <div class="card">
      <h2>Kategori</h2>
      <div style="margin-bottom:12px;">${kategoriList.length ? treeHtml(null, 0) : '<div class="empty" style="padding:16px;">Belum ada kategori.</div>'}</div>
      <button class="btn btn-primary btn-sm" id="add-root-kat">+ Tambah kategori utama</button>
    </div>`;
  $("#add-root-kat").addEventListener("click", () => tambahKategori(null));
  $all("[data-add-sub]", body).forEach(b => b.addEventListener("click", () => tambahKategori(b.dataset.addSub)));
  $all("[data-edit-kat]", body).forEach(b => b.addEventListener("click", () => editKategori(b.dataset.editKat)));
  $all("[data-del-kat]", body).forEach(b => b.addEventListener("click", () => hapusKategori(b.dataset.delKat)));
}
async function tambahKategori(parentId){
  // level dihitung otomatis dari induk (induk.level + 1); root = level 1
  const induk = parentId ? kategoriList.find(k => k.id === parentId) : null;
  const level = induk ? induk.level + 1 : 1;
  if (level > 3){ toast("Maksimal 3 tingkat kategori"); return; }
  const nama = prompt(`Nama ${level === 1 ? "kategori utama" : "sub-kategori"}${induk ? " di bawah " + induk.nama : ""}:`, ""); if (!nama) return;
  // urutan: taruh di akhir daftar sesama level & induk
  const sesama = katChildren(parentId);
  const urutan = sesama.length ? Math.max(...sesama.map(s => s.urutan || 0)) + 1 : (level === 1 ? 0 : 1);
  const { error } = await sb.from("kategori_produk").insert({ nama: nama.trim(), parent_id: parentId, level, urutan });
  if (error){ toast("Gagal menambah"); return; }
  await loadKategori(); renderKelolaKategori(); toast("Kategori ditambah");
}
async function editKategori(id){
  const k = kategoriList.find(x => x.id === id); if (!k) return;
  const nama = prompt("Ubah nama kategori:", k.nama); if (!nama) return;
  await sb.from("kategori_produk").update({ nama: nama.trim(), updated_at: new Date().toISOString() }).eq("id", id);
  await loadKategori(); renderKelolaKategori(); toast("Kategori diubah");
}
async function hapusKategori(id){
  if (!confirm("Hapus kategori ini beserta sub-kategorinya?")) return;
  await sb.from("kategori_produk").update({ is_deleted: true }).eq("id", id);
  // tandai anak juga
  const markChildren = async (pid) => { for (const c of katChildren(pid)){ await sb.from("kategori_produk").update({ is_deleted: true }).eq("id", c.id); await markChildren(c.id); } };
  await markChildren(id);
  await loadKategori(); renderKelolaKategori(); toast("Kategori dihapus");
}

// ===== KONDIMEN =====
let kondimenEdit = null;
// true kalau editor kondimen sedang dirender di dalam popup (dipanggil dari
// tombol "★ Kelola Kondimen" di popup pilih-bahan Tambah Produk), bukan di
// halaman Kelola biasa — dipakai renderKondimenEditor()/simpanKondimen() buat
// tahu harus balik ke mana setelah selesai. Lihat bukaKondimenQuickModal().
let kondimenQuickMode = false;

function bukaKondimenQuickModal(){
  let modal = $("#kondimenQuickModal");
  if (!modal){
    modal = document.createElement("div");
    modal.id = "kondimenQuickModal";
    modal.className = "dash-modal hidden";
    modal.innerHTML = `<div class="dm-backdrop"></div>
      <div class="dm-panel" style="max-width:480px;">
        <div class="dm-head"><h3>★ Kondimen Baru</h3><button class="icon-btn" id="kqmClose" aria-label="Tutup"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
        <div class="dm-body" id="kqmBody"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector(".dm-backdrop").addEventListener("click", tutupKondimenQuickModal);
    modal.querySelector("#kqmClose").addEventListener("click", tutupKondimenQuickModal);
  }
  kondimenQuickMode = true;
  kondimenEdit = { nama: "", satuan_hasil: "gr", total_hasil: 1000, bahan: [] };
  // renderKondimenEditor() pakai id global (#k-nama dkk) bukan discope ke body
  // parameter-nya — kosongkan #kelola-body dulu supaya tidak ada id bentrok
  // kalau kebetulan masih ada sisa render dari kunjungan sebelumnya ke tab Kelola.
  const kelolaBody = $("#kelola-body");
  if (kelolaBody) kelolaBody.innerHTML = "";
  renderKondimenEditor($("#kqmBody"));
  modal.classList.remove("hidden");
  requestAnimationFrame(() => modal.classList.add("show"));
}
function tutupKondimenQuickModal(){
  const modal = $("#kondimenQuickModal");
  if (modal){
    modal.classList.remove("show");
    setTimeout(() => modal.classList.add("hidden"), 200);
  }
  kondimenQuickMode = false;
  kondimenEdit = null;
}

function renderKelolaKondimen(){
  const body = $("#kelola-body");
  if (kondimenEdit){ renderKondimenEditor(body); return; }
  body.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <h2 style="margin:0;">Material Kondimen</h2>
        <button class="btn btn-primary btn-sm" id="k-add">+ Buat kondimen</button>
      </div>
      <p style="font-size:12px;color:var(--ink-faint);margin:0 0 14px;">Bahan setengah jadi (saus, marinasi, sambal) yang dihitung sekali, lalu dipakai di banyak menu. Muncul di pencarian bahan menu dengan tanda ★.</p>
      ${kondimenList.length ? kondimenList.map(k => `
        <div class="prod-item" data-k="${k.id}" style="cursor:pointer;">
          <div class="top"><span class="pnm">★ ${esc(k.nama)}</span><span class="meta">${k.total_hasil} ${esc(k.satuan_hasil)}</span></div>
          <div class="nums">
            <div><div class="num-lbl">HPP total</div><div class="num-val">${rp(k.hpp_total)}</div></div>
            <div><div class="num-lbl">Per ${esc(k.satuan_hasil)}</div><div class="num-val hl">${k.hpp_per_satuan.toFixed(2)}</div></div>
            <button class="prod-dup" data-kdel="${k.id}" title="Hapus"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
          </div>
        </div>`).join("") : `<div class="empty-rich"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2 5 5 .5-4 3.5 1 5-4-2.5L8 19l1-5-4-3.5 5-.5z"/></svg></div><h3>Belum ada kondimen</h3><p>Buat saus, marinasi, atau sambal pertama Anda.</p></div>`}
    </div>`;
  $("#k-add").addEventListener("click", () => { kondimenEdit = { nama:"", satuan_hasil:"gr", total_hasil:1000, bahan:[] }; renderKelolaKondimen(); });
  $all("[data-k]", body).forEach(it => it.addEventListener("click", (e) => {
    if (e.target.closest("[data-kdel]")) return;
    bukaKondimen(it.dataset.k);
  }));
  $all("[data-kdel]", body).forEach(b => b.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm("Hapus kondimen ini?")) return;
    await sb.from("kondimen").update({ is_deleted: true }).eq("id", b.dataset.kdel);
    await loadKondimen(); renderKelolaKondimen(); toast("Kondimen dihapus");
  }));
}

async function bukaKondimen(id){
  const k = kondimenList.find(x => x.id === id); if (!k) return;
  const { data: bahan } = await sb.from("kondimen_bahan").select("*").eq("kondimen_id", id);
  kondimenEdit = {
    id: k.id, nama: k.nama, satuan_hasil: k.satuan_hasil, total_hasil: k.total_hasil,
    bahan: (bahan || []).map(b => {
      const found = allBahan().find(x => x.nama_normal === b.bahan_nama_normal);
      return {
        nama: b.bahan_nama || (found ? found.nama : b.bahan_nama_normal),
        nama_normal: b.bahan_nama_normal, sumber: b.sumber_bahan,
        harga: found ? found.harga : 0,
        // Sama seperti di show()/renderKondimenBahan(): jangan default ke
        // {isi:1,...} kalau memang belum ada konversi tersimpan atau
        // ke-detect dari bahan acuan saat ini — biarkan null supaya
        // renderKondimenBahan() menampilkan "Lengkapi satuan", bukan diam-diam
        // salah hitung.
        konv: b.isi_kemasan ? { isi: Number(b.isi_kemasan), unit: b.satuan || "gr" } : (found && found.konv ? found.konv : null),
        qty: Number(b.qty_pakai) || 0, override: b.harga_override,
      };
    }),
  };
  renderKelolaKondimen();
}

function hitungKondimenHpp(){
  let total = 0;
  kondimenEdit.bahan.forEach(b => {
    // b.konv null = belum lengkap satuannya -> jangan ikut dihitung sama
    // sekali (dulu diam-diam pakai b.harga mentah, sama bug-nya seperti di
    // renderKondimenBahan: harga per kemasan besar kehitung seolah per gram).
    if (!b.konv) return;
    const perUnit = (b.override != null) ? b.override : b.harga / (b.konv.isi || 1);
    total += perUnit * (b.qty || 0);
  });
  const per = kondimenEdit.total_hasil > 0 ? total / kondimenEdit.total_hasil : 0;
  return { total, per };
}

function renderKondimenEditor(body){
  const e = kondimenEdit;
  const calc = hitungKondimenHpp();
  body.innerHTML = `
    <div class="card">
      <button class="btn btn-sm" id="k-back" style="margin-bottom:12px;">← Kembali</button>
      <div class="field"><label>Nama kondimen</label><input type="text" id="k-nama" value="${esc(e.nama)}" placeholder="Saus Bolognese"></div>
      <div class="field-row">
        <div class="field"><label>Total hasil</label><input type="number" id="k-total" value="${e.total_hasil}"></div>
        <div class="field"><label>Satuan</label><input type="text" id="k-satuan" value="${esc(e.satuan_hasil)}" placeholder="gr / ml"></div>
      </div>
    </div>
    <div class="card" style="position:relative;z-index:5;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h2 style="margin:0;">Bahan penyusun</h2>
        <button class="btn btn-sm" id="k-add-manual">+ Bahan manual</button>
      </div>
      <div class="search-wrap">
        <div class="search-input">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
          <input type="text" id="k-cari" placeholder="Cari & tambah bahan" autocomplete="off">
        </div>
        <div class="search-results hidden" id="k-hasil"></div>
      </div>
      <div id="k-bahan"></div>
    </div>
    <div class="card">
      <div class="sum-line sum-final"><span class="lbl">HPP total (${e.total_hasil} ${esc(e.satuan_hasil)})</span><span class="amt" id="k-hpp-total">${rp(calc.total)}</span></div>
      <div class="price-box"><span class="lbl">HPP per ${esc(e.satuan_hasil)}</span><span class="amt" id="k-hpp-per">${calc.per.toFixed(2)}</span></div>
      <button class="btn btn-primary btn-block" id="k-simpan">Simpan Kondimen</button>
    </div>`;

  $("#k-back").addEventListener("click", () => { if (kondimenQuickMode) tutupKondimenQuickModal(); else { kondimenEdit = null; renderKelolaKondimen(); } });
  $("#k-nama").addEventListener("input", (ev) => e.nama = ev.target.value);
  $("#k-total").addEventListener("input", (ev) => { e.total_hasil = parseFloat(ev.target.value) || 0; refreshKondimenHpp(); });
  $("#k-satuan").addEventListener("input", (ev) => e.satuan_hasil = ev.target.value);
  $("#k-simpan").addEventListener("click", simpanKondimen);
  $("#k-add-manual").addEventListener("click", () => bukaBahanManualModal("", "kondimen"));

  const cari = $("#k-cari"), hasil = $("#k-hasil");
  const sumberBahan = () => allBahan().filter(b => b.sumber !== "kondimen");
  function show(q){
    const list = sumberBahan();
    const f = q ? list.filter(b => b.nama.toLowerCase().includes(q.toLowerCase())) : list;
    let html = f.slice(0, 10).map(b => `<div class="search-item" data-nn="${esc(b.nama_normal)}">${bahanInfoHtml(b)}</div>`).join("");
    html += `<div class="search-item add-new" data-kadd="1"><span>+ Tidak ketemu? Tambah bahan manual</span></div>`;
    hasil.innerHTML = html;
    hasil.classList.remove("hidden");
    $all(".search-item", hasil).forEach(it => it.addEventListener("click", () => {
      if (it.dataset.kadd){
        const q2 = cari.value.trim();
        cari.value = ""; hasil.classList.add("hidden");
        bukaBahanManualModal(q2, "kondimen");
        return;
      }
      const b = sumberBahan().find(x => x.nama_normal === it.dataset.nn);
      if (b && !e.bahan.some(x => x.nama_normal === b.nama_normal)){
        // konv:null (BUKAN default {isi:1,unit:"gr"}) kalau belum ada konversi —
        // defaultnya lama diam-diam menganggap "isi 1 gram", jadi bahan yang
        // dijual per kemasan besar (mis. beras 25kg) keitung harganya per gram
        // padahal itu masih harga per karung. renderKondimenBahan() di bawah
        // yang menampilkan peringatan "Lengkapi satuan" kalau konv null.
        e.bahan.push({ nama: b.nama, nama_normal: b.nama_normal, harga: b.harga, sumber: b.sumber, konv: b.konv ? {...b.konv} : null, qty: 0, override: null });
        renderKondimenBahan(); refreshKondimenHpp();
      }
      cari.value = ""; hasil.classList.add("hidden");
    }));
  }
  cari.addEventListener("focus", () => show(""));
  cari.addEventListener("input", () => show(cari.value.trim()));

  renderKondimenBahan();
}

function renderKondimenBahan(){
  const el = $("#k-bahan");
  if (!el) return;
  const e = kondimenEdit;
  if (!e.bahan.length){ el.innerHTML = '<div class="empty" style="padding:14px;font-size:13px;">Belum ada bahan.</div>'; return; }
  el.innerHTML = e.bahan.map((b, i) => {
    if (!b.konv){
      // Belum ada konversi — JANGAN hitung apa pun (dulu diam-diam dianggap
      // "isi 1 gram", bikin bahan yang dijual per kemasan besar seperti
      // beras 25kg keitung harganya per gram, bukan per karung).
      const det = deteksiSatuan(b.nama);
      return `<div class="bahan-row" style="padding:10px 12px;" data-i="${i}">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span class="brow-nm">${esc(b.nama)}</span>
          <button class="icon-btn" data-krm="${i}" aria-label="Hapus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <div class="brow-warn" style="padding:8px 0 0;">
          <span class="txt"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h16.9a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg> Lengkapi satuan dulu — harga sekarang per kemasan, bukan per ${det ? esc(det.unit) : "gr/ml"}</span>
        </div>
        <div class="setup-hint ${det ? "detected" : ""}" style="margin-top:6px;">${det ? "Terdeteksi dari nama: " + det.isi + " " + det.unit + " per kemasan — koreksi bila perlu" : "Kalau dibeli & dipakai per pcs yang sama, klik tombol hijau. Kalau dibeli per kemasan lalu dipakai per gram/ml, isi konversinya."}</div>
        <button class="btn btn-sm btn-primary" data-kperpcs="${i}" style="width:100%;margin:6px 0;">Pakai per pcs (sama dengan satuan beli)</button>
        <div class="setup-box">
          <input type="number" placeholder="isi per kemasan" value="${det ? det.isi : ""}" data-kisi="${i}">
          <select data-kunit="${i}">
            <option value="gr" ${det && det.unit === "gr" ? "selected" : ""}>gr</option>
            <option value="ml" ${det && det.unit === "ml" ? "selected" : ""}>ml</option>
            <option value="pcs" ${det && det.unit === "pcs" ? "selected" : ""}>pcs</option>
          </select>
          <button class="btn btn-sm btn-primary" data-ksavesat="${i}">Simpan</button>
        </div>
      </div>`;
    }
    const unit = b.konv.unit;
    const perUnit = (b.override != null) ? b.override : b.harga / (b.konv.isi || 1);
    const sub = perUnit * (b.qty || 0);
    return `<div class="bahan-row" style="padding:10px 12px;" data-i="${i}">
      <div style="display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;">
        <span class="brow-nm">${esc(b.nama)}</span>
        <span style="display:flex;align-items:center;gap:6px;"><input type="number" value="${b.qty}" data-kq="${i}" style="width:80px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;text-align:right;font-size:13px;"><span style="font-size:11px;color:var(--ink-faint);">${esc(unit)}</span></span>
        <span class="brow-sub">${rp(sub)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
        <span style="font-size:11px;color:var(--ink-faint);">${perUnit.toFixed(2)}/${esc(unit)}${b.konv.isi > 1 ? ` · isi ${b.konv.isi}` : ""}</span>
        <button class="icon-btn" data-krm="${i}" aria-label="Hapus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
    </div>`;
  }).join("");
  // input (bukan change) + update bertarget (bukan renderKondimenBahan penuh)
  // biar kolom qty bisa diketik multi-digit — render ulang setiap keystroke
  // menghancurkan & bikin ulang elemen input-nya, jadi fokus hilang tiap
  // karakter (persis keluhan yang dilaporkan: "tidak bisa diketik lebih dari
  // 1 angka"). Pola sama seperti updateBrowMain() di form produk utama.
  $all("[data-kq]", el).forEach(inp => inp.addEventListener("input", (ev) => {
    const i = +ev.target.dataset.kq;
    e.bahan[i].qty = parseFloat(ev.target.value) || 0;
    updateKondimenBahanRow(i);
    refreshKondimenHpp();
  }));
  $all("[data-krm]", el).forEach(b => b.addEventListener("click", () => { e.bahan.splice(+b.dataset.krm, 1); renderKondimenBahan(); refreshKondimenHpp(); }));
  $all("[data-kperpcs]", el).forEach(b => b.addEventListener("click", () => simpanKonversiKondimen(+b.dataset.kperpcs, 1, "pcs")));
  $all("[data-ksavesat]", el).forEach(b => b.addEventListener("click", () => {
    const i = +b.dataset.ksavesat;
    const isi = parseFloat($(`[data-kisi="${i}"]`, el).value);
    const unit = $(`[data-kunit="${i}"]`, el).value;
    simpanKonversiKondimen(i, isi, unit);
  }));
}
// Sama persis pola simpanKonversi() punya form produk (upsert ke
// material_konversi yang dipakai bersama semua layar) — cuma disasar ke
// kondimenEdit.bahan[i]/renderKondimenBahan() alih-alih formBahan.
async function simpanKonversiKondimen(i, isi, unit){
  if (!(isi > 0)){ toast("Isi per kemasan harus lebih dari 0"); return; }
  const b = kondimenEdit.bahan[i];
  if (b.sumber !== "manual"){
    await sb.from("material_konversi").upsert({ nama_normal: b.nama_normal, nama: b.nama, isi_per_kemasan: isi, satuan_pakai: unit }, { onConflict: "nama_normal" });
    konversiMap[b.nama_normal] = { isi, unit };
  }
  kondimenEdit.bahan[i].konv = { isi, unit };
  renderKondimenBahan(); refreshKondimenHpp();
  toast("Satuan dilengkapi");
}

function refreshKondimenHpp(){
  const calc = hitungKondimenHpp();
  if ($("#k-hpp-total")) $("#k-hpp-total").textContent = rp(calc.total);
  if ($("#k-hpp-per")) $("#k-hpp-per").textContent = calc.per.toFixed(2);
}
function updateKondimenBahanRow(i){
  const b = kondimenEdit.bahan[i];
  if (!b.konv) return; // baris "lengkapi satuan" -- tidak ada .brow-sub buat diupdate
  const row = $(`.bahan-row[data-i="${i}"]`);
  if (!row) return;
  const perUnit = (b.override != null) ? b.override : b.harga / (b.konv.isi || 1);
  const subEl = row.querySelector(".brow-sub");
  if (subEl) subEl.textContent = rp(perUnit * (b.qty || 0));
}

async function simpanKondimen(){
  const e = kondimenEdit;
  if (!e.nama.trim()){ toast("Nama kondimen wajib diisi"); return; }
  if (!e.bahan.length){ toast("Tambahkan minimal satu bahan"); return; }
  if (e.bahan.some(b => !b.konv)){ toast("Ada bahan yang satuannya belum dilengkapi — HPP tidak akan akurat"); return; }
  const calc = hitungKondimenHpp();
  const row = {
    nama: e.nama.trim(), satuan_hasil: e.satuan_hasil || "gr", total_hasil: e.total_hasil || 1,
    hpp_total: Math.round(calc.total * 100) / 100, hpp_per_satuan: Math.round(calc.per * 100) / 100,
    updated_at: new Date().toISOString(),
  };
  let kid = e.id;
  if (e.id){
    await sb.from("kondimen").update(row).eq("id", e.id);
    await sb.from("kondimen_bahan").delete().eq("kondimen_id", e.id);
  } else {
    const { data, error } = await sb.from("kondimen").insert(row).select("id").single();
    if (error){ toast("Gagal menyimpan"); console.error(error); return; }
    kid = data.id;
  }
  const bahanRows = e.bahan.map(b => ({
    kondimen_id: kid, bahan_nama_normal: b.nama_normal, bahan_nama: b.nama, sumber_bahan: b.sumber,
    qty_pakai: b.qty || 0, isi_kemasan: b.konv ? b.konv.isi : null, satuan: b.konv ? b.konv.unit : null,
    harga_override: b.override,
  }));
  if (bahanRows.length) await sb.from("kondimen_bahan").insert(bahanRows);
  await loadKondimen();
  if (kondimenQuickMode){
    // dibuat dari popup pilih-bahan Tambah Produk — langsung pakai kondimen
    // baru ini di resep yang sedang dikerjakan, bukan balik ke halaman Kelola.
    tutupKondimenQuickModal();
    addBahanByNormal("kondimen:" + kid);
    toast("Kondimen disimpan & ditambahkan ke resep");
  } else {
    kondimenEdit = null;
    renderKelolaKondimen();
    toast("Kondimen disimpan");
  }
}

function renderKelolaCabang(){
  const body = $("#kelola-body");
  body.innerHTML = `
    <div class="card">
      <h2>Cabang</h2>
      <div style="margin-bottom:12px;">
        ${cabangList.length ? cabangList.map(c => `
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--line);">
            <span style="flex:1;font-size:14px;${c.aktif ? "" : "color:var(--ink-faint);text-decoration:line-through;"}">${esc(c.nama)}</span>
            <button class="icon-btn" data-edit-cab="${c.id}" aria-label="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg></button>
            <button class="icon-btn" data-del-cab="${c.id}" aria-label="Hapus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
          </div>`).join("") : '<div class="empty" style="padding:16px;">Belum ada cabang.</div>'}
      </div>
      <button class="btn btn-primary btn-sm" id="add-cab">+ Tambah cabang</button>
    </div>`;
  $("#add-cab").addEventListener("click", async () => {
    const nama = prompt("Nama cabang baru:", ""); if (!nama) return;
    await sb.from("cabang_hpp").insert({ nama: nama.trim() });
    await loadCabang(); renderKelolaCabang(); toast("Cabang ditambah");
  });
  $all("[data-edit-cab]", body).forEach(b => b.addEventListener("click", async () => {
    const c = cabangList.find(x => x.id === b.dataset.editCab); if (!c) return;
    const nama = prompt("Ubah nama cabang:", c.nama); if (!nama) return;
    await sb.from("cabang_hpp").update({ nama: nama.trim(), updated_at: new Date().toISOString() }).eq("id", c.id);
    await loadCabang(); renderKelolaCabang(); toast("Cabang diubah");
  }));
  $all("[data-del-cab]", body).forEach(b => b.addEventListener("click", async () => {
    if (!confirm("Nonaktifkan cabang ini?")) return;
    await sb.from("cabang_hpp").update({ aktif: false }).eq("id", b.dataset.delCab);
    await loadCabang(); renderKelolaCabang(); toast("Cabang dinonaktifkan");
  }));
}

async function renderKelolaLog(){
  const body = $("#kelola-body");
  body.innerHTML = '<div class="card"><h2>Log perubahan</h2><div class="empty" style="padding:16px;">Memuat…</div></div>';
  const { data } = await sb.from("produk_log").select("*").order("created_at", { ascending: false }).limit(100);
  const logs = data || [];
  const badge = { buat: "status-sehat", edit: "status-tipis", hapus: "status-rugi" };
  const aksiText = { buat: "Dibuat", edit: "Diedit", hapus: "Dihapus" };
  body.innerHTML = `
    <div class="card">
      <h2>Log perubahan <span style="font-size:12px;color:var(--ink-faint);font-weight:500;">(100 terbaru)</span></h2>
      ${logs.length ? logs.map(l => {
        const d = new Date(l.created_at);
        const bulan = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
        const tgl = d.getDate() + " " + bulan[d.getMonth()] + " " + d.getFullYear() + " " + String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
        return `<div style="padding:10px 0;border-bottom:1px solid var(--line);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:3px;">
            <span style="font-size:14px;font-weight:600;">${esc(l.produk_nama || "-")}</span>
            <span class="status-pill ${badge[l.aksi] || ""}">${aksiText[l.aksi] || esc(l.aksi)}</span>
          </div>
          ${l.detail ? `<div style="font-size:12px;color:var(--ink-soft);margin-bottom:2px;">${esc(l.detail)}</div>` : ""}
          <div style="font-size:11px;color:var(--ink-faint);">${esc(l.oleh)} &middot; ${tgl}</div>
        </div>`;
      }).join("") : '<div class="empty" style="padding:16px;">Belum ada log.</div>'}
    </div>`;
}

// ---------------------------------------------------------------------
checkSession();
