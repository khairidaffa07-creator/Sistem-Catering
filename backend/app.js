// =====================================================
// BACKEND - SIA PENDAPATAN USAHA KATERING
// -----------------------------------------------------
// Server Node.js tanpa dependensi tambahan (cukup Node 18+).
// Fungsi:
//   1. Menyajikan halaman web (index.html, css, js) secara lokal.
//   2. Menyediakan REST API yang membaca data dari Supabase PostgreSQL
//      melalui Supabase Data API (PostgREST).
//   3. Login melalui Supabase Auth. Seluruh endpoint data mewajibkan
//      token login (Authorization: Bearer <access_token>), sehingga
//      aturan Row Level Security per peran tetap berlaku.
//
// Konfigurasi Supabase dibaca dari js/supabase.js, sehingga Project URL
// dan publishable key cukup diisi di satu tempat.
//
// Menjalankan:   node backend/app.js
// Lalu buka:     http://localhost:3000
// =====================================================

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "..");


// -----------------------------------------------------
// 1. Membaca konfigurasi dari js/supabase.js
// -----------------------------------------------------

function bacaKonfigurasi() {
    const isi = fs.readFileSync(path.join(ROOT, "js", "supabase.js"), "utf8");
    const ambil = (nama) => {
        const cocok = isi.match(new RegExp(`const\\s+${nama}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`));
        return cocok ? cocok[1] : "";
    };
    return {
        url: ambil("SUPABASE_URL").replace(/\/+$/, ""),
        key: ambil("SUPABASE_PUBLISHABLE_KEY"),
        namaUsaha: ambil("NAMA_USAHA") || "Usaha Katering"
    };
}

const CONFIG = bacaKonfigurasi();
const TERKONFIGURASI = CONFIG.url && !CONFIG.url.includes("PROJECT-ANDA")
    && CONFIG.key && !CONFIG.key.includes("ISI_KEY_ANDA");


// -----------------------------------------------------
// 2. Akses Supabase (PostgREST) dengan fetch bawaan Node
// -----------------------------------------------------

class ErrorApi extends Error {
    constructor(kode, pesan) {
        super(pesan);
        this.kode = kode;
    }
}

async function panggilSupabase(jalur, { metode = "GET", token, body } = {}) {
    const headers = { apikey: CONFIG.key, Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers["Content-Type"] = "application/json";

    const res = await fetch(`${CONFIG.url}${jalur}`, {
        method: metode,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });

    const isi = await res.json().catch(() => null);
    if (!res.ok) {
        const pesan = (isi && (isi.message || isi.msg || isi.error_description || isi.error)) || `HTTP ${res.status}`;
        throw new ErrorApi(res.status === 401 || res.status === 400 ? 401 : 502, `Supabase: ${pesan}`);
    }
    return isi;
}

// Membaca tabel/view dengan hak akses pengguna yang login.
function supabaseGet(tabel, query, token) {
    return panggilSupabase(`/rest/v1/${tabel}?${query}`, { token });
}

// Memastikan pengguna sudah login dan memiliki peran yang diizinkan.
async function wajibPeran(token, ...peranDiizinkan) {
    if (!token) throw new ErrorApi(401, "Login diperlukan. Kirim header Authorization: Bearer <access_token> dari /api/login.");
    const peran = await panggilSupabase("/rest/v1/rpc/peran_saya", { metode: "POST", token, body: {} });
    if (!peranDiizinkan.includes(peran)) {
        throw new ErrorApi(403, `Akses ditolak untuk peran: ${peran || "belum disetujui"}.`);
    }
    return peran;
}

const angka = (n) => Number(n) || 0;
const tanggalValid = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

function hariIniWIB() {
    // Tanggal hari ini menurut zona waktu Asia/Jakarta (YYYY-MM-DD).
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(new Date());
}


// -----------------------------------------------------
// 3. Endpoint API
// -----------------------------------------------------

const routes = {

    "/api/status": async () => ({
        status: "online",
        aplikasi: "SIA Pendapatan Usaha Katering",
        usaha: CONFIG.namaUsaha,
        supabase_terkonfigurasi: Boolean(TERKONFIGURASI),
        waktu_server: new Date().toISOString()
    }),

    // Data pengguna yang sedang login beserta perannya.
    "/api/saya": async (q, token) => {
        if (!token) throw new ErrorApi(401, "Login diperlukan.");
        const user = await panggilSupabase("/auth/v1/user", { token });
        const peran = await panggilSupabase("/rest/v1/rpc/peran_saya", { metode: "POST", token, body: {} });
        return {
            id: user.id,
            email: user.email,
            nama_lengkap: user.user_metadata && user.user_metadata.nama_lengkap,
            peran
        };
    },

    "/api/pelanggan": async (q, token) => {
        await wajibPeran(token, "pemilik", "admin", "kurir");
        return supabaseGet("pelanggan", "select=*&order=nama_pelanggan.asc", token);
    },

    "/api/paket": async (q, token) => {
        await wajibPeran(token, "pemilik", "admin", "kurir");
        return supabaseGet("paket_katering", "select=*&order=id_paket.asc", token);
    },

    // /api/pesanan?status=Selesai&dari=2026-11-01&sampai=2026-11-30
    "/api/pesanan": async (q, token) => {
        await wajibPeran(token, "pemilik", "admin", "kurir");
        const filter = ["select=*", "order=tanggal_kirim.desc,jam_kirim.desc"];
        if (q.get("status")) filter.push("status_pesanan=eq." + encodeURIComponent(q.get("status")));
        if (tanggalValid(q.get("dari"))) filter.push("tanggal_kirim=gte." + q.get("dari"));
        if (tanggalValid(q.get("sampai"))) filter.push("tanggal_kirim=lte." + q.get("sampai"));
        return supabaseGet("v_pesanan_lengkap", filter.join("&"), token);
    },

    // /api/monitoring?tanggal=2026-11-03  (default: hari ini)
    "/api/monitoring": async (q, token) => {
        await wajibPeran(token, "pemilik", "admin", "kurir");
        const tanggal = tanggalValid(q.get("tanggal")) ? q.get("tanggal") : hariIniWIB();
        const data = await supabaseGet("v_pesanan_lengkap",
            `select=kode_pesanan,jam_kirim,nama_pelanggan,nama_paket,jumlah_porsi,alamat_tujuan,` +
            `nama_kurir,status_pengiriman,status_pembayaran,sisa_tagihan,waktu_berangkat,waktu_tiba` +
            `&tanggal_kirim=eq.${tanggal}&status_pesanan=neq.Dibatalkan&order=jam_kirim.asc`, token);

        const rekap = {};
        ["Dijadwalkan", "Disiapkan", "Dalam Perjalanan", "Terkirim", "Gagal"]
            .forEach(s => { rekap[s] = data.filter(p => p.status_pengiriman === s).length; });

        return {
            tanggal,
            jumlah_pengiriman: data.length,
            jumlah_porsi: data.reduce((s, p) => s + angka(p.jumlah_porsi), 0),
            rekap_status: rekap,
            pengiriman: data
        };
    },

    // /api/laporan?dari=2026-11-01&sampai=2026-11-30  (khusus pemilik)
    "/api/laporan": async (q, token) => {
        await wajibPeran(token, "pemilik");
        const today = hariIniWIB();
        const dari = tanggalValid(q.get("dari")) ? q.get("dari") : today.slice(0, 8) + "01";
        const sampai = tanggalValid(q.get("sampai")) ? q.get("sampai") : today;

        const terkirim = await supabaseGet("v_pesanan_lengkap",
            `select=*&status_pengiriman=eq.Terkirim&status_pesanan=neq.Dibatalkan` +
            `&tanggal_kirim=gte.${dari}&tanggal_kirim=lte.${sampai}`, token);

        const belumKirim = await supabaseGet("v_pesanan_lengkap",
            `select=jumlah_dibayar&status_pengiriman=neq.Terkirim&status_pesanan=neq.Dibatalkan&jumlah_dibayar=gt.0`, token);

        const jumlah = (arr, f) => arr.reduce((s, p) => s + f(p), 0);

        const perPaket = {};
        terkirim.forEach(p => {
            const k = perPaket[p.nama_paket] ||= { pesanan: 0, porsi: 0, pendapatan: 0 };
            k.pesanan += 1;
            k.porsi += angka(p.jumlah_porsi);
            k.pendapatan += angka(p.total_tagihan);
        });

        return {
            usaha: CONFIG.namaUsaha,
            periode: { dari, sampai },
            jumlah_pesanan_terkirim: terkirim.length,
            penjualan_katering_bruto: jumlah(terkirim, p => angka(p.jumlah_porsi) * angka(p.harga_per_porsi)),
            pendapatan_jasa_pengiriman: jumlah(terkirim, p => angka(p.ongkos_kirim)),
            potongan_penjualan: jumlah(terkirim, p => angka(p.diskon)),
            pendapatan_diakui: jumlah(terkirim, p => angka(p.total_tagihan)),
            kas_diterima: jumlah(terkirim, p => angka(p.jumlah_dibayar)),
            piutang_usaha: jumlah(terkirim, p => angka(p.sisa_tagihan)),
            pendapatan_diterima_di_muka: jumlah(belumKirim, p => angka(p.jumlah_dibayar)),
            per_paket: perPaket
        };
    }
};


// -----------------------------------------------------
// 4. Penyajian file statis (halaman web)
// -----------------------------------------------------

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
};

function sajikanFile(res, pathname) {
    const relatif = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
    const lokasi = path.normalize(path.join(ROOT, relatif));

    // Cegah akses ke luar folder proyek dan ke folder backend/database.
    const bagian = path.relative(ROOT, lokasi).split(path.sep);
    if (bagian[0] === ".." || ["backend", "database", ".git"].includes(bagian[0])) {
        return kirimJSON(res, 403, { status: "error", message: "Akses ditolak" });
    }

    fs.readFile(lokasi, (err, isi) => {
        if (err) return kirimJSON(res, 404, { status: "error", message: "Halaman tidak ditemukan" });
        res.writeHead(200, { "Content-Type": MIME[path.extname(lokasi)] || "application/octet-stream" });
        res.end(isi);
    });
}

function kirimJSON(res, kode, data) {
    res.writeHead(kode, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    });
    res.end(JSON.stringify(data, null, 2));
}

function bacaBody(req) {
    return new Promise((resolve, reject) => {
        let data = "";
        req.on("data", (c) => {
            data += c;
            if (data.length > 10000) reject(new ErrorApi(413, "Data terlalu besar"));
        });
        req.on("end", () => {
            try { resolve(data ? JSON.parse(data) : {}); }
            catch (e) { reject(new ErrorApi(400, "Format JSON tidak valid")); }
        });
    });
}

// POST /api/login  { "email": "...", "password": "..." }
async function login(req) {
    const { email, password } = await bacaBody(req);
    if (!email || !password) throw new ErrorApi(400, "Email dan password wajib diisi.");

    const sesi = await panggilSupabase("/auth/v1/token?grant_type=password", {
        metode: "POST",
        body: { email, password }
    });

    return {
        access_token: sesi.access_token,
        token_type: "bearer",
        expires_in: sesi.expires_in,
        refresh_token: sesi.refresh_token,
        pengguna: {
            id: sesi.user.id,
            email: sesi.user.email,
            nama_lengkap: sesi.user.user_metadata && sesi.user.user_metadata.nama_lengkap
        }
    };
}


// -----------------------------------------------------
// 5. Server
// -----------------------------------------------------

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "OPTIONS") return kirimJSON(res, 204, {});

    const butuhKonfigurasi = url.pathname.startsWith("/api/") && url.pathname !== "/api/status";
    if (butuhKonfigurasi && !TERKONFIGURASI) {
        return kirimJSON(res, 500, {
            status: "error",
            message: "Konfigurasi Supabase belum diisi di js/supabase.js"
        });
    }

    if (url.pathname === "/api/login") {
        if (req.method !== "POST") return kirimJSON(res, 405, { status: "error", message: "Gunakan metode POST" });
        try {
            return kirimJSON(res, 200, await login(req));
        } catch (err) {
            return kirimJSON(res, err.kode || 502, { status: "error", message: err.message });
        }
    }

    if (req.method !== "GET") {
        return kirimJSON(res, 405, { status: "error", message: "Metode tidak didukung" });
    }

    const handler = routes[url.pathname];

    if (handler) {
        const auth = req.headers.authorization || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
        try {
            return kirimJSON(res, 200, await handler(url.searchParams, token));
        } catch (err) {
            return kirimJSON(res, err.kode || 502, { status: "error", message: err.message });
        }
    }

    if (url.pathname.startsWith("/api/")) {
        return kirimJSON(res, 404, {
            status: "error",
            message: "Endpoint tidak ditemukan",
            endpoint_tersedia: ["POST /api/login", ...Object.keys(routes).map(r => "GET " + r)]
        });
    }

    sajikanFile(res, url.pathname);
});

server.listen(PORT, () => {
    console.log(`SIA Pendapatan Usaha Katering - ${CONFIG.namaUsaha}`);
    console.log(`Web    : http://localhost:${PORT}`);
    console.log(`API    : http://localhost:${PORT}/api/status`);
    console.log(`Login  : POST http://localhost:${PORT}/api/login`);
    if (!TERKONFIGURASI) {
        console.log("Peringatan: isi SUPABASE_URL dan SUPABASE_PUBLISHABLE_KEY di js/supabase.js");
    }
});
