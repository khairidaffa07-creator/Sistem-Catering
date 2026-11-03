// =====================================================
// SIA PENDAPATAN USAHA KATERING - GRAFIK & ANALISIS OTOMATIS
// -----------------------------------------------------
// 1. buatGrafikGaris(): grafik garis SVG dengan tooltip, tanpa
//    library tambahan.
// 2. susunAnalisis(): menyusun kalimat analisis pendapatan secara
//    otomatis dari data pesanan, pengiriman, dan pembayaran.
// =====================================================


// =====================================================
// 1. FORMAT ANGKA
// =====================================================

function rupiahSingkat(n) {
    const a = Math.abs(n);
    const f = (x) => x.toLocaleString("id-ID", { maximumFractionDigits: 1 });
    if (a >= 1e9) return "Rp " + f(n / 1e9) + " M";
    if (a >= 1e6) return "Rp " + f(n / 1e6) + " jt";
    if (a >= 1e3) return "Rp " + f(n / 1e3) + " rb";
    return "Rp " + Math.round(n);
}

function persen(x, digit = 1) {
    return (x * 100).toLocaleString("id-ID", { minimumFractionDigits: digit, maximumFractionDigits: digit }) + "%";
}

function angkaNice(maks) {
    if (maks <= 0) return 1;
    const kasar = maks / 4;
    const pangkat = Math.pow(10, Math.floor(Math.log10(kasar)));
    const langkah = [1, 2, 2.5, 5, 10].map(k => k * pangkat).find(k => k >= kasar);
    return langkah * 4;
}

function daftarTanggal(dari, sampai) {
    const hasil = [];
    for (let t = dari; t <= sampai; t = tambahHari(t, 1)) hasil.push(t);
    return hasil;
}


// =====================================================
// 2. GRAFIK GARIS (SVG)
//    seri: [{ nama, nilai: [], warna, putus: bool, tanggal: [] }]
// =====================================================

function buatGrafikGaris(el, { label, seri }) {
    const W = 1000, H = 300;
    const P = { kiri: 66, kanan: 14, atas: 14, bawah: 30 };
    const lebar = W - P.kiri - P.kanan;
    const tinggi = H - P.atas - P.bawah;
    const n = label.length;

    const semua = seri.flatMap(s => s.nilai);
    const maks = angkaNice(Math.max(...semua, 0));

    if (!n || Math.max(...semua, 0) === 0) {
        el.innerHTML = `<div class="chart-empty">Belum ada pendapatan yang diakui pada rentang ini.</div>`;
        return;
    }

    const x = (i) => P.kiri + (n === 1 ? lebar / 2 : (i * lebar) / (n - 1));
    const y = (v) => P.atas + tinggi - (v / maks) * tinggi;

    // Garis bantu sumbu Y
    let grid = "";
    for (let k = 0; k <= 4; k++) {
        const v = (maks / 4) * k;
        grid += `<line class="grid-line" x1="${P.kiri}" x2="${W - P.kanan}" y1="${y(v)}" y2="${y(v)}"/>
                 <text class="axis-label" x="${P.kiri - 8}" y="${y(v) + 4}" text-anchor="end">${esc(rupiahSingkat(v))}</text>`;
    }

    // Label sumbu X (maksimal sekitar 8 label)
    const langkah = Math.max(1, Math.ceil(n / 8));
    let labelX = "";
    label.forEach((t, i) => {
        if (i % langkah === 0 || i === n - 1) {
            if (i === n - 1 && i % langkah !== 0 && (n - 1) % langkah < langkah / 2) return;
            labelX += `<text class="axis-label" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(formatTanggal(t, { day: "numeric", month: "short" }))}</text>`;
        }
    });

    // Garis dan area setiap seri
    const utama = seri[0];
    const titikUtama = utama.nilai.map((v, i) => `${x(i)},${y(v)}`);
    const area = `M${x(0)},${y(0)} L${titikUtama.join(" L")} L${x(n - 1)},${y(0)} Z`;

    const garis = seri.map(s => `
        <polyline fill="none" stroke="${s.warna}" stroke-width="${s.putus ? 2 : 2.75}"
            stroke-linejoin="round" stroke-linecap="round" ${s.putus ? 'stroke-dasharray="5 5"' : ""}
            points="${s.nilai.map((v, i) => `${x(i)},${y(v)}`).join(" ")}"/>`).reverse().join("");

    const titik = n <= 31
        ? utama.nilai.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="${v > 0 ? 3 : 2}" fill="#fff" stroke="${utama.warna}" stroke-width="2"/>`).join("")
        : "";

    const idGradien = "grad-" + Math.random().toString(36).slice(2, 8);

    el.innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img"
             aria-label="Grafik garis ${esc(utama.nama)}">
            <defs>
                <linearGradient id="${idGradien}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="${utama.warna}" stop-opacity=".22"/>
                    <stop offset="1" stop-color="${utama.warna}" stop-opacity="0"/>
                </linearGradient>
            </defs>
            ${grid}
            <path d="${area}" fill="url(#${idGradien})"/>
            ${garis}
            ${titik}
            ${labelX}
            <line class="hover-line" x1="0" x2="0" y1="${P.atas}" y2="${P.atas + tinggi}" style="display:none"/>
            <circle class="hover-dot" r="5" fill="${utama.warna}" stroke="#fff" stroke-width="2" style="display:none"/>
            <rect class="hover-area" x="${P.kiri}" y="${P.atas}" width="${lebar}" height="${tinggi}" fill="transparent"/>
        </svg>
        <div class="chart-tip" style="display:none"></div>
        <div class="chart-legend">${seri.map(s =>
            `<span><i class="${s.putus ? "dash" : ""}" style="background:${s.warna}"></i>${esc(s.nama)}</span>`).join("")}
        </div>`;

    // Tooltip interaktif
    const svg = el.querySelector("svg");
    const tip = el.querySelector(".chart-tip");
    const garisHover = el.querySelector(".hover-line");
    const titikHover = el.querySelector(".hover-dot");

    const tampil = (evt) => {
        const kotak = svg.getBoundingClientRect();
        const skala = W / kotak.width;
        const px = (evt.clientX - kotak.left) * skala;
        const i = Math.max(0, Math.min(n - 1, Math.round(((px - P.kiri) / lebar) * (n - 1))));

        garisHover.setAttribute("x1", x(i));
        garisHover.setAttribute("x2", x(i));
        garisHover.style.display = "";
        titikHover.setAttribute("cx", x(i));
        titikHover.setAttribute("cy", y(utama.nilai[i]));
        titikHover.style.display = "";

        tip.innerHTML = seri.map(s => {
            const tgl = s.tanggal ? s.tanggal[i] : label[i];
            return `<div><span style="color:${s.putus ? "#cfcabd" : "#9fe0c0"}">${esc(formatTanggal(tgl, { weekday: "short", day: "numeric", month: "short" }))}</span>
                    &nbsp;<b>${esc(rupiah(s.nilai[i]))}</b></div>`;
        }).join("");
        tip.style.display = "";
        tip.style.left = (x(i) / skala) + "px";
        tip.style.top = (Math.min(y(utama.nilai[i]), y(seri[1] ? seri[1].nilai[i] : 0)) / skala) + "px";
    };

    const sembunyi = () => {
        tip.style.display = "none";
        garisHover.style.display = "none";
        titikHover.style.display = "none";
    };

    const area2 = el.querySelector(".hover-area");
    area2.addEventListener("mousemove", tampil);
    area2.addEventListener("mouseleave", sembunyi);
}


// Data deret harian pendapatan diakui untuk rentang tertentu.
function deretPendapatanHarian(dari, sampai) {
    const tanggal = daftarTanggal(dari, sampai);
    const peta = {};
    pesananAktif()
        .filter(p => p.status_pengiriman === "Terkirim" && p.tanggal_kirim >= dari && p.tanggal_kirim <= sampai)
        .forEach(p => { peta[p.tanggal_kirim] = (peta[p.tanggal_kirim] || 0) + angka(p.total_tagihan); });
    return { tanggal, nilai: tanggal.map(t => peta[t] || 0) };
}

// Menggambar grafik periode berjalan dibanding periode sebelumnya.
function gambarGrafikPerbandingan(el, dari, sampai) {
    const n = selisihHari(dari, sampai) + 1;
    const ini = deretPendapatanHarian(dari, sampai);
    const lalu = deretPendapatanHarian(tambahHari(dari, -n), tambahHari(dari, -1));

    buatGrafikGaris(el, {
        label: ini.tanggal,
        seri: [
            { nama: "Periode ini", nilai: ini.nilai, warna: "#1f6f50" },
            { nama: "Periode sebelumnya", nilai: lalu.nilai, warna: "#b9b3a4", putus: true, tanggal: lalu.tanggal }
        ]
    });
}


// =====================================================
// 3. ANALISIS OTOMATIS
//    Menghasilkan daftar temuan: { jenis, teks }.
//    jenis: naik | turun | info | peringatan | saran
// =====================================================

function susunAnalisis(dari, sampai, { lengkap = false, labelPeriode = "periode ini" } = {}) {
    const hasil = [];
    const tambah = (jenis, teks) => hasil.push({ jenis, teks });

    const today = hariIni();
    const n = selisihHari(dari, sampai) + 1;
    const dariLalu = tambahHari(dari, -n);
    const sampaiLalu = tambahHari(dari, -1);

    const aktif = pesananAktif();
    const terkirim = aktif.filter(p => p.status_pengiriman === "Terkirim");
    const dalam = (p, a, b) => p.tanggal_kirim >= a && p.tanggal_kirim <= b;
    const jml = (arr, f) => arr.reduce((s, p) => s + f(p), 0);

    const ini = terkirim.filter(p => dalam(p, dari, sampai));
    const lalu = terkirim.filter(p => dalam(p, dariLalu, sampaiLalu));
    const totalIni = jml(ini, p => angka(p.total_tagihan));
    const totalLalu = jml(lalu, p => angka(p.total_tagihan));
    const porsiIni = jml(ini, p => angka(p.jumlah_porsi));

    const saran = [];

    // --- 1. Ringkasan dan perbandingan periode ---
    let perubahan = null;
    if (ini.length === 0) {
        tambah("info", `Belum ada pendapatan yang diakui pada ${labelPeriode}, karena belum ada pesanan berstatus <b>Terkirim</b>.`);
    } else {
        let banding;
        if (totalLalu > 0) {
            perubahan = (totalIni - totalLalu) / totalLalu;
            const arah = perubahan >= 0 ? "naik" : "turun";
            banding = `Angka ini <b>${arah} ${persen(Math.abs(perubahan))}</b> dibanding periode sebelumnya (${esc(rupiah(totalLalu))}).`;
        } else {
            banding = "Periode sebelumnya belum memiliki pendapatan, sehingga persentase perubahan belum dapat dihitung.";
        }
        const jenis = perubahan === null ? "info" : perubahan >= 0.05 ? "naik" : perubahan <= -0.05 ? "turun" : "info";
        tambah(jenis, `Pendapatan diakui pada ${labelPeriode} sebesar <b>${esc(rupiah(totalIni))}</b> dari
            <b>${ini.length} pesanan</b> (${porsiIni.toLocaleString("id-ID")} porsi). ${banding}`);
        if (perubahan !== null && perubahan <= -0.1) saran.push("menghubungi kembali pelanggan langganan dan menawarkan promosi paket untuk memulihkan penjualan");
    }

    // --- 2. Tren harian dan hari tertinggi ---
    if (ini.length > 0 && n >= 5) {
        const deret = deretPendapatanHarian(dari, sampai).nilai;
        const rata = totalIni / n;
        const xm = (n - 1) / 2;
        const ym = rata;
        let atas = 0, bawah = 0;
        deret.forEach((v, i) => { atas += (i - xm) * (v - ym); bawah += (i - xm) ** 2; });
        const kemiringan = bawah ? atas / bawah : 0;
        const relatif = rata ? (kemiringan * (n - 1)) / rata : 0;

        const tren = relatif > 0.2 ? "cenderung meningkat" : relatif < -0.2 ? "cenderung menurun" : "relatif stabil";
        const iMaks = deret.indexOf(Math.max(...deret));
        const tglMaks = tambahHari(dari, iMaks);
        const kosong = deret.filter(v => v === 0).length;

        // Bila arah total periode berbeda dengan tren harian, jelaskan keduanya.
        const berlawanan = perubahan !== null &&
            ((perubahan >= 0.05 && relatif < -0.2) || (perubahan <= -0.05 && relatif > 0.2));
        const pembuka = berlawanan
            ? `Meskipun total periode ${perubahan > 0 ? "naik" : "turun"}, pendapatan harian di dalam periode ini <b>${tren}</b> sehingga arahnya perlu dipantau. Rata-rata pendapatan`
            : `Secara harian, pendapatan <b>${tren}</b> dengan rata-rata`;

        tambah(relatif > 0.2 ? "naik" : relatif < -0.2 ? "turun" : "info",
            `${pembuka} <b>${esc(rupiah(rata))}</b> per hari.
             Pendapatan tertinggi terjadi pada <b>${esc(formatTanggal(tglMaks, { weekday: "long", day: "numeric", month: "long" }))}</b>
             sebesar <b>${esc(rupiah(deret[iMaks]))}</b>.` +
            (lengkap && kosong > 0 ? ` Terdapat <b>${kosong} hari</b> tanpa pengiriman yang dapat dimanfaatkan untuk menjaring pesanan baru.` : ""));
        if (relatif < -0.2) saran.push("mengevaluasi penyebab penurunan pesanan harian");
    }

    // --- 3. Kontribusi paket ---
    if (ini.length > 0) {
        const per = {};
        ini.forEach(p => {
            const k = per[p.nama_paket] ||= { total: 0, porsi: 0 };
            k.total += angka(p.total_tagihan);
            k.porsi += angka(p.jumlah_porsi);
        });
        const urutTotal = Object.entries(per).sort((a, b) => b[1].total - a[1].total);
        const urutPorsi = Object.entries(per).sort((a, b) => b[1].porsi - a[1].porsi);
        const [namaTop, top] = urutTotal[0];
        const bagian = top.total / totalIni;

        let teks = `Paket <b>${esc(namaTop)}</b> menjadi penyumbang pendapatan terbesar (<b>${persen(bagian)}</b> dari total).`;
        if (urutPorsi[0][0] !== namaTop) {
            teks += ` Dari sisi jumlah porsi, paket terlaris adalah <b>${esc(urutPorsi[0][0])}</b> (${urutPorsi[0][1].porsi.toLocaleString("id-ID")} porsi).`;
        }
        if (lengkap && urutTotal.length > 1) {
            const [namaBawah, bawah] = urutTotal[urutTotal.length - 1];
            teks += ` Kontribusi terkecil berasal dari <b>${esc(namaBawah)}</b> (${persen(bawah.total / totalIni)}).`;
        }
        tambah("info", teks);
    }

    // --- 4. Konsentrasi pelanggan ---
    if (ini.length > 0) {
        const per = {};
        ini.forEach(p => { per[p.nama_pelanggan] = (per[p.nama_pelanggan] || 0) + angka(p.total_tagihan); });
        const [nama, nilai] = Object.entries(per).sort((a, b) => b[1] - a[1])[0];
        const bagian = nilai / totalIni;
        if (bagian > 0.4) {
            tambah("peringatan", `Ketergantungan pada satu pelanggan cukup tinggi: <b>${esc(nama)}</b> menyumbang
                <b>${persen(bagian)}</b> pendapatan. Bila pelanggan ini berhenti memesan, pendapatan akan turun signifikan.`);
            saran.push("memperluas basis pelanggan agar pendapatan tidak bergantung pada satu pelanggan");
        } else if (lengkap) {
            tambah("info", `Pendapatan tersebar cukup merata. Pelanggan terbesar adalah <b>${esc(nama)}</b>
                dengan kontribusi <b>${persen(bagian)}</b>, dari total ${Object.keys(per).length} pelanggan yang dilayani.`);
        }
    }

    // --- 5. Piutang usaha ---
    const piutang = terkirim
        .filter(p => angka(p.sisa_tagihan) > 0)
        .map(p => ({ ...p, umur: selisihHari(p.tanggal_kirim, today) }))
        .sort((a, b) => b.umur - a.umur);
    const totalPiutang = jml(piutang, p => angka(p.sisa_tagihan));

    if (piutang.length === 0) {
        tambah("naik", "Seluruh pesanan yang sudah terkirim telah <b>lunas</b>, sehingga tidak ada piutang usaha yang perlu ditagih.");
    } else {
        const lewat30 = piutang.filter(p => p.umur > 30);
        const rasio = totalIni ? totalPiutang / totalIni : null;
        const tertua = piutang[0];
        let teks = `Piutang usaha saat ini <b>${esc(rupiah(totalPiutang))}</b> dari <b>${piutang.length} pesanan</b>` +
            (rasio !== null ? `, setara <b>${persen(rasio)}</b> dari pendapatan ${labelPeriode}.` : ".") +
            ` Piutang tertua berumur <b>${tertua.umur} hari</b> (${esc(tertua.nama_pelanggan)}, ${esc(tertua.kode_pesanan)}).`;
        if (lewat30.length) {
            teks += ` Sebanyak <b>${lewat30.length} pesanan</b> senilai <b>${esc(rupiah(jml(lewat30, p => angka(p.sisa_tagihan))))}</b> sudah lewat 30 hari.`;
            saran.push("memprioritaskan penagihan piutang yang berumur lebih dari 30 hari");
        }
        tambah(lewat30.length || (rasio !== null && rasio > 0.25) ? "peringatan" : "info", teks);
        if (!lewat30.length && rasio !== null && rasio > 0.25) saran.push("menagih sisa pembayaran segera setelah katering diterima pelanggan");
    }

    // --- 6. Pesanan mendatang dan pendapatan diterima di muka ---
    const mendatang = aktif.filter(p => p.status_pengiriman !== "Terkirim" && p.tanggal_kirim >= today);
    if (lengkap || mendatang.length) {
        if (mendatang.length) {
            const dp = jml(mendatang, p => angka(p.jumlah_dibayar));
            tambah("info", `Terdapat <b>${mendatang.length} pesanan</b> terjadwal dengan nilai
                <b>${esc(rupiah(jml(mendatang, p => angka(p.total_tagihan))))}</b>.` +
                (dp > 0 ? ` Uang muka <b>${esc(rupiah(dp))}</b> yang sudah diterima masih dicatat sebagai
                <i>pendapatan diterima di muka</i> dan baru diakui sebagai pendapatan setelah katering terkirim.`
                        : " Belum ada uang muka yang diterima untuk pesanan tersebut."));
        } else {
            tambah("peringatan", "Belum ada pesanan yang terjadwal untuk hari-hari mendatang.");
            saran.push("aktif menawarkan paket kepada pelanggan karena belum ada pesanan mendatang");
        }
    }

    // --- 7. Ketepatan waktu pengiriman ---
    const adaWaktu = ini.filter(p => p.waktu_tiba);
    if (adaWaktu.length >= 3) {
        const telat = adaWaktu.filter(p => {
            const jadwal = new Date(`${p.tanggal_kirim}T${p.jam_kirim}`);
            return new Date(p.waktu_tiba) - jadwal > 15 * 60000;
        });
        const tepat = 1 - telat.length / adaWaktu.length;
        if (lengkap || tepat < 0.9) {
            tambah(tepat >= 0.9 ? "naik" : tepat < 0.8 ? "peringatan" : "info",
                `Sebanyak <b>${persen(tepat)}</b> pengiriman tiba tepat waktu (toleransi 15 menit dari jam kirim)` +
                (telat.length ? `, sedangkan <b>${telat.length} pengiriman</b> terlambat.` : "."));
        }
        if (tepat < 0.9) saran.push("mengevaluasi jadwal keberangkatan kurir agar pengiriman tidak terlambat");
    }

    // --- 8. Rekomendasi ---
    if (saran.length) {
        const kalimat = saran.slice(0, 3);
        const gabung = kalimat.length > 1
            ? kalimat.slice(0, -1).join(", ") + ", serta " + kalimat[kalimat.length - 1]
            : kalimat[0];
        tambah("saran", `<b>Rekomendasi:</b> pemilik disarankan ${esc(gabung)}.`);
    } else if (ini.length) {
        tambah("saran", "<b>Rekomendasi:</b> kinerja pendapatan dalam kondisi baik. Pertahankan kualitas layanan dan ketepatan pengiriman.");
    }

    return hasil;
}

function renderAnalisis(el, temuan) {
    const ikon = { naik: "&#8599;", turun: "&#8600;", info: "i", peringatan: "!", saran: "&#10003;" };
    el.innerHTML = temuan.map(t => `
        <div class="insight ${t.jenis}">
            <span class="ico">${ikon[t.jenis]}</span>
            <div>${t.teks}</div>
        </div>`).join("");
}
