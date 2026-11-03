// =====================================================
// SIA PENDAPATAN USAHA KATERING - LOGIKA APLIKASI
// -----------------------------------------------------
// Data diambil dari Supabase (tabel pelanggan, paket_katering,
// pesanan, pengiriman, dan view v_pesanan_lengkap).
// Login dan sesi pengguna diatur di js/auth.js.
// =====================================================

const STATUS_KIRIM = ["Dijadwalkan", "Disiapkan", "Dalam Perjalanan", "Terkirim", "Gagal"];

const WARNA_STATUS = {
    "Dijadwalkan": "#b9b3a4",
    "Disiapkan": "#c9822b",
    "Dalam Perjalanan": "#2d5f9a",
    "Terkirim": "#1f6f50",
    "Gagal": "#b3412f"
};

const JUDUL_HALAMAN = {
    dashboard: "Dashboard",
    monitoring: "Monitoring Pengiriman",
    pesanan: "Pesanan",
    pelanggan: "Pelanggan",
    paket: "Paket Katering",
    laporan: "Laporan Pendapatan",
    pengguna: "Pengguna & Akses"
};

// Hak akses tampilan per peran. Aturan yang sama juga dipaksakan di
// database melalui Row Level Security (lihat database/database.sql).
const AKSES = {
    pemilik: {
        label: "Pemilik",
        menu: ["dashboard", "monitoring", "pesanan", "pelanggan", "paket", "laporan", "pengguna"],
        catatPesanan: true, kelolaPelanggan: true, kelolaPaket: true, hapus: true
    },
    admin: {
        label: "Admin",
        menu: ["dashboard", "monitoring", "pesanan", "pelanggan", "paket"],
        catatPesanan: true, kelolaPelanggan: true, kelolaPaket: false, hapus: false
    },
    kurir: {
        label: "Kurir",
        menu: ["monitoring"],
        catatPesanan: false, kelolaPelanggan: false, kelolaPaket: false, hapus: false
    }
};

const state = {
    pelanggan: [],
    paket: [],
    pesanan: [],
    pengguna: [],
    halaman: "dashboard",
    user: null,
    peran: null,
    namaSaya: ""
};

function bisa(hak) {
    return Boolean(state.peran && AKSES[state.peran] && AKSES[state.peran][hak]);
}

function menuDiizinkan() {
    return state.peran && AKSES[state.peran] ? AKSES[state.peran].menu : [];
}

const $ = (id) => document.getElementById(id);


// =====================================================
// 1. FUNGSI BANTU
// =====================================================

function esc(nilai) {
    return String(nilai ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function rupiah(angka) {
    return "Rp " + Math.round(Number(angka) || 0).toLocaleString("id-ID");
}

function angka(nilai) {
    return Number(nilai) || 0;
}

// Tanggal lokal (WIB di perangkat pengguna) dalam format YYYY-MM-DD.
function tanggalISO(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function hariIni() {
    return tanggalISO(new Date());
}

function tambahHari(iso, n) {
    const [y, m, d] = iso.split("-").map(Number);
    return tanggalISO(new Date(y, m - 1, d + n));
}

function selisihHari(dariISO, sampaiISO) {
    const a = new Date(dariISO + "T00:00:00");
    const b = new Date(sampaiISO + "T00:00:00");
    return Math.round((b - a) / 86400000);
}

function formatTanggal(iso, opsi = { day: "numeric", month: "short", year: "numeric" }) {
    if (!iso) return "-";
    return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", opsi);
}

function formatJam(jam) {
    return jam ? jam.slice(0, 5) : "-";
}

function formatWaktu(ts) {
    if (!ts) return "-";
    return new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function badge(teks) {
    const kelas = "b-" + String(teks || "").toLowerCase().replace(/\s+/g, "-");
    return `<span class="badge ${kelas}">${esc(teks)}</span>`;
}

function linkMaps(alamat) {
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(alamat || "");
}

function linkWA(hp) {
    let n = String(hp || "").replace(/\D/g, "");
    if (n.startsWith("0")) n = "62" + n.slice(1);
    return "https://wa.me/" + n;
}

function baris(kolom, teks) {
    return `<tr><td colspan="${kolom}" class="empty">${esc(teks)}</td></tr>`;
}

function toast(pesan, error = false) {
    const el = document.createElement("div");
    el.className = "toast" + (error ? " error" : "");
    el.textContent = pesan;
    $("toastArea").appendChild(el);
    setTimeout(() => el.remove(), error ? 6000 : 3000);
}

// Menerjemahkan pesan error database menjadi kalimat yang mudah dipahami.
function pesanError(error) {
    if (!error) return "Terjadi kesalahan.";
    const teks = (error.message || "") + " " + (error.details || "");

    if (error.code === "42501" || teks.includes("row-level security") || teks.includes("permission denied"))
        return "Anda tidak memiliki hak akses untuk tindakan ini.";
    if (error.code === "PGRST301" || teks.includes("JWT expired"))
        return "Sesi Anda telah berakhir. Silakan masuk kembali.";
    if (error.code === "23503") return "Data masih dipakai oleh data lain (misalnya pesanan), sehingga tidak dapat dihapus.";
    if (teks.includes("cek_tidak_lebih_bayar")) return "Jumlah pembayaran melebihi total tagihan.";
    if (teks.includes("cek_diskon_wajar")) return "Diskon tidak boleh melebihi nilai pesanan.";
    if (teks.includes("cek_tanggal_kirim")) return "Tanggal kirim tidak boleh sebelum tanggal pesan.";
    if (error.code === "P0001") return error.message;
    if (error.code === "42P01" || teks.includes("does not exist") || teks.includes("schema cache"))
        return "Tabel belum ditemukan. Jalankan database/database.sql di SQL Editor Supabase.";
    if (teks.includes("Failed to fetch") || teks.includes("NetworkError") || teks.includes("Load failed"))
        return "Tidak dapat terhubung ke Supabase. Periksa Project URL di js/supabase.js, pastikan proyek Supabase tidak sedang dijeda (Paused), dan pastikan koneksi internet aktif.";
    return error.message || "Terjadi kesalahan.";
}

function pesananAktif() {
    return state.pesanan.filter(p => p.status_pesanan !== "Dibatalkan");
}


// =====================================================
// 2. NAVIGASI
// =====================================================

function tampilkanHalaman(nama) {
    const izin = menuDiizinkan();
    if (!JUDUL_HALAMAN[nama] || !izin.includes(nama)) nama = izin[0] || "dashboard";
    state.halaman = nama;
    if (nama === "pengguna") muatPengguna();

    document.querySelectorAll(".page").forEach(el => el.classList.add("hidden"));
    $("page-" + nama).classList.remove("hidden");

    document.querySelectorAll(".menu a").forEach(a =>
        a.classList.toggle("active", a.dataset.page === nama));

    $("judulHalaman").textContent = JUDUL_HALAMAN[nama];
    $("sidebar").classList.remove("open");
}

window.addEventListener("hashchange", () => {
    if (!state.peran) return;
    const nama = location.hash.replace("#", "");
    if (JUDUL_HALAMAN[nama]) tampilkanHalaman(nama);
});

$("btnMenu").addEventListener("click", () => $("sidebar").classList.toggle("open"));


// =====================================================
// 3. MEMUAT DATA DARI SUPABASE
// =====================================================

async function muatSemuaData() {
    const [pl, pk, ps] = await Promise.all([
        supabaseClient.from("pelanggan").select("*").order("nama_pelanggan"),
        supabaseClient.from("paket_katering").select("*").order("id_paket"),
        supabaseClient.from("v_pesanan_lengkap").select("*")
            .order("tanggal_kirim", { ascending: false })
            .order("jam_kirim", { ascending: false })
    ]);

    const error = pl.error || pk.error || ps.error;
    setKoneksi(!error, error ? pesanError(error) : "Terhubung ke Supabase");

    if (error) {
        console.error(error);
        toast(pesanError(error), true);
        return;
    }

    state.pelanggan = pl.data;
    state.paket = pk.data;
    state.pesanan = ps.data;

    renderSemua();
}

function setKoneksi(ok, teks) {
    $("dotKoneksi").className = "dot " + (ok ? "ok" : "err");
    $("teksKoneksi").textContent = ok ? "Terhubung ke Supabase" : "Koneksi bermasalah";
    $("teksKoneksi").title = teks;
}

function renderSemua() {
    renderDropdown();
    renderDashboard();
    renderMonitoring();
    renderTabelPesanan();
    renderPelanggan();
    renderPaket();
    renderLaporan();
}


// =====================================================
// 4. DASHBOARD
// =====================================================

function renderDashboard() {
    const today = hariIni();
    const aktif = pesananAktif();
    const kirimHariIni = aktif.filter(p => p.tanggal_kirim === today);
    const terkirim = aktif.filter(p => p.status_pengiriman === "Terkirim");
    const bulanIni = today.slice(0, 7);

    $("kpiPesananHariIni").textContent = kirimHariIni.length;
    $("kpiPorsiHariIni").textContent =
        kirimHariIni.reduce((s, p) => s + angka(p.jumlah_porsi), 0).toLocaleString("id-ID") + " porsi";

    $("kpiDiantar").textContent =
        aktif.filter(p => p.status_pengiriman === "Dalam Perjalanan").length;
    $("kpiTerkirimHariIni").textContent =
        kirimHariIni.filter(p => p.status_pengiriman === "Terkirim").length + " sudah terkirim hari ini";

    $("kpiPendapatanBulan").textContent = rupiah(
        terkirim.filter(p => p.tanggal_kirim.startsWith(bulanIni))
            .reduce((s, p) => s + angka(p.total_tagihan), 0));

    const piutang = terkirim.filter(p => angka(p.sisa_tagihan) > 0);
    $("kpiPiutang").textContent = rupiah(piutang.reduce((s, p) => s + angka(p.sisa_tagihan), 0));
    $("kpiPiutangNote").textContent = piutang.length + " pesanan terkirim belum lunas";

    // Banner sapaan, grafik garis, dan analisis otomatis
    renderHero(kirimHariIni);

    const rentang = state.rentangGrafik || 30;
    const dari = tambahHari(today, -(rentang - 1));
    $("grafikKeterangan").textContent =
        `${formatTanggal(dari, { day: "numeric", month: "short" })} s.d. ${formatTanggal(today, { day: "numeric", month: "short", year: "numeric" })}, dibanding ${rentang} hari sebelumnya`;
    $("analisisPeriode").textContent = rentang + " hari terakhir";
    gambarGrafikPerbandingan($("grafikPendapatan"), dari, today);
    renderAnalisis($("analisisDashboard"),
        susunAnalisis(dari, today, { labelPeriode: `${rentang} hari terakhir` }));

    // Status pengiriman hari ini
    const total = Math.max(kirimHariIni.length, 1);
    $("ringkasStatusHariIni").innerHTML = kirimHariIni.length === 0
        ? `<p class="muted">Tidak ada pengiriman hari ini.</p>`
        : STATUS_KIRIM.map(s => {
            const n = kirimHariIni.filter(p => p.status_pengiriman === s).length;
            return `
                <div class="status-row">
                    <span>${esc(s)}</span>
                    <div class="status-track">
                        <div class="status-fill" style="width:${(n / total) * 100}%;background:${WARNA_STATUS[s]}"></div>
                    </div>
                    <b class="num">${n}</b>
                </div>`;
        }).join("");

    // Jadwal pengiriman terdekat
    const jadwal = aktif
        .filter(p => p.tanggal_kirim >= today && !["Terkirim", "Gagal"].includes(p.status_pengiriman))
        .sort((a, b) => (a.tanggal_kirim + a.jam_kirim).localeCompare(b.tanggal_kirim + b.jam_kirim))
        .slice(0, 8);

    $("tabelJadwalTerdekat").innerHTML = jadwal.length === 0
        ? baris(7, "Belum ada jadwal pengiriman.")
        : jadwal.map(p => `
            <tr>
                <td><b>${esc(p.kode_pesanan)}</b></td>
                <td>${esc(formatTanggal(p.tanggal_kirim))}<span class="sub">pukul ${esc(formatJam(p.jam_kirim))}</span></td>
                <td>${esc(p.nama_pelanggan)}</td>
                <td>${esc(p.nama_paket)}</td>
                <td class="num">${esc(p.jumlah_porsi)}</td>
                <td>${badge(p.status_pembayaran)}</td>
                <td>${badge(p.status_pengiriman)}</td>
            </tr>`).join("");
}


function renderHero(kirimHariIni) {
    const jam = new Date().getHours();
    const waktu = jam < 11 ? "pagi" : jam < 15 ? "siang" : jam < 18 ? "sore" : "malam";
    const namaDepan = (state.namaSaya || "").split(/[\s@]/)[0];
    $("heroSapaan").textContent = `Selamat ${waktu}${namaDepan ? ", " + namaDepan : ""}`;
    $("heroJudul").textContent = NAMA_USAHA;

    const porsi = kirimHariIni.reduce((s, p) => s + angka(p.jumlah_porsi), 0);
    const hitung = (st) => kirimHariIni.filter(p => p.status_pengiriman === st).length;
    const besok = pesananAktif().filter(p => p.tanggal_kirim === tambahHari(hariIni(), 1)).length;

    let teks = kirimHariIni.length
        ? `Hari ini ada ${kirimHariIni.length} pengiriman (${porsi.toLocaleString("id-ID")} porsi): ` +
          `${hitung("Terkirim")} terkirim, ${hitung("Dalam Perjalanan")} dalam perjalanan, ` +
          `dan ${hitung("Dijadwalkan") + hitung("Disiapkan")} masih disiapkan.`
        : "Tidak ada pengiriman yang dijadwalkan hari ini.";
    teks += besok ? ` Besok terjadwal ${besok} pesanan.` : "";
    $("heroRingkasan").textContent = teks;
    $("heroCatat").classList.toggle("hidden", !bisa("catatPesanan"));
}

document.querySelectorAll("#segRentang button").forEach(b =>
    b.addEventListener("click", () => {
        document.querySelectorAll("#segRentang button").forEach(x => x.classList.toggle("active", x === b));
        state.rentangGrafik = Number(b.dataset.rentang);
        renderDashboard();
    }));


// =====================================================
// 5. MONITORING PENGIRIMAN
// =====================================================

function renderMonitoring() {
    const tanggal = $("monTanggal").value || hariIni();
    const hanyaTugasSaya = state.peran === "kurir" && $("monTugasSaya").checked;
    const data = pesananAktif()
        .filter(p => p.tanggal_kirim === tanggal)
        .filter(p => !hanyaTugasSaya || !p.nama_kurir
            || p.nama_kurir.toLowerCase() === state.namaSaya.toLowerCase())
        .sort((a, b) => a.jam_kirim.localeCompare(b.jam_kirim));

    const porsi = data.reduce((s, p) => s + angka(p.jumlah_porsi), 0);
    $("monInfo").textContent =
        `${data.length} pengiriman, ${porsi.toLocaleString("id-ID")} porsi pada ${formatTanggal(tanggal, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`;

    const sekarang = new Date();
    const jamSekarang = sekarang.toTimeString().slice(0, 5);
    const isHariIni = tanggal === hariIni();

    $("boardMonitoring").innerHTML = STATUS_KIRIM.map(status => {
        const kartu = data.filter(p => p.status_pengiriman === status);

        return `
            <div class="column">
                <div class="column-head">
                    <span style="color:${WARNA_STATUS[status]}">${esc(status)}</span>
                    <span class="column-count">${kartu.length}</span>
                </div>
                ${kartu.length === 0 ? `<div class="empty-col">Kosong</div>` : kartu.map(p => {
                    const telat = isHariIni
                        && ["Dijadwalkan", "Disiapkan"].includes(p.status_pengiriman)
                        && formatJam(p.jam_kirim) < jamSekarang;

                    return `
                    <div class="order-card ${telat ? "telat" : ""}">
                        <div class="top">
                            <span class="kode">${esc(p.kode_pesanan)}</span>
                            <span class="jam">${esc(formatJam(p.jam_kirim))}</span>
                        </div>
                        <div class="nama">${esc(p.nama_penerima || p.nama_pelanggan)}</div>
                        <div>${esc(p.nama_paket)} &middot; <b>${esc(p.jumlah_porsi)} porsi</b></div>
                        <div class="alamat">${esc(p.alamat_tujuan)}<br>
                            <a href="${esc(linkMaps(p.alamat_tujuan))}" target="_blank" rel="noopener">Buka peta</a>
                            &nbsp;
                            <a href="${esc(linkWA(p.no_hp_penerima || p.no_hp))}" target="_blank" rel="noopener">WhatsApp</a>
                        </div>
                        <div class="meta">
                            ${badge(p.status_pembayaran)}
                            ${angka(p.sisa_tagihan) > 0 ? `<span class="muted">sisa ${esc(rupiah(p.sisa_tagihan))}</span>` : ""}
                        </div>
                        <div class="muted">Kurir: ${esc(p.nama_kurir || "belum ditentukan")}
                            ${p.waktu_berangkat ? ` &middot; berangkat ${esc(formatWaktu(p.waktu_berangkat))}` : ""}
                            ${p.waktu_tiba ? ` &middot; tiba ${esc(formatWaktu(p.waktu_tiba))}` : ""}
                        </div>
                        ${p.diperbarui_oleh ? `<div class="muted small">Diperbarui oleh ${esc(p.diperbarui_oleh)}</div>` : ""}
                        ${telat ? `<div style="color:var(--danger);font-weight:600">Melewati jam kirim</div>` : ""}
                        <div class="btns">${tombolStatus(p)}
                            <button class="btn btn-light btn-sm" data-aksi="ubah-kirim" data-id="${p.id_pesanan}">Ubah</button>
                        </div>
                    </div>`;
                }).join("")}
            </div>`;
    }).join("");
}

function tombolStatus(p) {
    const t = (label, status) =>
        `<button class="btn btn-primary btn-sm" data-aksi="status" data-id="${p.id_pesanan}" data-status="${esc(status)}">${label}</button>`;

    switch (p.status_pengiriman) {
        case "Dijadwalkan": return t("Mulai siapkan", "Disiapkan");
        case "Disiapkan": return t("Berangkat", "Dalam Perjalanan");
        case "Dalam Perjalanan":
            return t("Terkirim", "Terkirim") +
                `<button class="btn btn-danger btn-sm" data-aksi="status" data-id="${p.id_pesanan}" data-status="Gagal">Gagal</button>`;
        case "Gagal": return t("Jadwalkan ulang", "Dijadwalkan");
        default: return "";
    }
}

async function ubahStatusPengiriman(idPesanan, status) {
    const p = state.pesanan.find(x => x.id_pesanan === idPesanan);
    if (!p) return;

    const perubahan = { status_pengiriman: status };

    // Kurir yang menekan tombol otomatis tercatat sebagai pengantar.
    if (state.peran === "kurir" && ["Disiapkan", "Dalam Perjalanan", "Terkirim"].includes(status) && !p.nama_kurir) {
        perubahan.nama_kurir = state.namaSaya;
    }

    // Kurir wajib diisi sebelum katering berangkat.
    if (status === "Dalam Perjalanan" && !p.nama_kurir && !perubahan.nama_kurir) {
        bukaModalPengiriman(p, status);
        toast("Isi nama kurir terlebih dahulu.");
        return;
    }
    if (status === "Dijadwalkan") {
        perubahan.waktu_berangkat = null;
        perubahan.waktu_tiba = null;
    }

    const { error } = await supabaseClient
        .from("pengiriman")
        .update(perubahan)
        .eq("id_pengiriman", p.id_pengiriman);

    if (error) return toast(pesanError(error), true);

    toast(`${p.kode_pesanan}: ${status}`);
    await muatSemuaData();
}

$("monTanggal").addEventListener("change", renderMonitoring);
$("monTugasSaya").addEventListener("change", renderMonitoring);
$("monHariIni").addEventListener("click", () => {
    $("monTanggal").value = hariIni();
    renderMonitoring();
});


// =====================================================
// 6. PESANAN
// =====================================================

function renderDropdown() {
    const plDipilih = $("psPelanggan").value;
    const pkDipilih = $("psPaket").value;

    $("psPelanggan").innerHTML = `<option value="">Pilih pelanggan</option>` +
        state.pelanggan.map(p =>
            `<option value="${p.id_pelanggan}">${esc(p.nama_pelanggan)} (${esc(p.jenis_pelanggan)})</option>`).join("");

    $("psPaket").innerHTML = `<option value="">Pilih paket</option>` +
        state.paket.filter(p => p.aktif).map(p =>
            `<option value="${p.id_paket}">${esc(p.nama_paket)} - ${esc(rupiah(p.harga_per_porsi))}/porsi</option>`).join("");

    $("psPelanggan").value = plDipilih;
    $("psPaket").value = pkDipilih;
    hitungRingkasanPesanan();
}

function paketTerpilih() {
    return state.paket.find(p => String(p.id_paket) === $("psPaket").value);
}

function hitungPesanan() {
    const paket = paketTerpilih();
    const harga = paket ? angka(paket.harga_per_porsi) : 0;
    const porsi = angka($("psPorsi").value);
    const subtotal = harga * porsi;
    const ongkir = angka($("psOngkir").value);
    const diskon = angka($("psDiskon").value);
    const total = subtotal + ongkir - diskon;
    const dibayar = angka($("psDibayar").value);
    return { paket, harga, porsi, subtotal, ongkir, diskon, total, dibayar, sisa: total - dibayar };
}

function hitungRingkasanPesanan() {
    const h = hitungPesanan();
    $("psInfoPaket").textContent = h.paket
        ? `Minimal ${h.paket.minimal_porsi} porsi. ${h.paket.deskripsi || ""}`
        : "";

    const status = h.dibayar <= 0 ? "Belum Bayar" : (h.dibayar >= h.total ? "Lunas" : "DP");

    $("psRingkasan").innerHTML = `
        <span>Harga/porsi <b>${esc(rupiah(h.harga))}</b></span>
        <span>Subtotal <b>${esc(rupiah(h.subtotal))}</b></span>
        <span>Ongkir <b>${esc(rupiah(h.ongkir))}</b></span>
        <span>Diskon <b>${esc(rupiah(h.diskon))}</b></span>
        <span>Total tagihan <b>${esc(rupiah(h.total))}</b></span>
        <span>Sisa <b>${esc(rupiah(h.sisa))}</b></span>
        <span>${badge(status)}</span>`;
}

["psPaket", "psPorsi", "psOngkir", "psDiskon", "psDibayar"].forEach(id =>
    $(id).addEventListener("input", hitungRingkasanPesanan));

$("psPaket").addEventListener("change", () => {
    const paket = paketTerpilih();
    if (paket) {
        $("psPorsi").min = paket.minimal_porsi;
        if (angka($("psPorsi").value) < paket.minimal_porsi) $("psPorsi").value = paket.minimal_porsi;
    }
    hitungRingkasanPesanan();
});

$("formPesanan").addEventListener("reset", () => setTimeout(() => {
    $("psTanggalKirim").value = tambahHari(hariIni(), 1);
    hitungRingkasanPesanan();
}, 0));

$("formPesanan").addEventListener("submit", async (e) => {
    e.preventDefault();
    const h = hitungPesanan();
    const metode = $("psMetode").value;

    if (!h.paket) return toast("Pilih paket katering.", true);
    if (h.porsi < h.paket.minimal_porsi) return toast(`Paket ini minimal ${h.paket.minimal_porsi} porsi.`, true);
    if (h.diskon > h.subtotal + h.ongkir) return toast("Diskon tidak boleh melebihi nilai pesanan.", true);
    if (h.dibayar > h.total) return toast("Uang muka melebihi total tagihan.", true);
    if (h.dibayar > 0 && !metode) return toast("Pilih metode pembayaran untuk uang muka.", true);
    if ($("psTanggalKirim").value < hariIni()) return toast("Tanggal kirim tidak boleh sebelum hari ini.", true);

    const data = {
        id_pelanggan: Number($("psPelanggan").value),
        id_paket: h.paket.id_paket,
        tanggal_pesan: hariIni(),
        tanggal_kirim: $("psTanggalKirim").value,
        jam_kirim: $("psJamKirim").value,
        jumlah_porsi: h.porsi,
        harga_per_porsi: h.harga,
        ongkos_kirim: h.ongkir,
        diskon: h.diskon,
        jumlah_dibayar: h.dibayar,
        metode_pembayaran: h.dibayar > 0 ? metode : null,
        catatan: $("psCatatan").value.trim() || null
    };

    const { data: hasil, error } = await supabaseClient
        .from("pesanan").insert([data]).select("kode_pesanan").single();

    if (error) return toast(pesanError(error), true);

    toast(`Pesanan ${hasil.kode_pesanan} tersimpan dan jadwal pengiriman dibuat.`);
    $("formPesanan").reset();
    await muatSemuaData();
});

function renderTabelPesanan() {
    const cari = $("fPesananCari").value.trim().toLowerCase();
    const dari = $("fPesananDari").value;
    const sampai = $("fPesananSampai").value;
    const bayar = $("fPesananBayar").value;
    const status = $("fPesananStatus").value;

    const data = state.pesanan.filter(p =>
        (!cari || [p.kode_pesanan, p.nama_pelanggan, p.nama_paket].join(" ").toLowerCase().includes(cari)) &&
        (!dari || p.tanggal_kirim >= dari) &&
        (!sampai || p.tanggal_kirim <= sampai) &&
        (!bayar || p.status_pembayaran === bayar) &&
        (!status || p.status_pesanan === status));

    $("tabelPesanan").innerHTML = data.length === 0
        ? baris(11, "Tidak ada pesanan yang sesuai.")
        : data.map(p => {
            const batal = p.status_pesanan === "Dibatalkan";
            return `
            <tr>
                <td><b>${esc(p.kode_pesanan)}</b>${p.catatan ? `<span class="sub">${esc(p.catatan)}</span>` : ""}</td>
                <td>${esc(formatTanggal(p.tanggal_pesan))}</td>
                <td>${esc(formatTanggal(p.tanggal_kirim))}<span class="sub">${esc(formatJam(p.jam_kirim))}</span></td>
                <td>${esc(p.nama_pelanggan)}</td>
                <td>${esc(p.nama_paket)}</td>
                <td class="num">${esc(p.jumlah_porsi)}</td>
                <td class="num">${esc(rupiah(p.total_tagihan))}</td>
                <td class="num">${esc(rupiah(p.jumlah_dibayar))}</td>
                <td>${badge(p.status_pembayaran)}</td>
                <td>${badge(p.status_pesanan)}<span class="sub">${esc(p.status_pengiriman)}</span></td>
                <td class="actions">
                    ${!batal && angka(p.sisa_tagihan) > 0 && bisa("catatPesanan")
                        ? `<button class="btn btn-primary btn-sm" data-aksi="bayar" data-id="${p.id_pesanan}">Bayar</button>` : ""}
                    ${!batal && p.status_pengiriman !== "Terkirim" && bisa("catatPesanan")
                        ? `<button class="btn btn-light btn-sm" data-aksi="batal" data-id="${p.id_pesanan}">Batalkan</button>` : ""}
                    ${bisa("hapus")
                        ? `<button class="btn btn-danger btn-sm" data-aksi="hapus-pesanan" data-id="${p.id_pesanan}">Hapus</button>` : ""}
                    ${p.dicatat_oleh ? `<span class="sub">Dicatat: ${esc(p.dicatat_oleh)}</span>` : ""}
                </td>
            </tr>`;
        }).join("");
}

["fPesananCari", "fPesananDari", "fPesananSampai", "fPesananBayar", "fPesananStatus"].forEach(id =>
    $(id).addEventListener("input", renderTabelPesanan));


// =====================================================
// 7. PELANGGAN
// =====================================================

function renderPelanggan() {
    const cari = $("fPelangganCari").value.trim().toLowerCase();
    const aktif = pesananAktif();

    const data = state.pelanggan.filter(p =>
        !cari || (p.nama_pelanggan + " " + p.alamat).toLowerCase().includes(cari));

    $("tabelPelanggan").innerHTML = data.length === 0
        ? baris(7, "Belum ada pelanggan.")
        : data.map(p => {
            const milik = aktif.filter(x => x.id_pelanggan === p.id_pelanggan);
            const sisa = milik.reduce((s, x) => s + angka(x.sisa_tagihan), 0);
            return `
            <tr>
                <td><b>${esc(p.nama_pelanggan)}</b></td>
                <td>${esc(p.jenis_pelanggan)}</td>
                <td><a class="link" href="${esc(linkWA(p.no_hp))}" target="_blank" rel="noopener">${esc(p.no_hp)}</a></td>
                <td>${esc(p.alamat)}${p.patokan_alamat ? `<span class="sub">Patokan: ${esc(p.patokan_alamat)}</span>` : ""}</td>
                <td class="num">${milik.length}</td>
                <td class="num">${sisa > 0 ? `<b style="color:var(--warn)">${esc(rupiah(sisa))}</b>` : "-"}</td>
                <td class="actions">
                    ${bisa("kelolaPelanggan") ? `<button class="btn btn-light btn-sm" data-aksi="edit-pelanggan" data-id="${p.id_pelanggan}">Ubah</button>` : ""}
                    ${bisa("hapus") ? `<button class="btn btn-danger btn-sm" data-aksi="hapus-pelanggan" data-id="${p.id_pelanggan}">Hapus</button>` : ""}
                </td>
            </tr>`;
        }).join("");
}

$("fPelangganCari").addEventListener("input", renderPelanggan);

function resetFormPelanggan() {
    $("formPelanggan").reset();
    $("plId").value = "";
    $("judulFormPelanggan").textContent = "Tambah pelanggan";
    $("btnSimpanPelanggan").textContent = "Simpan pelanggan";
}

$("btnBatalPelanggan").addEventListener("click", resetFormPelanggan);

function editPelanggan(id) {
    const p = state.pelanggan.find(x => x.id_pelanggan === id);
    if (!p) return;
    $("plId").value = p.id_pelanggan;
    $("plNama").value = p.nama_pelanggan;
    $("plHp").value = p.no_hp;
    $("plJenis").value = p.jenis_pelanggan;
    $("plAlamat").value = p.alamat;
    $("plPatokan").value = p.patokan_alamat || "";
    $("judulFormPelanggan").textContent = "Ubah pelanggan: " + p.nama_pelanggan;
    $("btnSimpanPelanggan").textContent = "Simpan perubahan";
    window.scrollTo({ top: 0, behavior: "smooth" });
}

$("formPelanggan").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("plId").value;
    const data = {
        nama_pelanggan: $("plNama").value.trim(),
        no_hp: $("plHp").value.trim(),
        jenis_pelanggan: $("plJenis").value,
        alamat: $("plAlamat").value.trim(),
        patokan_alamat: $("plPatokan").value.trim() || null
    };

    const { error } = id
        ? await supabaseClient.from("pelanggan").update(data).eq("id_pelanggan", Number(id))
        : await supabaseClient.from("pelanggan").insert([data]);

    if (error) return toast(pesanError(error), true);

    toast(id ? "Data pelanggan diperbarui." : "Pelanggan ditambahkan.");
    resetFormPelanggan();
    await muatSemuaData();
});


// =====================================================
// 8. PAKET KATERING
// =====================================================

function renderPaket() {
    $("tabelPaket").innerHTML = state.paket.length === 0
        ? baris(8, "Belum ada paket.")
        : state.paket.map(p => {
            const terjual = pesananAktif()
                .filter(x => x.id_paket === p.id_paket && x.status_pengiriman === "Terkirim")
                .reduce((s, x) => s + angka(x.jumlah_porsi), 0);
            return `
            <tr>
                <td><b>${esc(p.nama_paket)}</b></td>
                <td>${esc(p.kategori)}</td>
                <td class="num">${esc(rupiah(p.harga_per_porsi))}</td>
                <td class="num">${esc(p.minimal_porsi)}</td>
                <td>${esc(p.deskripsi || "-")}</td>
                <td>${badge(p.aktif ? "Aktif" : "Nonaktif")}</td>
                <td class="num">${terjual.toLocaleString("id-ID")}</td>
                <td class="actions">${bisa("kelolaPaket") ? `
                    <button class="btn btn-light btn-sm" data-aksi="edit-paket" data-id="${p.id_paket}">Ubah</button>
                    <button class="btn btn-light btn-sm" data-aksi="toggle-paket" data-id="${p.id_paket}">${p.aktif ? "Nonaktifkan" : "Aktifkan"}</button>
                    <button class="btn btn-danger btn-sm" data-aksi="hapus-paket" data-id="${p.id_paket}">Hapus</button>` : `<span class="muted small">Hanya pemilik</span>`}
                </td>
            </tr>`;
        }).join("");
}

function resetFormPaket() {
    $("formPaket").reset();
    $("pkId").value = "";
    $("judulFormPaket").textContent = "Tambah paket katering";
    $("btnSimpanPaket").textContent = "Simpan paket";
}

$("btnBatalPaket").addEventListener("click", resetFormPaket);

function editPaket(id) {
    const p = state.paket.find(x => x.id_paket === id);
    if (!p) return;
    $("pkId").value = p.id_paket;
    $("pkNama").value = p.nama_paket;
    $("pkKategori").value = p.kategori;
    $("pkHarga").value = angka(p.harga_per_porsi);
    $("pkMinimal").value = p.minimal_porsi;
    $("pkDeskripsi").value = p.deskripsi || "";
    $("pkAktif").checked = p.aktif;
    $("judulFormPaket").textContent = "Ubah paket: " + p.nama_paket;
    $("btnSimpanPaket").textContent = "Simpan perubahan";
    window.scrollTo({ top: 0, behavior: "smooth" });
}

$("formPaket").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("pkId").value;
    const data = {
        nama_paket: $("pkNama").value.trim(),
        kategori: $("pkKategori").value,
        harga_per_porsi: angka($("pkHarga").value),
        minimal_porsi: angka($("pkMinimal").value),
        deskripsi: $("pkDeskripsi").value.trim() || null,
        aktif: $("pkAktif").checked
    };

    const { error } = id
        ? await supabaseClient.from("paket_katering").update(data).eq("id_paket", Number(id))
        : await supabaseClient.from("paket_katering").insert([data]);

    if (error) return toast(pesanError(error), true);

    toast(id ? "Paket diperbarui. Harga baru berlaku untuk pesanan berikutnya." : "Paket ditambahkan.");
    resetFormPaket();
    await muatSemuaData();
});


// =====================================================
// 9. LAPORAN PENDAPATAN
// =====================================================

function renderLaporan() {
    const dari = $("lapDari").value;
    const sampai = $("lapSampai").value;
    const today = hariIni();
    const aktif = pesananAktif();

    $("lapJudulUsaha").textContent = "Laporan Pendapatan " + NAMA_USAHA;
    $("lapPeriode").textContent = `Periode ${formatTanggal(dari, { day: "numeric", month: "long", year: "numeric" })} s.d. ${formatTanggal(sampai, { day: "numeric", month: "long", year: "numeric" })}`;

    const diakui = aktif
        .filter(p => p.status_pengiriman === "Terkirim" && p.tanggal_kirim >= dari && p.tanggal_kirim <= sampai)
        .sort((a, b) => a.tanggal_kirim.localeCompare(b.tanggal_kirim));

    const jumlah = (arr, f) => arr.reduce((s, p) => s + f(p), 0);

    const bruto = jumlah(diakui, p => angka(p.jumlah_porsi) * angka(p.harga_per_porsi));
    const ongkir = jumlah(diakui, p => angka(p.ongkos_kirim));
    const diskon = jumlah(diakui, p => angka(p.diskon));
    const pendapatan = jumlah(diakui, p => angka(p.total_tagihan));
    const kas = jumlah(diakui, p => angka(p.jumlah_dibayar));
    const piutang = jumlah(diakui, p => angka(p.sisa_tagihan));

    const belumKirim = aktif.filter(p => p.status_pengiriman !== "Terkirim" && angka(p.jumlah_dibayar) > 0);
    const diMuka = jumlah(belumKirim, p => angka(p.jumlah_dibayar));

    // Grafik dan analisis otomatis periode laporan
    $("lapGrafikKeterangan").textContent = "Garis putus-putus menunjukkan periode sebelumnya dengan panjang yang sama.";
    gambarGrafikPerbandingan($("lapGrafik"), dari, sampai);
    renderAnalisis($("analisisLaporan"),
        susunAnalisis(dari, sampai, { lengkap: true, labelPeriode: "periode laporan" }));

    $("lapPendapatan").textContent = rupiah(pendapatan);
    $("lapKas").textContent = rupiah(kas);
    $("lapPiutang").textContent = rupiah(piutang);
    $("lapDiMuka").textContent = rupiah(diMuka);

    // Ikhtisar jurnal
    const j = (akun, debit, kredit, indent = false) => `
        <tr>
            <td class="${indent ? "indent" : ""}">${esc(akun)}</td>
            <td class="num">${debit ? esc(rupiah(debit)) : ""}</td>
            <td class="num">${kredit ? esc(rupiah(kredit)) : ""}</td>
        </tr>`;

    $("tabelJurnal").innerHTML =
        `<tr class="group"><td colspan="3">Pengakuan pendapatan atas ${diakui.length} pesanan terkirim dalam periode</td></tr>` +
        j("Kas / Pendapatan diterima di muka", kas, 0) +
        j("Piutang usaha", piutang, 0) +
        j("Potongan penjualan", diskon, 0) +
        j("Pendapatan penjualan katering", 0, bruto, true) +
        j("Pendapatan jasa pengiriman", 0, ongkir, true) +
        `<tr class="group"><td colspan="3">Uang muka atas ${belumKirim.length} pesanan yang belum dikirim (posisi saat ini)</td></tr>` +
        j("Kas", diMuka, 0) +
        j("Pendapatan diterima di muka", 0, diMuka, true);

    // Pendapatan per paket
    const perPaket = {};
    diakui.forEach(p => {
        const k = perPaket[p.nama_paket] ||= { pesanan: 0, porsi: 0, total: 0 };
        k.pesanan += 1;
        k.porsi += angka(p.jumlah_porsi);
        k.total += angka(p.total_tagihan);
    });
    const totalPorsi = jumlah(diakui, p => angka(p.jumlah_porsi)) || 1;
    const daftarPaket = Object.entries(perPaket).sort((a, b) => b[1].total - a[1].total);

    $("tabelPerPaket").innerHTML = daftarPaket.length === 0
        ? baris(5, "Belum ada pendapatan dalam periode ini.")
        : daftarPaket.map(([nama, k]) => `
            <tr>
                <td>${esc(nama)}</td>
                <td class="num">${k.pesanan}</td>
                <td class="num">${k.porsi.toLocaleString("id-ID")}</td>
                <td class="num">${esc(rupiah(k.total))}</td>
                <td class="num">${((k.porsi / totalPorsi) * 100).toFixed(1)}%</td>
            </tr>`).join("");

    // Daftar piutang usaha (posisi hari ini)
    const daftarPiutang = aktif
        .filter(p => p.status_pengiriman === "Terkirim" && angka(p.sisa_tagihan) > 0)
        .map(p => ({ ...p, umur: selisihHari(p.tanggal_kirim, today) }))
        .sort((a, b) => b.umur - a.umur);

    $("tabelPiutang").innerHTML = daftarPiutang.length === 0
        ? baris(5, "Tidak ada piutang. Semua pesanan terkirim sudah lunas.")
        : daftarPiutang.map(p => `
            <tr>
                <td>${esc(p.kode_pesanan)}</td>
                <td>${esc(p.nama_pelanggan)}</td>
                <td class="nowrap">${esc(formatTanggal(p.tanggal_kirim))}</td>
                <td class="num">${p.umur}</td>
                <td class="num">${esc(rupiah(p.sisa_tagihan))}</td>
            </tr>`).join("") + `
            <tr><td colspan="4"><b>Total piutang per hari ini</b></td>
                <td class="num"><b>${esc(rupiah(jumlah(daftarPiutang, p => angka(p.sisa_tagihan))))}</b></td></tr>`;

    // Rincian pesanan terkirim
    $("tabelRincian").innerHTML = diakui.length === 0
        ? baris(11, "Belum ada pesanan terkirim dalam periode ini.")
        : diakui.map(p => `
            <tr>
                <td>${esc(p.kode_pesanan)}</td>
                <td class="nowrap">${esc(formatTanggal(p.tanggal_kirim))}</td>
                <td>${esc(p.nama_pelanggan)}</td>
                <td>${esc(p.nama_paket)}</td>
                <td class="num">${esc(p.jumlah_porsi)}</td>
                <td class="num">${esc(rupiah(angka(p.jumlah_porsi) * angka(p.harga_per_porsi)))}</td>
                <td class="num">${esc(rupiah(p.ongkos_kirim))}</td>
                <td class="num">${esc(rupiah(p.diskon))}</td>
                <td class="num">${esc(rupiah(p.total_tagihan))}</td>
                <td class="num">${esc(rupiah(p.jumlah_dibayar))}</td>
                <td>${badge(p.status_pembayaran)}</td>
            </tr>`).join("") + `
            <tr>
                <td colspan="5"><b>Jumlah</b></td>
                <td class="num"><b>${esc(rupiah(bruto))}</b></td>
                <td class="num"><b>${esc(rupiah(ongkir))}</b></td>
                <td class="num"><b>${esc(rupiah(diskon))}</b></td>
                <td class="num"><b>${esc(rupiah(pendapatan))}</b></td>
                <td class="num"><b>${esc(rupiah(kas))}</b></td>
                <td></td>
            </tr>`;
}

$("btnTampilkanLaporan").addEventListener("click", () => {
    if ($("lapDari").value > $("lapSampai").value) return toast("Tanggal awal melebihi tanggal akhir.", true);
    renderLaporan();
});

$("btnCetakLaporan").addEventListener("click", () => window.print());


// =====================================================
// 10. MODAL (pengiriman, pembayaran, konfirmasi)
// =====================================================

let aksiModal = null;

function bukaModal(judul, isiHTML, labelSimpan, onSimpan) {
    $("modalJudul").textContent = judul;
    $("modalIsi").innerHTML = isiHTML;
    $("modalSimpan").textContent = labelSimpan;
    aksiModal = onSimpan;
    $("modal").classList.remove("hidden");
    const input = $("modalIsi").querySelector("input, select");
    if (input) input.focus();
}

function tutupModal() {
    $("modal").classList.add("hidden");
    aksiModal = null;
}

$("modalTutup").addEventListener("click", tutupModal);
$("modalBatal").addEventListener("click", tutupModal);
$("modal").addEventListener("click", (e) => { if (e.target === $("modal")) tutupModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") tutupModal(); });

$("modalForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!aksiModal) return;
    $("modalSimpan").disabled = true;
    try {
        const berhasil = await aksiModal();
        if (berhasil !== false) tutupModal();
    } finally {
        $("modalSimpan").disabled = false;
    }
});

function bukaModalPengiriman(p, statusBaru) {
    const status = statusBaru || p.status_pengiriman;
    const kunci = state.peran === "kurir" ? "disabled" : "";
    bukaModal(`Pengiriman ${p.kode_pesanan}`, `
        <div class="modal-info">
            <b>${esc(p.nama_pelanggan)}</b> &middot; ${esc(p.nama_paket)} (${esc(p.jumlah_porsi)} porsi)<br>
            Dikirim ${esc(formatTanggal(p.tanggal_kirim))} pukul ${esc(formatJam(p.jam_kirim))}
        </div>
        <label>Nama kurir
            <input id="mKurir" value="${esc(p.nama_kurir || (state.peran === "kurir" ? state.namaSaya : ""))}" ${status === "Dalam Perjalanan" ? "required" : ""} maxlength="100">
        </label>
        <label>Status pengiriman
            <select id="mStatus">${STATUS_KIRIM.map(s =>
                `<option ${s === status ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
        </label>
        <label>Alamat tujuan
            <textarea id="mAlamat" rows="2" required ${kunci}>${esc(p.alamat_tujuan || "")}</textarea>
        </label>
        <label>Nama penerima
            <input id="mPenerima" value="${esc(p.nama_penerima || "")}" maxlength="100" ${kunci}>
        </label>
        <label>No. HP penerima
            <input id="mHpPenerima" value="${esc(p.no_hp_penerima || "")}" maxlength="20" ${kunci}>
        </label>
        <label>Catatan pengiriman
            <input id="mCatatanKirim" value="${esc(p.catatan_pengiriman || "")}" placeholder="Contoh: diterima satpam">
        </label>`,
        "Simpan",
        async () => {
            const statusDipilih = $("mStatus").value;
            const kurir = $("mKurir").value.trim();
            if (["Dalam Perjalanan", "Terkirim"].includes(statusDipilih) && !kurir) {
                toast("Isi nama kurir terlebih dahulu.", true);
                return false;
            }
            const perubahan = {
                nama_kurir: kurir || null,
                status_pengiriman: statusDipilih,
                alamat_tujuan: $("mAlamat").value.trim(),
                nama_penerima: $("mPenerima").value.trim() || null,
                no_hp_penerima: $("mHpPenerima").value.trim() || null,
                catatan_pengiriman: $("mCatatanKirim").value.trim() || null
            };
            if (statusDipilih === "Dijadwalkan") {
                perubahan.waktu_berangkat = null;
                perubahan.waktu_tiba = null;
            }
            if (state.peran === "kurir") {
                delete perubahan.alamat_tujuan;
                delete perubahan.nama_penerima;
                delete perubahan.no_hp_penerima;
            }
            const { error } = await supabaseClient.from("pengiriman")
                .update(perubahan).eq("id_pengiriman", p.id_pengiriman);
            if (error) { toast(pesanError(error), true); return false; }
            toast("Data pengiriman disimpan.");
            await muatSemuaData();
        });
}

function bukaModalBayar(p) {
    bukaModal(`Catat pembayaran ${p.kode_pesanan}`, `
        <div class="modal-info">
            ${esc(p.nama_pelanggan)}<br>
            Total tagihan <b>${esc(rupiah(p.total_tagihan))}</b>,
            sudah dibayar <b>${esc(rupiah(p.jumlah_dibayar))}</b>,
            sisa <b>${esc(rupiah(p.sisa_tagihan))}</b>
        </div>
        <label>Jumlah diterima (Rp)
            <input type="number" id="mJumlahBayar" min="1" max="${angka(p.sisa_tagihan)}" value="${angka(p.sisa_tagihan)}" required>
        </label>
        <label>Metode pembayaran
            <select id="mMetode">
                ${["Tunai", "Transfer", "QRIS"].map(m =>
                    `<option ${m === p.metode_pembayaran ? "selected" : ""}>${m}</option>`).join("")}
            </select>
        </label>`,
        "Simpan pembayaran",
        async () => {
            const jumlah = angka($("mJumlahBayar").value);
            if (jumlah <= 0 || jumlah > angka(p.sisa_tagihan)) {
                toast("Jumlah harus antara Rp 1 dan sisa tagihan.", true);
                return false;
            }
            const { error } = await supabaseClient.from("pesanan").update({
                jumlah_dibayar: angka(p.jumlah_dibayar) + jumlah,
                metode_pembayaran: $("mMetode").value
            }).eq("id_pesanan", p.id_pesanan);
            if (error) { toast(pesanError(error), true); return false; }
            toast(`Pembayaran ${rupiah(jumlah)} untuk ${p.kode_pesanan} dicatat.`);
            await muatSemuaData();
        });
}

function konfirmasi(judul, pesanHTML, labelTombol, aksi) {
    bukaModal(judul, `<div class="modal-info">${pesanHTML}</div>`, labelTombol, aksi);
}


// =====================================================
// 11. TOMBOL AKSI DI TABEL / KARTU (event delegation)
// =====================================================

document.addEventListener("click", async (e) => {
    const tombol = e.target.closest("[data-aksi]");
    if (!tombol) return;

    const id = Number(tombol.dataset.id);
    const pesanan = state.pesanan.find(x => x.id_pesanan === id);

    switch (tombol.dataset.aksi) {

        case "status":
            tombol.disabled = true;
            await ubahStatusPengiriman(id, tombol.dataset.status);
            break;

        case "ubah-kirim":
            if (pesanan) bukaModalPengiriman(pesanan);
            break;

        case "bayar":
            if (pesanan) bukaModalBayar(pesanan);
            break;

        case "batal":
            if (!pesanan) return;
            konfirmasi(`Batalkan ${pesanan.kode_pesanan}?`,
                `Pesanan <b>${esc(pesanan.nama_pelanggan)}</b> akan dibatalkan dan dikeluarkan dari monitoring.
                 ${angka(pesanan.jumlah_dibayar) > 0 ? `<br>Uang muka <b>${esc(rupiah(pesanan.jumlah_dibayar))}</b> perlu dikembalikan atau diselesaikan dengan pelanggan.` : ""}`,
                "Ya, batalkan",
                async () => {
                    const { error } = await supabaseClient.from("pesanan")
                        .update({ status_pesanan: "Dibatalkan" }).eq("id_pesanan", id);
                    if (error) { toast(pesanError(error), true); return false; }
                    toast("Pesanan dibatalkan.");
                    await muatSemuaData();
                });
            break;

        case "hapus-pesanan":
            if (!pesanan) return;
            konfirmasi(`Hapus ${pesanan.kode_pesanan}?`,
                "Pesanan beserta data pengirimannya akan dihapus permanen. Untuk pesanan yang tidak jadi, sebaiknya gunakan <b>Batalkan</b> agar jejaknya tetap tercatat.",
                "Hapus permanen",
                async () => {
                    const { error } = await supabaseClient.from("pesanan").delete().eq("id_pesanan", id);
                    if (error) { toast(pesanError(error), true); return false; }
                    toast("Pesanan dihapus.");
                    await muatSemuaData();
                });
            break;

        case "edit-pelanggan":
            editPelanggan(id);
            break;

        case "hapus-pelanggan": {
            const p = state.pelanggan.find(x => x.id_pelanggan === id);
            if (!p) return;
            konfirmasi("Hapus pelanggan?", `Hapus <b>${esc(p.nama_pelanggan)}</b>? Pelanggan yang sudah memiliki pesanan tidak dapat dihapus.`,
                "Hapus", async () => {
                    const { error } = await supabaseClient.from("pelanggan").delete().eq("id_pelanggan", id);
                    if (error) { toast(pesanError(error), true); return false; }
                    toast("Pelanggan dihapus.");
                    await muatSemuaData();
                });
            break;
        }

        case "edit-paket":
            editPaket(id);
            break;

        case "toggle-paket": {
            const p = state.paket.find(x => x.id_paket === id);
            if (!p) return;
            const { error } = await supabaseClient.from("paket_katering")
                .update({ aktif: !p.aktif }).eq("id_paket", id);
            if (error) return toast(pesanError(error), true);
            toast(`Paket ${p.aktif ? "dinonaktifkan" : "diaktifkan"}.`);
            await muatSemuaData();
            break;
        }

        case "hapus-paket": {
            const p = state.paket.find(x => x.id_paket === id);
            if (!p) return;
            konfirmasi("Hapus paket?", `Hapus <b>${esc(p.nama_paket)}</b>? Paket yang sudah pernah dipesan tidak dapat dihapus; nonaktifkan saja.`,
                "Hapus", async () => {
                    const { error } = await supabaseClient.from("paket_katering").delete().eq("id_paket", id);
                    if (error) { toast(pesanError(error), true); return false; }
                    toast("Paket dihapus.");
                    await muatSemuaData();
                });
            break;
        }
    }
});


// =====================================================
// 12. PENGGUNA & AKSES (khusus pemilik)
// =====================================================

function labelPeran(peran) {
    if (peran && AKSES[peran]) return AKSES[peran].label;
    return peran === "nonaktif" ? "Nonaktif" : "Menunggu persetujuan";
}

function formatTanggalWaktu(ts) {
    if (!ts) return "-";
    return new Date(ts).toLocaleString("id-ID", {
        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
}

async function muatPengguna() {
    if (state.peran !== "pemilik") return;
    const { data, error } = await supabaseClient.rpc("daftar_pengguna");
    if (error) return toast(pesanError(error), true);
    state.pengguna = data || [];
    renderPengguna();
}

function renderPengguna() {
    const data = state.pengguna;
    const menunggu = data.filter(u => !u.peran).length;
    $("infoPengguna").textContent = `${data.length} pengguna` +
        (menunggu ? `, ${menunggu} menunggu persetujuan` : "");

    const pilihan = (u) => {
        const opsi = ["pemilik", "admin", "kurir", "nonaktif"];
        return (u.peran ? "" : `<option value="" selected>Menunggu persetujuan</option>`) +
            opsi.map(o => `<option value="${o}" ${u.peran === o ? "selected" : ""}>${esc(labelPeran(o))}</option>`).join("");
    };

    $("tabelPengguna").innerHTML = data.length === 0
        ? baris(6, "Belum ada pengguna.")
        : data.map(u => {
            const saya = state.user && u.id === state.user.id;
            const status = !u.peran ? "Menunggu" : (u.peran === "nonaktif" ? "Nonaktif" : "Aktif");
            return `
            <tr>
                <td>
                    <b>${esc(u.nama_lengkap || "-")}</b>${saya ? ` <span class="badge b-baru">Anda</span>` : ""}
                    <span class="sub">${esc(u.email)}</span>
                </td>
                <td>
                    <select data-peran-untuk="${esc(u.id)}" ${saya ? "disabled" : ""} aria-label="Peran ${esc(u.email)}">
                        ${pilihan(u)}
                    </select>
                </td>
                <td>
                    ${badge(status === "Aktif" ? "Aktif" : status === "Menunggu" ? "Menunggu" : "Nonaktif")}
                    ${u.email_terkonfirmasi ? "" : `<span class="sub">Email belum dikonfirmasi</span>`}
                </td>
                <td>${u.login_terakhir ? esc(formatTanggalWaktu(u.login_terakhir)) : `<span class="muted">Belum pernah</span>`}</td>
                <td>${esc(formatTanggalWaktu(u.dibuat))}</td>
                <td class="actions">
                    ${saya ? `<span class="muted small">Ubah melalui menu profil</span>` : `
                    <button class="btn btn-primary btn-sm" data-aksi-pengguna="simpan-peran" data-uid="${esc(u.id)}">Simpan peran</button>
                    <button class="btn btn-light btn-sm" data-aksi-pengguna="reset-sandi" data-email="${esc(u.email)}">Kirim reset sandi</button>`}
                </td>
            </tr>`;
        }).join("");
}

document.addEventListener("click", async (e) => {
    const tombol = e.target.closest("[data-aksi-pengguna]");
    if (!tombol || state.peran !== "pemilik") return;

    if (tombol.dataset.aksiPengguna === "simpan-peran") {
        const uid = tombol.dataset.uid;
        const select = document.querySelector(`select[data-peran-untuk="${CSS.escape(uid)}"]`);
        if (!select.value) return toast("Pilih peran terlebih dahulu.", true);

        tombol.classList.add("loading");
        const { error } = await supabaseClient.rpc("atur_peran_pengguna", { p_user_id: uid, p_peran: select.value });
        tombol.classList.remove("loading");

        if (error) return toast(pesanError(error), true);
        toast(`Peran diubah menjadi ${labelPeran(select.value)}.`);
        muatPengguna();
    }

    if (tombol.dataset.aksiPengguna === "reset-sandi") {
        const email = tombol.dataset.email;
        konfirmasi("Kirim tautan reset kata sandi?",
            `Tautan untuk membuat kata sandi baru akan dikirim ke <b>${esc(email)}</b>.`,
            "Kirim tautan",
            async () => {
                const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: urlAplikasi() });
                if (error) { toast(pesanErrorAuth(error), true); return false; }
                toast("Tautan reset kata sandi telah dikirim.");
            });
    }
});

$("formPengguna").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nama = $("pgNama").value.trim();
    const email = $("pgEmail").value.trim().toLowerCase();
    const sandi = $("pgSandi").value;
    const peran = $("pgPeran").value;

    const cek = cekKekuatanSandi(sandi);
    if (!nama) return toast("Isi nama lengkap pengguna.", true);
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Format email tidak valid.", true);
    if (!cek.valid) return toast(cek.pesan, true);

    const tombol = $("btnTambahPengguna");
    tombol.classList.add("loading");

    try {
        // Klien sementara tanpa penyimpanan sesi, agar pemilik tidak
        // ikut berpindah akun saat mendaftarkan pengguna baru.
        const klienSementara = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
                storageKey: "sia-pendaftaran-sementara"
            }
        });

        const { data, error } = await klienSementara.auth.signUp({
            email,
            password: sandi,
            options: { data: { nama_lengkap: nama } }
        });

        if (error) return toast(pesanErrorAuth(error), true);
        if (!data.user || (data.user.identities && data.user.identities.length === 0)) {
            return toast("Email tersebut sudah terdaftar. Atur perannya dari daftar pengguna.", true);
        }

        const { error: errPeran } = await supabaseClient.rpc("atur_peran_pengguna", {
            p_user_id: data.user.id,
            p_peran: peran
        });
        if (errPeran) return toast(pesanError(errPeran), true);

        if (data.session) await klienSementara.auth.signOut({ scope: "local" });

        toast(`Akun ${email} dibuat dengan peran ${labelPeran(peran)}.`);
        $("formPengguna").reset();
        perbaruiMeterSandi("pgSandi");
        muatPengguna();
    } finally {
        tombol.classList.remove("loading");
    }
});


// =====================================================
// 13. PENERAPAN PERAN DAN MULAI APLIKASI
//     aktifkanAplikasi() dipanggil oleh js/auth.js setelah login.
// =====================================================

let intervalMuat = null;

function inisial(nama) {
    return String(nama || "?").trim().split(/\s+/).slice(0, 2)
        .map(k => k[0] || "").join("").toUpperCase() || "?";
}

function terapkanPeran() {
    const izin = menuDiizinkan();
    document.querySelectorAll(".menu a").forEach(a =>
        a.classList.toggle("hidden", !izin.includes(a.dataset.page)));

    $("kartuFormPaket").classList.toggle("hidden", !bisa("kelolaPaket"));
    $("formPesanan").closest(".card").classList.toggle("hidden", !bisa("catatPesanan"));
    $("formPelanggan").closest(".card").classList.toggle("hidden", !bisa("kelolaPelanggan"));
    $("monTugasSayaWrap").classList.toggle("hidden", state.peran !== "kurir");

    $("userNama").textContent = state.namaSaya;
    $("userPeran").textContent = labelPeran(state.peran);
    $("userAvatar").textContent = inisial(state.namaSaya);
    $("userChip").title = state.user ? state.user.email : "";
}

async function aktifkanAplikasi(user, peran) {
    const penggunaBaru = !state.user || state.user.id !== user.id;

    state.user = user;
    state.peran = peran;
    state.namaSaya = (user.user_metadata && user.user_metadata.nama_lengkap) || user.email;

    terapkanPeran();
    $("appLayout").classList.remove("hidden");

    if (penggunaBaru) {
        state.pelanggan = [];
        state.paket = [];
        state.pesanan = [];
        state.pengguna = [];
    }

    tampilkanHalaman(location.hash.replace("#", ""));
    await muatSemuaData();

    if (!intervalMuat) {
        // Monitoring diperbarui otomatis setiap 60 detik.
        intervalMuat = setInterval(() => {
            if (state.peran
                && document.visibilityState === "visible"
                && ["dashboard", "monitoring"].includes(state.halaman)
                && $("modal").classList.contains("hidden")) {
                muatSemuaData();
            }
        }, 60000);
    }
}

function nonaktifkanAplikasi() {
    state.user = null;
    state.peran = null;
    state.namaSaya = "";
    state.pelanggan = [];
    state.paket = [];
    state.pesanan = [];
    state.pengguna = [];
    clearInterval(intervalMuat);
    intervalMuat = null;
    tutupModal();
    $("userMenu").classList.add("hidden");
    $("appLayout").classList.add("hidden");
    renderSemua();
}

function mulai() {
    const today = hariIni();

    document.title = "SIA Pendapatan - " + NAMA_USAHA;
    $("namaUsaha").textContent = NAMA_USAHA;
    $("tanggalHariIni").textContent =
        new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    $("monTanggal").value = today;
    $("psTanggalKirim").value = tambahHari(today, 1);
    $("psTanggalKirim").min = today;
    $("lapDari").value = today.slice(0, 8) + "01";
    $("lapSampai").value = today;

    $("btnMuatUlang").addEventListener("click", async () => {
        await muatSemuaData();
        if (state.halaman === "pengguna") await muatPengguna();
        toast("Data diperbarui.");
    });
}

mulai();
