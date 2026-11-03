// =====================================================
// SIA PENDAPATAN USAHA KATERING - AUTENTIKASI
// -----------------------------------------------------
// Login, pendaftaran, lupa kata sandi, kata sandi baru, profil,
// logout, dan logout otomatis saat tidak aktif, menggunakan
// Supabase Auth. Peran pengguna dibaca dari fungsi database
// peran_saya() sehingga tidak dapat dimanipulasi dari browser.
// =====================================================

const PERAN_VALID = ["pemilik", "admin", "kurir"];

let modePemulihan = /type=recovery/.test(location.hash + location.search);
let pesanSetelahKeluar = null;
let sesiDiproses = null;


// =====================================================
// 1. FUNGSI BANTU
// =====================================================

function urlAplikasi() {
    return location.origin + location.pathname;
}

function aturAlertAuth(pesan, jenis = "error") {
    const el = $("authAlert");
    if (!pesan) {
        el.classList.add("hidden");
        return;
    }
    el.className = "auth-alert " + (jenis === "error" ? "" : jenis);
    el.textContent = pesan;
}

function tampilkanAuth(view, pesan = null, jenis = "error") {
    $("authScreen").classList.remove("hidden", "memuat");
    $("appLayout").classList.add("hidden");

    document.querySelectorAll(".auth-view").forEach(el =>
        el.classList.toggle("hidden", el.dataset.view !== view));

    aturAlertAuth(pesan, jenis);

    const input = document.querySelector(`.auth-view[data-view="${view}"] input:not([type=checkbox])`);
    if (input && window.matchMedia("(min-width: 900px)").matches) setTimeout(() => input.focus(), 50);
}

function sembunyikanAuth() {
    $("authScreen").classList.add("hidden");
    $("authScreen").classList.remove("memuat");
}

function setMemuat(tombol, aktif) {
    tombol.classList.toggle("loading", aktif);
    tombol.disabled = aktif;
}

// Menerjemahkan pesan error Supabase Auth ke Bahasa Indonesia.
function pesanErrorAuth(error) {
    const t = String((error && error.message) || "").toLowerCase();

    if (t.includes("invalid login credentials")) return "Email atau kata sandi salah.";
    if (t.includes("email not confirmed")) return "Email belum dikonfirmasi. Buka tautan konfirmasi di email Anda atau minta pemilik mengaktifkan akun.";
    if (t.includes("already registered") || t.includes("already been registered")) return "Email tersebut sudah terdaftar.";
    if (t.includes("signups not allowed") || t.includes("signup is disabled")) return "Pendaftaran akun baru sedang dinonaktifkan. Hubungi pemilik usaha.";
    if (t.includes("password should be") || t.includes("weak password")) return "Kata sandi terlalu lemah. Gunakan minimal 8 karakter berisi huruf dan angka.";
    if (t.includes("should be different")) return "Kata sandi baru harus berbeda dari kata sandi lama.";
    if (t.includes("rate limit") || t.includes("for security purposes") || t.includes("too many")) return "Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.";
    if (t.includes("error sending") || t.includes("smtp")) return "Email gagal dikirim. Periksa pengaturan email di Supabase (lihat README).";
    if (t.includes("invalid email") || t.includes("unable to validate email")) return "Format email tidak valid.";
    if (t.includes("expired") || t.includes("invalid flow") || t.includes("otp")) return "Tautan sudah kedaluwarsa atau tidak valid. Minta tautan baru.";
    if (t.includes("failed to fetch") || t.includes("network") || t.includes("load failed"))
        return "Tidak dapat terhubung ke Supabase. Periksa tiga hal: (1) Project URL di js/supabase.js sudah benar, " +
               "(2) proyek Supabase tidak sedang dijeda (Paused) di dashboard Supabase, dan (3) koneksi internet aktif.";
    return (error && error.message) || "Terjadi kesalahan. Silakan coba lagi.";
}

const PESAN_BELUM_KONFIGURASI =
    "Konfigurasi Supabase belum diisi. Buka file js/supabase.js, isi Project URL dan Publishable key, lalu jalankan database/database.sql di SQL Editor Supabase.";

// Formulir tidak dikirim bila konfigurasi Supabase masih kosong.
function konfigurasiSiap() {
    if (KONFIGURASI_TERISI) return true;
    aturAlertAuth(PESAN_BELUM_KONFIGURASI, "info");
    return false;
}

function emailValid(email) {
    return /^\S+@\S+\.\S+$/.test(email);
}


// =====================================================
// 2. KEKUATAN KATA SANDI, TAMPILKAN SANDI, CAPS LOCK
// =====================================================

function cekKekuatanSandi(sandi) {
    const s = String(sandi || "");
    let skor = 0;
    if (s.length >= 8) skor++;
    if (/[a-z]/.test(s) && /[A-Z]/.test(s)) skor++;
    if (/\d/.test(s)) skor++;
    if (/[^A-Za-z0-9]/.test(s) || s.length >= 12) skor++;
    if (s.length < 8) skor = Math.min(skor, 1);

    const valid = s.length >= 8 && /[A-Za-z]/.test(s) && /\d/.test(s);
    const label = ["Terlalu lemah", "Lemah", "Cukup", "Kuat", "Sangat kuat"][skor];

    return {
        skor,
        valid,
        label,
        pesan: valid ? label : "Kata sandi minimal 8 karakter dan harus berisi huruf serta angka."
    };
}

function perbaruiMeterSandi(idInput) {
    const nilai = $(idInput).value;
    const meter = document.querySelector(`[data-strength-for="${idInput}"]`);
    const teks = document.querySelector(`[data-strength-text="${idInput}"]`);
    const hasil = cekKekuatanSandi(nilai);

    if (meter) meter.dataset.skor = nilai ? Math.max(hasil.skor, 1) : 0;
    if (teks) {
        teks.textContent = nilai
            ? `Kekuatan: ${hasil.label}${hasil.valid ? "" : " (minimal 8 karakter, berisi huruf dan angka)"}`
            : "Minimal 8 karakter, berisi huruf dan angka.";
    }
}

document.addEventListener("input", (e) => {
    if (e.target.id && document.querySelector(`[data-strength-for="${e.target.id}"]`)) {
        perbaruiMeterSandi(e.target.id);
    }
    e.target.classList.remove("invalid");
});

document.addEventListener("click", (e) => {
    const tombol = e.target.closest("[data-toggle-pw]");
    if (!tombol) return;
    const input = $(tombol.dataset.togglePw);
    const terlihat = input.type === "text";
    input.type = terlihat ? "password" : "text";
    tombol.textContent = terlihat ? "Lihat" : "Sembunyi";
    tombol.setAttribute("aria-label", terlihat ? "Tampilkan kata sandi" : "Sembunyikan kata sandi");
});

["keydown", "keyup"].forEach(ev =>
    $("masukSandi").addEventListener(ev, (e) => {
        if (e.getModifierState) $("capsMasuk").classList.toggle("hidden", !e.getModifierState("CapsLock"));
    }));

document.querySelectorAll("[data-auth-view]").forEach(link =>
    link.addEventListener("click", (e) => {
        e.preventDefault();
        const tujuan = link.dataset.authView;
        const email = $("masukEmail").value || $("daftarEmail").value || $("lupaEmail").value;
        if (tujuan === "lupa") $("lupaEmail").value = email;
        if (tujuan === "masuk") $("masukEmail").value = $("masukEmail").value || email;
        tampilkanAuth(tujuan);
    }));


// =====================================================
// 3. MEMPROSES SESI LOGIN
// =====================================================

async function prosesSesi(session) {
    if (!session) {
        nonaktifkanAplikasi();
        tampilkanAuth("masuk");
        return;
    }

    if (modePemulihan) {
        tampilkanAuth("sandi-baru");
        return;
    }

    // Cegah pemrosesan ganda untuk sesi yang sama.
    if (sesiDiproses === session.access_token) return;
    sesiDiproses = session.access_token;

    const { data: peran, error } = await supabaseClient.rpc("peran_saya");

    if (error) {
        sesiDiproses = null;
        tampilkanAuth("masuk", pesanError(error));
        return;
    }

    if (!PERAN_VALID.includes(peran)) {
        tampilkanMenunggu(session.user, peran);
        return;
    }

    sembunyikanAuth();
    await aktifkanAplikasi(session.user, peran);
    mulaiPantauAktivitas();
}

function tampilkanMenunggu(user, peran) {
    nonaktifkanAplikasi();
    const nonaktif = peran === "nonaktif";
    $("menungguJudul").textContent = nonaktif ? "Akun dinonaktifkan" : "Akun menunggu persetujuan";
    $("menungguTeks").textContent = nonaktif
        ? `Akun ${user.email} telah dinonaktifkan oleh pemilik usaha. Hubungi pemilik bila Anda memerlukan akses kembali.`
        : `Akun ${user.email} sudah terdaftar, tetapi belum diberi peran. Minta pemilik usaha memberikan akses melalui menu Pengguna & Akses, lalu tekan "Periksa lagi".`;
    tampilkanAuth("menunggu");
}

supabaseClient.auth.onAuthStateChange((event, session) => {
    // Panggilan Supabase lain tidak boleh langsung dijalankan di dalam
    // callback ini, sehingga ditunda ke antrean berikutnya.
    setTimeout(() => tanganiPerubahanAuth(event, session), 0);
});

function tanganiPerubahanAuth(event, session) {
    switch (event) {
        case "INITIAL_SESSION":
            if (!KONFIGURASI_TERISI) return;
            prosesSesi(session);
            break;

        case "PASSWORD_RECOVERY":
            modePemulihan = true;
            tampilkanAuth("sandi-baru");
            break;

        case "SIGNED_IN":
            if (!state.user || state.user.id !== session.user.id) prosesSesi(session);
            break;

        case "USER_UPDATED":
            if (state.user && session) {
                state.user = session.user;
                state.namaSaya = session.user.user_metadata.nama_lengkap || session.user.email;
                terapkanPeran();
            }
            break;

        case "SIGNED_OUT":
            sesiDiproses = null;
            hentikanPantauAktivitas();
            nonaktifkanAplikasi();
            tampilkanAuth("masuk", pesanSetelahKeluar || "Anda telah keluar.", pesanSetelahKeluar ? "info" : "success");
            pesanSetelahKeluar = null;
            break;
    }
}


// =====================================================
// 4. FORMULIR MASUK, DAFTAR, LUPA SANDI, SANDI BARU
// =====================================================

$("formMasuk").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!konfigurasiSiap()) return;
    const email = $("masukEmail").value.trim().toLowerCase();
    const sandi = $("masukSandi").value;

    if (!emailValid(email)) {
        $("masukEmail").classList.add("invalid");
        return aturAlertAuth("Masukkan email yang valid.");
    }
    if (!sandi) {
        $("masukSandi").classList.add("invalid");
        return aturAlertAuth("Masukkan kata sandi.");
    }

    // Disimpan sebelum login karena penyimpanan sesi membaca pilihan ini.
    aman(() => localStorage.setItem("sia_ingat_saya", $("masukIngat").checked ? "1" : "0"));

    const tombol = $("btnMasuk");
    setMemuat(tombol, true);
    aturAlertAuth(null);

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: sandi });
    setMemuat(tombol, false);

    if (error) {
        $("masukSandi").value = "";
        return aturAlertAuth(pesanErrorAuth(error));
    }

    $("masukSandi").value = "";
    await prosesSesi(data.session);
});

$("formDaftar").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!konfigurasiSiap()) return;
    const nama = $("daftarNama").value.trim();
    const email = $("daftarEmail").value.trim().toLowerCase();
    const sandi = $("daftarSandi").value;
    const cek = cekKekuatanSandi(sandi);

    if (!nama) { $("daftarNama").classList.add("invalid"); return aturAlertAuth("Isi nama lengkap Anda."); }
    if (!emailValid(email)) { $("daftarEmail").classList.add("invalid"); return aturAlertAuth("Masukkan email yang valid."); }
    if (!cek.valid) { $("daftarSandi").classList.add("invalid"); return aturAlertAuth(cek.pesan); }
    if (sandi !== $("daftarSandi2").value) { $("daftarSandi2").classList.add("invalid"); return aturAlertAuth("Ulangi kata sandi belum sama."); }

    const tombol = $("btnDaftar");
    setMemuat(tombol, true);
    aturAlertAuth(null);

    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password: sandi,
        options: { data: { nama_lengkap: nama }, emailRedirectTo: urlAplikasi() }
    });
    setMemuat(tombol, false);

    if (error) return aturAlertAuth(pesanErrorAuth(error));

    if (data.user && data.user.identities && data.user.identities.length === 0) {
        return aturAlertAuth("Email tersebut sudah terdaftar. Silakan masuk atau gunakan Lupa kata sandi.");
    }

    $("formDaftar").reset();
    perbaruiMeterSandi("daftarSandi");

    if (data.session) {
        await prosesSesi(data.session);
    } else {
        $("masukEmail").value = email;
        tampilkanAuth("masuk",
            "Pendaftaran berhasil. Buka tautan konfirmasi yang dikirim ke email Anda, lalu tunggu persetujuan pemilik usaha.",
            "success");
    }
});

$("formLupa").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!konfigurasiSiap()) return;
    const email = $("lupaEmail").value.trim().toLowerCase();
    if (!emailValid(email)) { $("lupaEmail").classList.add("invalid"); return aturAlertAuth("Masukkan email yang valid."); }

    const tombol = $("btnLupa");
    setMemuat(tombol, true);
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: urlAplikasi() });
    setMemuat(tombol, false);

    if (error) return aturAlertAuth(pesanErrorAuth(error));

    $("masukEmail").value = email;
    tampilkanAuth("masuk",
        "Jika email tersebut terdaftar, tautan untuk membuat kata sandi baru telah dikirim. Periksa kotak masuk atau folder spam.",
        "success");
});

$("formSandiBaru").addEventListener("submit", async (e) => {
    e.preventDefault();
    const sandi = $("baruSandi").value;
    const cek = cekKekuatanSandi(sandi);

    if (!cek.valid) { $("baruSandi").classList.add("invalid"); return aturAlertAuth(cek.pesan); }
    if (sandi !== $("baruSandi2").value) { $("baruSandi2").classList.add("invalid"); return aturAlertAuth("Ulangi kata sandi belum sama."); }

    const tombol = $("btnSandiBaru");
    setMemuat(tombol, true);
    const { error } = await supabaseClient.auth.updateUser({ password: sandi });
    setMemuat(tombol, false);

    if (error) return aturAlertAuth(pesanErrorAuth(error));

    modePemulihan = false;
    history.replaceState(null, "", urlAplikasi());
    $("formSandiBaru").reset();

    const { data } = await supabaseClient.auth.getSession();
    await prosesSesi(data.session);
    toast("Kata sandi berhasil diperbarui.");
});

$("btnCekLagi").addEventListener("click", async () => {
    const tombol = $("btnCekLagi");
    setMemuat(tombol, true);
    sesiDiproses = null;
    const { data } = await supabaseClient.auth.getSession();
    await prosesSesi(data.session);
    setMemuat(tombol, false);
    if (!state.peran && !$("authScreen").classList.contains("hidden")) {
        aturAlertAuth("Akun Anda belum diberi akses oleh pemilik.", "info");
    }
});

$("btnKeluarMenunggu").addEventListener("click", () => keluar());


// =====================================================
// 5. MENU PENGGUNA: PROFIL, UBAH SANDI, KELUAR
// =====================================================

async function keluar(pesan = null) {
    pesanSetelahKeluar = pesan;
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        // Bila server tidak dapat dihubungi, sesi lokal tetap dihapus.
        await supabaseClient.auth.signOut({ scope: "local" });
    }
}

$("userChip").addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = $("userMenu");
    menu.classList.toggle("hidden");
    $("userChip").setAttribute("aria-expanded", String(!menu.classList.contains("hidden")));
});

document.addEventListener("click", (e) => {
    if (!e.target.closest("#userMenu") && !e.target.closest("#userChip")) {
        $("userMenu").classList.add("hidden");
        $("userChip").setAttribute("aria-expanded", "false");
    }
});

$("btnKeluar").addEventListener("click", () => {
    $("userMenu").classList.add("hidden");
    keluar();
});

$("btnProfil").addEventListener("click", () => {
    $("userMenu").classList.add("hidden");
    const u = state.user;
    if (!u) return;

    bukaModal("Profil & kata sandi", `
        <div class="modal-info">
            <b>${esc(u.email)}</b><br>
            Peran: ${badge(labelPeran(state.peran))}
            &middot; login terakhir ${esc(formatTanggalWaktu(u.last_sign_in_at))}
        </div>
        <label>Nama lengkap
            <input id="profNama" value="${esc(state.namaSaya === u.email ? "" : state.namaSaya)}" maxlength="100" required>
        </label>
        <label>Kata sandi baru <span class="muted">(kosongkan bila tidak diganti)</span>
            <span class="pw-wrap">
                <input type="password" id="profSandi" autocomplete="new-password">
                <button type="button" class="pw-toggle" data-toggle-pw="profSandi" aria-label="Tampilkan kata sandi">Lihat</button>
            </span>
            <span class="strength" data-strength-for="profSandi"><i></i><i></i><i></i><i></i></span>
            <small class="muted strength-text" data-strength-text="profSandi">Minimal 8 karakter, berisi huruf dan angka.</small>
        </label>
        <label>Ulangi kata sandi baru
            <input type="password" id="profSandi2" autocomplete="new-password">
        </label>`,
        "Simpan profil",
        async () => {
            const nama = $("profNama").value.trim();
            const sandi = $("profSandi").value;
            if (!nama) { toast("Nama lengkap wajib diisi.", true); return false; }

            const perubahan = {};
            if (nama !== state.namaSaya) perubahan.data = { nama_lengkap: nama };

            if (sandi) {
                const cek = cekKekuatanSandi(sandi);
                if (!cek.valid) { toast(cek.pesan, true); return false; }
                if (sandi !== $("profSandi2").value) { toast("Ulangi kata sandi belum sama.", true); return false; }
                perubahan.password = sandi;
            }

            if (!perubahan.data && !perubahan.password) { toast("Tidak ada perubahan."); return; }

            const { error } = await supabaseClient.auth.updateUser(perubahan);
            if (error) { toast(pesanErrorAuth(error), true); return false; }

            toast(perubahan.password ? "Profil dan kata sandi diperbarui." : "Profil diperbarui.");
        });
});


// =====================================================
// 6. LOGOUT OTOMATIS SAAT TIDAK AKTIF
// =====================================================

let aktivitasTerakhir = Date.now();
let pemeriksaAktivitas = null;
const EVENT_AKTIVITAS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];

function catatAktivitas() {
    aktivitasTerakhir = Date.now();
}

function mulaiPantauAktivitas() {
    catatAktivitas();
    if (pemeriksaAktivitas) return;
    EVENT_AKTIVITAS.forEach(ev => window.addEventListener(ev, catatAktivitas, { passive: true }));

    pemeriksaAktivitas = setInterval(() => {
        const menit = (Date.now() - aktivitasTerakhir) / 60000;
        if (state.user && menit >= BATAS_TIDAK_AKTIF_MENIT) {
            keluar(`Sesi berakhir karena tidak ada aktivitas selama ${BATAS_TIDAK_AKTIF_MENIT} menit. Silakan masuk kembali.`);
        }
    }, 30000);
}

function hentikanPantauAktivitas() {
    EVENT_AKTIVITAS.forEach(ev => window.removeEventListener(ev, catatAktivitas));
    clearInterval(pemeriksaAktivitas);
    pemeriksaAktivitas = null;
}


// =====================================================
// 7. MULAI
// =====================================================

(function mulaiAuth() {
    $("authNamaUsaha").textContent = NAMA_USAHA;
    $("authFoot").textContent =
        `Sesi otomatis berakhir setelah ${BATAS_TIDAK_AKTIF_MENIT} menit tidak aktif.`;
    $("masukIngat").checked = aman(() => localStorage.getItem("sia_ingat_saya")) !== "0";

    if (!KONFIGURASI_TERISI) {
        tampilkanAuth("masuk", PESAN_BELUM_KONFIGURASI, "info");
        setKoneksi(false, "Konfigurasi Supabase belum diisi");
        return;
    }

    // Kartu login disembunyikan sebentar sampai status sesi diketahui,
    // agar pengguna yang sudah login tidak melihat kilasan halaman login.
    $("authScreen").classList.add("memuat");
})();
