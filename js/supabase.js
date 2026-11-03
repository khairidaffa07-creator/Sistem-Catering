// =====================================================
// KONFIGURASI SUPABASE
// -----------------------------------------------------
// Ambil kedua nilai di bawah dari dashboard Supabase:
// Project Settings > API (atau tombol "Connect" di halaman proyek).
//   - SUPABASE_URL             : Project URL
//   - SUPABASE_PUBLISHABLE_KEY : Publishable key (sb_publishable_...)
//                                atau anon public key
//
// Jangan pernah menaruh service_role key / secret key di file ini,
// karena file ini dapat dibaca siapa pun yang membuka web demo.
// =====================================================

const SUPABASE_URL = "https://ggkzpzqfpuoxkhftkkqn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_d0YqUyaJ3A5vSTl3zkvfkA_UvTQqslL";

// Nama usaha yang tampil di aplikasi dan laporan.
const NAMA_USAHA = "Katering Dapur Tembalang";

// Sesi otomatis berakhir setelah sekian menit tanpa aktivitas.
const BATAS_TIDAK_AKTIF_MENIT = 30;

const KONFIGURASI_TERISI =
    !SUPABASE_URL.includes("PROJECT-ANDA") &&
    !SUPABASE_PUBLISHABLE_KEY.includes("ISI_KEY_ANDA");


// -----------------------------------------------------
// Penyimpanan sesi login
// "Ingat saya" dicentang  -> sesi disimpan di localStorage
//                            (tetap login setelah browser ditutup).
// "Ingat saya" tidak      -> sesi disimpan di sessionStorage
//                            (keluar otomatis saat tab ditutup).
// -----------------------------------------------------

function aman(fn, cadangan = null) {
    try { return fn(); } catch (e) { return cadangan; }
}

const penyimpananSesi = {
    getItem: (kunci) =>
        aman(() => localStorage.getItem(kunci)) ?? aman(() => sessionStorage.getItem(kunci)),
    setItem: (kunci, nilai) => {
        const ingat = aman(() => localStorage.getItem("sia_ingat_saya")) !== "0";
        if (ingat) {
            aman(() => localStorage.setItem(kunci, nilai));
            aman(() => sessionStorage.removeItem(kunci));
        } else {
            aman(() => sessionStorage.setItem(kunci, nilai));
            aman(() => localStorage.removeItem(kunci));
        }
    },
    removeItem: (kunci) => {
        aman(() => localStorage.removeItem(kunci));
        aman(() => sessionStorage.removeItem(kunci));
    }
};

// Merapikan URL yang tidak sengaja disalin dengan spasi atau garis miring
// di akhir, atau disalin beserta /rest/v1.
const URL_SUPABASE_BERSIH = SUPABASE_URL.trim().replace(/\/(rest|auth)\/v1\/?$/, "").replace(/\/+$/, "");

const supabaseClient = supabase.createClient(
    KONFIGURASI_TERISI ? URL_SUPABASE_BERSIH : "https://belum-dikonfigurasi.supabase.co",
    KONFIGURASI_TERISI ? SUPABASE_PUBLISHABLE_KEY.trim() : "kunci-belum-diisi",
    {
        auth: {
            storage: penyimpananSesi,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    }
);
