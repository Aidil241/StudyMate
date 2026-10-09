/* KampusKu — jadwal, tugas, dan berkas kuliah. Semua data disimpan di perangkat (IndexedDB). */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const URUTAN_HARI = [1, 2, 3, 4, 5, 6, 0];
const KATEGORI = ['Materi', 'Tugas', 'Foto', 'Lainnya'];

/* ---------- Penyimpanan (IndexedDB) ---------- */
const DB_NAMA = 'kampusku';
let _db;
function bukaDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((ok, gagal) => {
    const req = indexedDB.open(DB_NAMA, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      ['jadwal', 'tugas', 'berkas'].forEach((n) => db.createObjectStore(n, { keyPath: 'id', autoIncrement: true }));
    };
    req.onsuccess = () => { _db = req.result; ok(_db); };
    req.onerror = () => gagal(req.error);
  });
}
async function tx(store, mode, fn) {
  const db = await bukaDB();
  return new Promise((ok, gagal) => {
    const t = db.transaction(store, mode);
    const hasil = fn(t.objectStore(store));
    t.oncomplete = () => ok(hasil && 'result' in hasil ? hasil.result : undefined);
    t.onerror = () => gagal(t.error);
    t.onabort = () => gagal(t.error);
  });
}
const semua = (s) => tx(s, 'readonly', (o) => o.getAll());
const simpan = (s, d) => tx(s, 'readwrite', (o) => o.put(d));
const hapus = (s, id) => tx(s, 'readwrite', (o) => o.delete(id));
const kosongkan = (s) => tx(s, 'readwrite', (o) => o.clear());

/* ---------- Util ---------- */
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const awalHari = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const sisaHari = (tgl) => Math.round((new Date(tgl + 'T00:00') - awalHari()) / 864e5);
function ukuran(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
function tglIndo(tgl) {
  return new Date(tgl + 'T00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
}
let _toast;
function toast(pesan) {
  const el = $('#toast');
  el.textContent = pesan;
  el.classList.add('show');
  clearTimeout(_toast);
  _toast = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------- State ---------- */
const state = { tab: 'beranda', filterMatkul: 'Semua', cari: '' };
let data = { jadwal: [], tugas: [], berkas: [] };
const urlAktif = [];

async function muatData() {
  const [jadwal, tugas, berkas] = await Promise.all([semua('jadwal'), semua('tugas'), semua('berkas')]);
  data = { jadwal, tugas, berkas };
}
async function segarkan() {
  await muatData();
  render();
}

/* ---------- Navigasi ---------- */
const JUDUL = { beranda: 'Beranda', jadwal: 'Jadwal Kuliah', tugas: 'Tugas', berkas: 'Berkas & Foto' };
function pindahTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + tab));
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('#judul').textContent = JUDUL[tab];
  $('#fab').classList.toggle('hidden', tab === 'beranda');
  scrollTo({ top: 0 });
  render();
}

function render() {
  urlAktif.splice(0).forEach((u) => URL.revokeObjectURL(u));
  const tgl = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('#subjudul').textContent = tgl;
  ({ beranda: renderBeranda, jadwal: renderJadwal, tugas: renderTugas, berkas: renderBerkas })[state.tab]();
}

/* ---------- Beranda ---------- */
function kelasHariIni() {
  const h = new Date().getDay();
  return data.jadwal.filter((j) => Number(j.hari) === h).sort((a, b) => a.mulai.localeCompare(b.mulai));
}
function tugasAktif() {
  return data.tugas.filter((t) => !t.selesai).sort((a, b) => a.deadline.localeCompare(b.deadline));
}
function renderBeranda() {
  const kelas = kelasHariIni();
  const aktif = tugasAktif();
  const telat = aktif.filter((t) => sisaHari(t.deadline) < 0).length;
  const jam = new Date().getHours();
  const sapa = jam < 11 ? 'Selamat pagi' : jam < 15 ? 'Selamat siang' : jam < 18 ? 'Selamat sore' : 'Selamat malam';

  $('#view-beranda').innerHTML = `
    <div class="card hero">
      <h2>${sapa}! 👋</h2>
      <p>${kelas.length ? `Hari ini ada ${kelas.length} kelas.` : 'Tidak ada kelas hari ini.'} ${aktif.length ? `${aktif.length} tugas belum selesai.` : 'Semua tugas beres.'}</p>
      <div class="stats">
        <div class="stat"><b>${kelas.length}</b><span>Kelas hari ini</span></div>
        <div class="stat"><b>${aktif.length}</b><span>Tugas aktif</span></div>
        <div class="stat"><b>${data.berkas.length}</b><span>Berkas</span></div>
      </div>
    </div>

    <div class="section-title"><h3>Kelas hari ini</h3><button class="link" data-go="jadwal">Lihat jadwal</button></div>
    <div class="card">
      ${kelas.length ? kelas.map(barisKelas).join('') : '<div class="empty" style="padding:14px"><b>Santai dulu</b>Tidak ada kelas terjadwal.</div>'}
    </div>

    <div class="section-title"><h3>Tugas terdekat</h3><button class="link" data-go="tugas">Semua tugas</button></div>
    <div class="card">
      ${aktif.length ? aktif.slice(0, 4).map(barisTugasRingkas).join('') : '<div class="empty" style="padding:14px"><b>Tidak ada tugas</b>Tambahkan lewat tab Tugas.</div>'}
      ${telat ? `<p class="sub" style="margin-top:12px">⚠️ ${telat} tugas sudah lewat deadline.</p>` : ''}
    </div>

    <div class="card" id="kotak-simpan"></div>
  `;
  $('#view-beranda').querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => pindahTab(b.dataset.go)));
  infoPenyimpanan();
}
function barisKelas(j) {
  return `<div class="row">
    <div class="time-pill">${esc(j.mulai)}<br>${esc(j.selesai || '')}</div>
    <div class="grow"><div class="title">${esc(j.matkul)}</div>
    <div class="sub">${[j.ruang, j.dosen].filter(Boolean).map(esc).join(' · ') || '—'}</div></div>
  </div>`;
}
function badgeDeadline(t) {
  if (t.selesai) return '<span class="badge ok">Selesai</span>';
  const s = sisaHari(t.deadline);
  if (s < 0) return `<span class="badge bad">Telat ${-s} hari</span>`;
  if (s === 0) return '<span class="badge warn">Hari ini</span>';
  if (s === 1) return '<span class="badge warn">Besok</span>';
  if (s <= 3) return `<span class="badge warn">${s} hari lagi</span>`;
  return `<span class="badge">${s} hari lagi</span>`;
}
function barisTugasRingkas(t) {
  return `<div class="row">
    <div class="grow"><div class="title">${esc(t.judul)}</div><div class="sub">${esc(t.matkul || 'Umum')} · ${tglIndo(t.deadline)}</div></div>
    ${badgeDeadline(t)}
  </div>`;
}
async function infoPenyimpanan() {
  const el = $('#kotak-simpan');
  if (!el) return;
  let teks = 'Data tersimpan di HP ini dan bisa dipakai tanpa internet.';
  try {
    if (navigator.storage?.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      teks = `Terpakai ${ukuran(usage)}${quota ? ' dari ±' + ukuran(quota) : ''} di HP ini.`;
    }
  } catch (_) { /* abaikan */ }
  el.innerHTML = `<div class="title">💾 Penyimpanan</div>
    <p class="sub">${teks}</p>
    <p class="sub" style="margin-top:6px">Lakukan <b>Backup</b> berkala lewat menu ⋮ agar data aman jika browser dibersihkan.</p>`;
}

/* ---------- Jadwal ---------- */
function renderJadwal() {
  const hariIni = new Date().getDay();
  let html = '';
  URUTAN_HARI.forEach((h) => {
    const items = data.jadwal.filter((j) => Number(j.hari) === h).sort((a, b) => a.mulai.localeCompare(b.mulai));
    if (!items.length) return;
    html += `<div class="day-head">${HARI[h]} ${h === hariIni ? '<span class="badge">Hari ini</span>' : ''}</div><div class="card">`;
    html += items.map((j) => `<button class="row" style="width:100%;text-align:left;background:none;border:0;padding:0" data-edit="${j.id}">
      <div class="time-pill">${esc(j.mulai)}<br>${esc(j.selesai || '')}</div>
      <div class="grow"><div class="title">${esc(j.matkul)}</div>
      <div class="sub">${[j.ruang, j.dosen].filter(Boolean).map(esc).join(' · ') || '—'}</div></div>
    </button>`).join('');
    html += '</div>';
  });
  $('#view-jadwal').innerHTML = html || kosong('Belum ada jadwal', 'Ketuk tombol + untuk menambah mata kuliah.');
  $('#view-jadwal').querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => formJadwal(data.jadwal.find((j) => j.id == b.dataset.edit))));
}
function kosong(judul, sub) {
  return `<div class="empty"><b>${judul}</b>${sub}</div>`;
}
function formJadwal(item) {
  bukaForm({
    judul: item ? 'Ubah jadwal' : 'Tambah jadwal',
    nilai: item || { hari: new Date().getDay(), mulai: '08:00', selesai: '09:40' },
    kolom: [
      { n: 'matkul', l: 'Mata kuliah', t: 'text', wajib: true, ph: 'mis. Basis Data' },
      { n: 'hari', l: 'Hari', t: 'select', opsi: URUTAN_HARI.map((h) => [h, HARI[h]]) },
      { n: 'mulai', l: 'Mulai', t: 'time', wajib: true },
      { n: 'selesai', l: 'Selesai', t: 'time' },
      { n: 'ruang', l: 'Ruang', t: 'text', ph: 'mis. Lab 2' },
      { n: 'dosen', l: 'Dosen', t: 'text' }
    ],
    onSimpan: async (v) => { v.hari = Number(v.hari); await simpan('jadwal', { ...item, ...v }); toast('Jadwal disimpan'); segarkan(); },
    onHapus: item && (async () => { await hapus('jadwal', item.id); toast('Jadwal dihapus'); segarkan(); })
  });
}

/* ---------- Tugas ---------- */
function renderTugas() {
  const aktif = tugasAktif();
  const selesai = data.tugas.filter((t) => t.selesai).sort((a, b) => b.deadline.localeCompare(a.deadline));
  const baris = (t) => `<div class="row ${t.selesai ? 'done' : ''}">
    <button class="check ${t.selesai ? 'on' : ''}" data-cek="${t.id}" aria-label="Tandai selesai"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></button>
    <button class="grow" style="text-align:left;background:none;border:0;padding:0" data-edit="${t.id}">
      <div class="title">${esc(t.judul)}</div>
      <div class="sub">${esc(t.matkul || 'Umum')} · ${tglIndo(t.deadline)}</div>
    </button>
    ${badgeDeadline(t)}
  </div>`;
  let html = '';
  if (aktif.length) html += `<div class="card">${aktif.map(baris).join('')}</div>`;
  if (selesai.length) html += `<div class="day-head muted">Selesai (${selesai.length})</div><div class="card">${selesai.map(baris).join('')}</div>`;
  $('#view-tugas').innerHTML = html || kosong('Belum ada tugas', 'Ketuk tombol + untuk mencatat tugas dan deadline-nya.');
  $('#view-tugas').querySelectorAll('[data-cek]').forEach((b) => (b.onclick = async () => {
    const t = data.tugas.find((x) => x.id == b.dataset.cek);
    await simpan('tugas', { ...t, selesai: !t.selesai });
    segarkan();
  }));
  $('#view-tugas').querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => formTugas(data.tugas.find((t) => t.id == b.dataset.edit))));
}
function daftarMatkul() {
  const set = new Set([...data.jadwal.map((j) => j.matkul), ...data.tugas.map((t) => t.matkul), ...data.berkas.map((b) => b.matkul)].filter(Boolean));
  return [...set].sort((a, b) => a.localeCompare(b));
}
function formTugas(item) {
  const besok = new Date(Date.now() + 864e5);
  const iso = new Date(besok.getTime() - besok.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  bukaForm({
    judul: item ? 'Ubah tugas' : 'Tambah tugas',
    nilai: item || { deadline: iso },
    kolom: [
      { n: 'judul', l: 'Judul tugas', t: 'text', wajib: true, ph: 'mis. Laporan praktikum 3' },
      { n: 'matkul', l: 'Mata kuliah', t: 'text', ph: 'mis. Basis Data', daftar: daftarMatkul() },
      { n: 'deadline', l: 'Deadline', t: 'date', wajib: true },
      { n: 'catatan', l: 'Catatan', t: 'textarea' }
    ],
    onSimpan: async (v) => { await simpan('tugas', { selesai: false, ...item, ...v }); toast('Tugas disimpan'); segarkan(); },
    onHapus: item && (async () => { await hapus('tugas', item.id); toast('Tugas dihapus'); segarkan(); })
  });
}

/* ---------- Berkas & Foto ---------- */
function renderBerkas() {
  const matkul = ['Semua', ...new Set(data.berkas.map((b) => b.matkul).filter(Boolean))];
  if (!matkul.includes(state.filterMatkul)) state.filterMatkul = 'Semua';
  const q = state.cari.trim().toLowerCase();
  const daftar = data.berkas
    .filter((b) => state.filterMatkul === 'Semua' || b.matkul === state.filterMatkul)
    .filter((b) => !q || (b.nama + ' ' + (b.matkul || '') + ' ' + b.kategori).toLowerCase().includes(q))
    .sort((a, b) => b.tanggal - a.tanggal);

  $('#view-berkas').innerHTML = `
    <div class="toolbar"><input id="cari" type="search" placeholder="Cari berkas…" value="${esc(state.cari)}"></div>
    <div class="chips">${matkul.map((m) => `<button class="chip ${m === state.filterMatkul ? 'on' : ''}" data-m="${esc(m)}">${esc(m)}</button>`).join('')}</div>
    ${daftar.length ? '<div class="grid" id="grid"></div>' : kosong('Belum ada berkas', 'Ketuk + untuk mengunggah materi, atau ambil foto papan tulis.')}
  `;
  $('#cari').oninput = (e) => {
    state.cari = e.target.value;
    const pos = e.target.selectionStart;
    renderBerkas();
    const el = $('#cari'); el.focus(); el.setSelectionRange(pos, pos);
  };
  $('#view-berkas').querySelectorAll('.chip').forEach((c) => (c.onclick = () => { state.filterMatkul = c.dataset.m; renderBerkas(); }));
  const grid = $('#grid');
  if (!grid) return;
  daftar.forEach((b) => {
    const el = document.createElement('button');
    el.className = 'file';
    let thumb;
    if (b.tipe.startsWith('image/')) {
      const u = URL.createObjectURL(b.blob); urlAktif.push(u);
      thumb = `<img src="${u}" alt="" loading="lazy">`;
    } else {
      thumb = esc((b.nama.split('.').pop() || 'FILE').slice(0, 4).toUpperCase());
    }
    el.innerHTML = `<div class="thumb">${thumb}</div><div class="meta"><div class="title">${esc(b.nama)}</div>
      <div class="sub">${esc(b.matkul || b.kategori)} · ${ukuran(b.ukuran)}</div></div>`;
    el.onclick = () => lihatBerkas(b);
    grid.appendChild(el);
  });
}

function lihatBerkas(b) {
  const u = URL.createObjectURL(b.blob);
  const gambar = b.tipe.startsWith('image/');
  const d = $('#dlg');
  d.innerHTML = `<div class="sheet">
    <h2>${esc(b.nama)}</h2>
    <p class="sub">${esc(b.kategori)}${b.matkul ? ' · ' + esc(b.matkul) : ''} · ${ukuran(b.ukuran)} · ${new Date(b.tanggal).toLocaleDateString('id-ID')}</p>
    ${gambar ? `<img class="preview" src="${u}" alt="">` : ''}
    <div class="actions" style="flex-wrap:wrap">
      ${gambar ? '' : '<button class="btn" id="b-buka">Buka</button>'}
      <a class="btn ghost" id="b-unduh" href="${u}" download="${esc(b.nama)}" style="text-align:center;text-decoration:none">Unduh</a>
      <button class="btn ghost" id="b-ubah">Ubah info</button>
    </div>
    <div class="actions"><button class="btn danger" id="b-hapus">Hapus</button><button class="btn ghost" id="b-tutup">Tutup</button></div>
  </div>`;
  d.onclose = () => { URL.revokeObjectURL(u); d.onclose = null; };
  const buka = $('#b-buka'); if (buka) buka.onclick = () => window.open(u, '_blank');
  $('#b-tutup').onclick = () => d.close();
  $('#b-ubah').onclick = () => { d.close(); formBerkas(b); };
  $('#b-hapus').onclick = async () => {
    if (!confirm('Hapus berkas ini dari HP?')) return;
    await hapus('berkas', b.id); d.close(); toast('Berkas dihapus'); segarkan();
  };
  d.showModal();
}
function formBerkas(item) {
  bukaForm({
    judul: 'Info berkas',
    nilai: item,
    kolom: [
      { n: 'nama', l: 'Nama berkas', t: 'text', wajib: true },
      { n: 'matkul', l: 'Mata kuliah', t: 'text', daftar: daftarMatkul() },
      { n: 'kategori', l: 'Kategori', t: 'select', opsi: KATEGORI.map((k) => [k, k]) }
    ],
    onSimpan: async (v) => { await simpan('berkas', { ...item, ...v }); toast('Tersimpan'); segarkan(); }
  });
}
async function tambahBerkas(fileList, kategoriDefault) {
  const files = [...fileList];
  if (!files.length) return;
  const matkul = state.filterMatkul !== 'Semua' ? state.filterMatkul : '';
  for (const f of files) {
    const foto = f.type.startsWith('image/');
    const nama = f.name && f.name !== 'image.jpg' ? f.name : `Foto ${new Date().toLocaleString('id-ID').replace(/[/:,]/g, '-')}.jpg`;
    await simpan('berkas', {
      nama, matkul, tipe: f.type || 'application/octet-stream', ukuran: f.size, tanggal: Date.now(),
      kategori: kategoriDefault || (foto ? 'Foto' : 'Materi'), blob: f
    });
  }
  toast(`${files.length} berkas disimpan`);
  segarkan();
}

/* ---------- Form generik (bottom sheet) ---------- */
function bukaForm({ judul, nilai = {}, kolom, onSimpan, onHapus }) {
  const d = $('#dlg');
  const kolomHtml = kolom.map((k) => {
    const v = nilai[k.n] ?? '';
    const id = 'f_' + k.n;
    if (k.t === 'select') {
      return `<label for="${id}">${k.l}</label><select id="${id}" name="${k.n}">${k.opsi.map(([val, teks]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(teks)}</option>`).join('')}</select>`;
    }
    if (k.t === 'textarea') return `<label for="${id}">${k.l}</label><textarea id="${id}" name="${k.n}">${esc(v)}</textarea>`;
    const list = k.daftar?.length ? ` list="dl_${k.n}"` : '';
    const dl = k.daftar?.length ? `<datalist id="dl_${k.n}">${k.daftar.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>` : '';
    return `<label for="${id}">${k.l}</label><input id="${id}" name="${k.n}" type="${k.t}" value="${esc(v)}" placeholder="${esc(k.ph || '')}" ${k.wajib ? 'required' : ''}${list}>${dl}`;
  }).join('');
  d.innerHTML = `<form class="sheet" method="dialog" id="frm"><h2>${judul}</h2>${kolomHtml}
    <div class="actions">
      ${onHapus ? '<button type="button" class="btn danger" id="f-hapus">Hapus</button>' : ''}
      <button type="button" class="btn ghost" id="f-batal">Batal</button>
      <button class="btn" type="submit">Simpan</button>
    </div></form>`;
  $('#f-batal').onclick = () => d.close();
  if (onHapus) $('#f-hapus').onclick = async () => { if (confirm('Yakin hapus?')) { d.close(); await onHapus(); } };
  $('#frm').onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target).entries());
    Object.keys(v).forEach((k) => { if (typeof v[k] === 'string') v[k] = v[k].trim(); });
    d.close();
    await onSimpan(v);
  };
  d.showModal();
  const pertama = d.querySelector('input'); if (pertama && !nilai.id) setTimeout(() => pertama.focus(), 120);
}

/* ---------- Tombol tambah & menu ---------- */
function aksiTambah() {
  if (state.tab === 'jadwal') return formJadwal();
  if (state.tab === 'tugas') return formTugas();
  if (state.tab === 'berkas') {
    const d = $('#dlg');
    d.innerHTML = `<div class="sheet"><h2>Tambah berkas</h2>
      <button class="menu-item" id="m-file">📄 Pilih file<small>PDF, dokumen, gambar, dan lainnya</small></button>
      <button class="menu-item" id="m-foto">📷 Ambil foto<small>Foto papan tulis, catatan, dll.</small></button>
      <div class="actions"><button class="btn ghost" id="m-tutup">Batal</button></div></div>`;
    $('#m-file').onclick = () => { d.close(); $('#in-file').click(); };
    $('#m-foto').onclick = () => { d.close(); $('#in-foto').click(); };
    $('#m-tutup').onclick = () => d.close();
    d.showModal();
  }
}

function bukaMenu() {
  const d = $('#dlg');
  d.innerHTML = `<div class="sheet"><h2>Menu</h2>
    <button class="menu-item" id="m-backup">⬇️ Backup data<small>Simpan semua data & berkas ke satu file .json</small></button>
    <button class="menu-item" id="m-restore">⬆️ Pulihkan data<small>Ganti data sekarang dengan file backup</small></button>
    <button class="menu-item" id="m-persist">🔒 Lindungi data<small>Minta browser tidak menghapus data otomatis</small></button>
    <div class="actions"><button class="btn ghost" id="m-tutup">Tutup</button></div></div>`;
  $('#m-tutup').onclick = () => d.close();
  $('#m-backup').onclick = () => { d.close(); backup(); };
  $('#m-restore').onclick = () => { d.close(); $('#in-import').click(); };
  $('#m-persist').onclick = async () => {
    d.close();
    try {
      const ok = navigator.storage?.persist ? await navigator.storage.persist() : false;
      toast(ok ? 'Data dilindungi ✔' : 'Browser belum mengizinkan. Pasang aplikasi ke layar utama lalu coba lagi.');
    } catch (_) { toast('Tidak didukung di browser ini'); }
  };
  d.showModal();
}

/* ---------- Backup & pulihkan ---------- */
const keDataURL = (blob) => new Promise((ok, gagal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => gagal(r.error); r.readAsDataURL(blob); });
async function backup() {
  try {
    toast('Menyiapkan backup…');
    const berkas = [];
    for (const b of data.berkas) berkas.push({ ...b, blob: await keDataURL(b.blob) });
    const isi = JSON.stringify({ app: 'kampusku', versi: 1, tanggal: Date.now(), jadwal: data.jadwal, tugas: data.tugas, berkas });
    const url = URL.createObjectURL(new Blob([isi], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `kampusku-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Backup diunduh');
  } catch (e) { toast('Backup gagal: ' + e.message); }
}
async function pulihkan(file) {
  try {
    const isi = JSON.parse(await file.text());
    if (isi.app !== 'kampusku') throw new Error('Bukan file backup KampusKu');
    if (!confirm('Data sekarang akan diganti dengan isi backup. Lanjutkan?')) return;
    await Promise.all(['jadwal', 'tugas', 'berkas'].map(kosongkan));
    for (const j of isi.jadwal || []) await simpan('jadwal', j);
    for (const t of isi.tugas || []) await simpan('tugas', t);
    for (const b of isi.berkas || []) {
      const blob = await (await fetch(b.blob)).blob();
      await simpan('berkas', { ...b, blob });
    }
    toast('Data berhasil dipulihkan');
    segarkan();
  } catch (e) { toast('Gagal memulihkan: ' + e.message); }
}

/* ---------- Mulai ---------- */
function init() {
  document.querySelectorAll('.tabbar button').forEach((b) => (b.onclick = () => pindahTab(b.dataset.tab)));
  $('#fab').onclick = aksiTambah;
  $('#btn-menu').onclick = bukaMenu;
  $('#in-file').onchange = (e) => { tambahBerkas(e.target.files); e.target.value = ''; };
  $('#in-foto').onchange = (e) => { tambahBerkas(e.target.files, 'Foto'); e.target.value = ''; };
  $('#in-import').onchange = (e) => { if (e.target.files[0]) pulihkan(e.target.files[0]); e.target.value = ''; };
  $('#dlg').addEventListener('click', (e) => { if (e.target.id === 'dlg') e.target.close(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* hanya jalan di https atau localhost */ });
  }
  segarkan().then(() => pindahTab('beranda'));
}
init();
