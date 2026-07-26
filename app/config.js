// =====================================================================
//  KONFIGURASI HPP ELIO — self-host aaPanel
// =====================================================================

// Kosong = same-origin (Nginx proxy /api/* ke backend di domain yang sama).
// Isi kalau backend ada di origin lain (mis. dev lokal beda port).
const API_BASE_URL = "";

// Placeholder — dipertahankan HANYA supaya app.js (tidak diubah sama sekali
// dari versi Supabase lama, lihat apiClient.js) tetap bisa memanggil
// `supabase.createClient(SUPABASE_URL, SUPABASE_KEY)` tanpa ReferenceError.
// Nilainya sendiri TIDAK dipakai apiClient.js untuk koneksi/autentikasi apa
// pun — API_BASE_URL di atas yang menentukan ke mana request sebenarnya pergi.
const SUPABASE_URL = "";
const SUPABASE_KEY = "";
const HPP_ACCOUNT_EMAIL = "hpp@elio.local";
