# Product Requirements Document (PRD)
## Downplaygram (dahulu: Instagram Story Downloader)

**Versi:** 3.0.0 (Migration Release)
**Tanggal:** September 2026
**Status:** Draft — Migrasi Arsitektur
**Pemilik:** Michael Arhdyn
**Kontak:** maiekerurahadian@gmail.com
**Target Platform:** Cross-Browser (Chrome, Edge, Brave, Firefox, Safari)
**Arsitektur:** WebExtensions Manifest V3 (`webextension-polyfill` / WXT)

---

## Daftar Isi

1. [Ringkasan Eksekutif & Konteks Migrasi](#1-ringkasan-eksekutif--konteks-migrasi)
2. [Visi & Misi](#2-visi--misi)
3. [Tujuan Produk & KPI](#3-tujuan-produk--kpi)
4. [Persona & Use Cases](#4-persona--use-cases)
5. [Analisis Pasar](#5-analisis-pasar)
6. [Arsitektur & Tech Stack](#6-arsitektur--tech-stack)
7. [Functional Requirements](#7-functional-requirements)
8. [Warisan Fitur dari CLI (Legacy Feature Mapping)](#8-warisan-fitur-dari-cli-legacy-feature-mapping)
9. [Directory Structure & File Naming Convention](#9-directory-structure--file-naming-convention)
10. [Edge Cases & Exception Handling](#10-edge-cases--exception-handling)
11. [Non-Functional Requirements](#11-non-functional-requirements)
12. [Keamanan & Compliance](#12-keamanan--compliance)
13. [Roadmap Migrasi](#13-roadmap-migrasi)
14. [Metrik Keberhasilan](#14-metrik-keberhasilan)
15. [Risiko & Mitigasi](#15-risiko--mitigasi)
16. [Dokumentasi Teknis](#16-dokumentasi-teknis)
17. [Lampiran](#17-lampiran)

---

## 1. Ringkasan Eksekutif & Konteks Migrasi

**Downplaygram** adalah evolusi dari **Instagram Story Downloader** (CLI Python berbasis `instagrapi`), dimigrasikan sepenuhnya menjadi **ekstensi peramban lintas platform** yang terintegrasi langsung ke antarmuka web resmi Instagram.

### Mengapa Migrasi Dilakukan

Versi CLI (2.0) telah mencapai kematangan teknis yang baik — sesi terenkripsi, dukungan 2FA, 195+ unit test — namun memiliki keterbatasan struktural yang tidak bisa diselesaikan hanya dengan menambal fitur:

| Keterbatasan CLI (v2.0) | Solusi di Downplaygram (v3.0) |
|---|---|
| Bergantung pada API privat/mobile (`instagrapi`) yang rawan *checkpoint challenge* dan pemblokiran akun | Memanfaatkan sesi browser aktif pengguna secara langsung (*client-side native*), tanpa API mobile terpisah |
| Tidak ada kemampuan "Ghost Viewing" — melihat story tetap tercatat sebagai *seen* | `declarativeNetRequest` memblokir *seen beacon* sebelum terkirim ke server Meta |
| Butuh instalasi Python + dependency, tidak ramah pengguna non-teknis | Instalasi 1-klik dari Chrome Web Store / Firefox Add-ons / Edge Add-ons |
| Alur kerja terputus dari pengalaman menjelajah Instagram (copy-paste URL ke terminal) | Tombol unduh tertanam langsung di DOM Instagram (Feed, Reels, Stories, Profile) |
| Risiko akun di-*ban* karena pola akses menyerupai bot | Meniru perilaku pengguna asli karena berjalan di sesi browser yang sama, bukan API terpisah |

### Prinsip Migrasi
- **Tidak ada fitur yang hilang tanpa penggantian**: setiap kapabilitas inti CLI (download story, highlight, post/reel, sanitasi nama file, rate limiting) dipetakan ulang ke arsitektur ekstensi (lihat [Bagian 8](#8-warisan-fitur-dari-cli-legacy-feature-mapping)).
- **Privasi tetap menjadi nilai inti**: zero telemetry, tanpa kredensial dikirim ke server pihak ketiga — prinsip ini dipertahankan dan diperkuat dengan fitur baru Ghost Viewing.
- **CLI Python (`ig_story_dl`) memasuki mode maintenance**: tidak menerima fitur baru, hanya *security patch* kritis, sambil pengguna diarahkan ke ekstensi begitu mencapai *feature parity*.

---

## 2. Visi & Misi

### Visi
Menjadi ekstensi peramban paling tepercaya untuk mengakses dan mengarsipkan konten Instagram secara privat, tanpa jejak, dan tanpa risiko pemblokiran akun.

### Misi
Menyediakan alat yang:
- Menghormati privasi dan hak cipta pemilik konten
- Tidak pernah mengirim kredensial, cookie, atau riwayat unduhan ke server pihak ketiga
- Menyatu secara alami ke dalam alur kerja pengguna di dalam browser, bukan alat terpisah
- Berjalan di semua browser berbasis Chromium serta Firefox dan Safari

---

## 3. Tujuan Produk & KPI

| # | Tujuan | KPI |
|---|--------|-----|
| 1 | Menghilangkan jejak "seen" saat melihat Story | Beacon `seen` berhasil diblokir pada > 99% percobaan |
| 2 | Menyediakan unduhan media tanpa kompresi ulang | Resolusi file unduhan identik dengan sumber CDN asli |
| 3 | Mengurangi friksi dibanding alur CLI lama | Waktu dari "buka Instagram" ke "file terunduh" < 10 detik |
| 4 | Instalasi tanpa hambatan teknis | Onboarding tanpa dependency eksternal, < 2 menit dari install ke pemakaian pertama |
| 5 | Menjaga keamanan akun pengguna | Nol laporan pemblokiran/*ban* akun akibat penggunaan ekstensi |
| 6 | Kompatibilitas lintas browser | Lulus uji fungsional penuh di Chrome, Edge, Brave, Firefox |

---

## 4. Persona & Use Cases

### Persona 1: Casual Lurker & Privacy-Conscious User
- **Kebutuhan:** Melihat Story dan Highlight akun publik maupun akun privat yang saling mengikuti, tanpa masuk daftar *viewers*.
- **Pain Points:** Rasa canggung/terekspos saat menonton story orang lain berulang kali.
- **Use Case:** Aktifkan Ghost Mode di Floating Hub → masukkan username target → preview di Lightbox tanpa memicu telemetri.

### Persona 2: Content Curator & Archivers
- **Kebutuhan:** Menyimpan koleksi foto, video, reels, dan carousel resolusi tinggi ke direktori lokal terstruktur.
- **Pain Points:** Kompresi kualitas dari alat pihak ketiga, folder unduhan berantakan.
- **Use Case:** Klik tombol unduh kontekstual pada Feed/Reels/Carousel → file tersimpan otomatis ke `Downloads/Downplaygram/{username}/...` dengan penamaan konsisten.

### Persona 3: Content Creator / Social Media Manager *(diwarisi dari CLI)*
- **Kebutuhan:** Mengambil referensi konten story kompetitor untuk analisis, tanpa kompetitor mengetahui.
- **Pain Points:** Screenshot manual menurunkan kualitas dan memakan waktu.
- **Use Case:** Gunakan Split Action Button pada Highlight kompetitor → "Download All" untuk mengarsipkan seluruh koleksi sekaligus.

### Persona 4: Jurnalis / Researcher *(diwarisi dari CLI)*
- **Kebutuhan:** Mengarsipkan konten publik sebelum Story kedaluwarsa dalam 24 jam.
- **Pain Points:** Jendela waktu sempit sebelum konten hilang permanen.
- **Use Case:** Ghost Hub memantau story target → unduh langsung dari Stories Player begitu konten terdeteksi tayang.

---

## 5. Analisis Pasar

### Kompetitor

| Nama | Platform | Kelebihan | Kekurangan |
|------|----------|-----------|------------|
| 4K Stogram | Desktop GUI | Banyak fitur, mudah dipakai | Berbayar, kekhawatiran privasi |
| StoriesIG | Web | Gratis, tanpa login | Tidak bisa akses akun privat, banyak iklan |
| Ekstensi sejenis lain | Browser Extension | Terintegrasi ke UI Instagram | Umumnya tidak punya Ghost Viewing asli, banyak yang menyalin telemetri ke server sendiri |
| Instagram Story Downloader (produk lama, CLI) | Python CLI | Sederhana, sesi tersimpan, 2FA support | Tidak ramah non-teknis, rawan *checkpoint* API mobile |
| **Downplaygram (produk ini)** | Browser Extension (MV3) | Ghost Viewing native, zero telemetry, menyatu dengan UI Instagram, cross-browser | Produk baru, belum ada rekam jejak adopsi |

### Diferensiasi
- **Native, bukan scraping:** memanfaatkan sesi browser aktif, bukan API mobile pihak ketiga — jauh lebih tahan terhadap pembatasan Instagram.
- **Ghost Viewing sungguhan:** memutus *seen beacon* di level jaringan (`declarativeNetRequest`), bukan sekadar klaim pemasaran.
- **Lokal & privat:** seluruh operasi berjalan di mesin pengguna, konsisten dengan prinsip CLI sebelumnya, tanpa data melewati server pihak ketiga.

---

## 6. Arsitektur & Tech Stack

```
Downplaygram Extension (Manifest V3)
│
├── Background Service Worker (Extension Lifecycle)
│   ├── declarativeNetRequest (Dynamic Ghost Engine)
│   └── chrome.downloads API (Path Sanitization & Downloader)
│
├── Content Scripts (Injected into instagram.com/*)
│   ├── Observer Engine (MutationObserver untuk hidrasi dinamis)
│   ├── Contextual Buttons Injector (Feed, Reels, Stories, Profile)
│   ├── Floating Ghost Hub UI (Custom Web Component / Shadow DOM)
│   └── DOM Media Sniffer (Progressive stream MP4 & HD image parser)
│
└── Storage Layer (chrome.storage.local)
    ├── Ghost Mode Global State (Boolean)
    └── User Preferences & Download Settings
```

- **Build Framework:** WXT atau Plasmo (TypeScript-based WebExtension Framework).
- **Polyfill:** `webextension-polyfill` untuk standardisasi API Chrome, Firefox, dan Safari.
- **Isolasi UI:** Shadow DOM pada komponen yang diinjeksi untuk mencegah benturan CSS dengan Instagram Web.

### Perbandingan Tech Stack: Lama vs Baru

| Aspek | CLI v2.0 (lama) | Downplaygram v3.0 (baru) |
|---|---|---|
| Bahasa | Python 3.9+ | TypeScript |
| Engine akses data | `instagrapi` (API privat mobile) | Sesi browser aktif via content script |
| Autentikasi | Login username/password + 2FA, sesi Fernet terenkripsi | Mewarisi sesi login Instagram Web pengguna (tidak ada login terpisah) |
| Antarmuka | Terminal (argparse + interaktif) | Floating Ghost Hub (Shadow DOM) + tombol kontekstual in-page |
| Distribusi | PyPI / clone repo | Chrome Web Store, Firefox Add-ons, Edge Add-ons |
| Anti-deteksi | Rate limiting + retry backoff | Ghost Engine (blokir beacon) + perilaku identik pengguna asli |

---

## 7. Functional Requirements

### FR-01: Ghost Viewing Engine (Seen Beacon Blocker)
Memutus komunikasi jaringan yang melaporkan pembacaan Story ke server Meta.
- **Mekanisme:** `chrome.declarativeNetRequest`.
- **Target endpoint:** `*://*.instagram.com/api/v1/stories/reel/seen/*`
- **Toggle Aktif:** menambahkan aturan ke *dynamic rulesets* dan memuat ulang halaman untuk membersihkan *event listener* internal Instagram.
- **Toggle Nonaktif:** menghapus aturan, perilaku penayangan kembali normal.
- **Prioritas rule:** tertinggi, mencegah beacon terkirim via `fetch` maupun `navigator.sendBeacon`.

### FR-02: Floating Ghost Hub (Docked UI)
Pusat navigasi yang diinjeksi ke DOM Instagram Web, tidak bergantung pada popup toolbar.
- **Penempatan:** kanan bawah layar, sejajar di sebelah kiri *Floating Messages* Instagram.
- **Visual styling:** palet `#000000`, border `#262626`, font *system-ui*, glassmorphism backdrop.
- **Komponen:** Toggle Ghost Mode (hijau/ungu aktif, abu-abu pasif), Target Input Bar (auto-bersihkan `@`, spasi, tanda petik), In-Memory Lightbox (background fetch dengan header otorisasi browser aktif, tanpa memicu telemetri), Action Triggers (Close / Preview Story / Save Directly).

### FR-03: In-Page Contextual Download Buttons

| Tipe Media | Titik Injeksi DOM | Perilaku Unduh | Format File |
|---|---|---|---|
| Feed Post | Sejajar tombol Like/Comment/Share | Ambil URL CDN resolusi tertinggi | `.jpg` / `.mp4` |
| Carousel Post | Di samping pagination carousel | Split button (slide aktif vs semua slide) | Multi `.jpg`/`.mp4` |
| Reels | Bar aksi kanan video, di bawah tombol audio | URL progressive MP4 resolusi penuh | `.mp4` |
| Stories Player | Pojok kanan atas, sebelah ikon mute/menu | Stream video/gambar aktif saat ini | `.mp4` / `.jpg` |
| Profile Picture | Mengambang di atas avatar saat hover | URL avatar HD asli dari metadata profil | `.jpg` |

### FR-04: Split Action Button (Highlight & Carousel)
- **Single click:** unduh 1 item media aktif.
- **Dropdown arrow:** "Download This Item" (slide/story terbuka) atau "Download All" (batch fetcher sekuensial, jeda 500ms per file untuk mencegah rate limiting).

### FR-05: Direct CDN Sniffing & Sanitization
- **Video:** pilih progressive MP4 stream utuh, abaikan fragmen DASH (`dashinit`, `_video_dashinit`, `_audio_dashinit`).
- **Foto:** ekstrak kandidat gambar dari `srcset` atau `image_versions2` dengan resolusi dimensi terlebar.

---

## 8. Warisan Fitur dari CLI (Legacy Feature Mapping)

Tabel ini memastikan tidak ada kapabilitas inti dari `ig_story_dl` v2.0 yang hilang selama migrasi.

| Fitur di CLI v2.0 | Status Migrasi | Padanan di Downplaygram |
|---|---|---|
| Login + sesi terenkripsi (Fernet + keyring) | Tidak diperlukan lagi | Mewarisi sesi login Instagram Web bawaan browser |
| Dukungan 2FA (TOTP) | Tidak diperlukan lagi | Ditangani sepenuhnya oleh alur login native Instagram Web |
| Download story dari URL | Dipetakan ulang | FR-03 (Stories Player) — klik langsung, tanpa input URL |
| Highlight download (semua/filter judul) | Dipetakan ulang | FR-04 (Split Action Button — "Download All") |
| Post/Reel download | Dipetakan ulang | FR-03 (Feed Post, Reels) |
| Sanitasi judul (strip quote, karakter ilegal) | Dipertahankan | Bagian 9 & 10 — sanitasi nama file/folder otomatis |
| Rate limiting antar download | Dipertahankan | FR-04 — jeda 500ms per file pada batch fetcher |
| Download media tanpa fragmen DASH | Dipertahankan | FR-05 |
| Progress bar (tqdm) | Dipetakan ulang | Indikator progres pada Lightbox / Ghost Hub |
| Logging ke file | Dievaluasi ulang | Dipertimbangkan sebagai fitur opsional developer-mode (belum prioritas) |
| Batch download dari file URL | Tidak relevan | Digantikan model "Download All" berbasis kontainer DOM (carousel/highlight), bukan file daftar URL |
| Export metadata ke JSON/CSV | Belum dipetakan | Kandidat fitur Phase 3+ jika ada permintaan pengguna |
| Multi-account profile switcher | Tidak relevan | Ekstensi mengikuti akun mana pun yang sedang login di browser; ganti akun = ganti sesi browser |

---

## 9. Directory Structure & File Naming Convention

```text
Downloads/
└── Downplaygram/
    └── {target_username}/
        ├── stories/
        │   └── story_{timestamp}_{media_id}.{ext}
        ├── highlights/
        │   └── {sanitized_highlight_title}/
        │       └── hl_{timestamp}_{media_id}.{ext}
        ├── posts/
        │   └── post_{shortcode}_{index}.{ext}
        ├── reels/
        │   └── reel_{shortcode}.mp4
        └── profile/
            └── avatar_{target_username}_hd.jpg
```

Seluruh unduhan dipetakan melalui API `chrome.downloads`, terisolasi rapi di bawah folder `Downloads` browser pengguna — melanjutkan prinsip "lokal & terstruktur" dari versi CLI.

---

## 10. Edge Cases & Exception Handling

- **Akun Privat:** hanya dapat diakses/diunduh jika akun yang login di browser telah disetujui sebagai pengikut (*mutual/following*). Jika ditolak: `"Konten tidak dapat diakses. Anda belum mengikuti akun privat ini."`
- **Story Kedaluwarsa:** jika story kedaluwarsa saat proses penarikan, tampilkan feedback di Lightbox: `"Media sudah tidak tersedia atau telah dihapus oleh pengguna."`
- **Karakter Ilegal pada Judul Highlight:** karakter khusus OS (`/ \ : * ? " < > |`) atau emoji dibersihkan otomatis sebelum membuat direktori — melanjutkan pola sanitasi (`sanitize_title_filter`) dari CLI v2.0.

---

## 11. Non-Functional Requirements

- **Performance:** `MutationObserver` dioptimalkan dengan target observasi lokal (hindari observasi penuh `document.body`) untuk mencegah penurunan FPS/lonjakan RAM.
- **Privacy & Zero Telemetry:** tidak ada pengiriman kredensial, cookie, sesi, atau riwayat unduhan ke server pihak ketiga — konsisten dengan prinsip GDPR/Privacy yang sudah dianut CLI v2.0.
- **Security Compatibility:** patuh penuh pada Content Security Policy (CSP) dan arsitektur Manifest V3.
- **Storage Isolation:** struktur unduhan terisolasi rapi di bawah folder `Downloads`.

---

## 12. Keamanan & Compliance

### 12.1 Risiko Keamanan

| Risiko | Severity | Mitigasi |
|--------|----------|----------|
| Beacon `seen` gagal terblokir karena perubahan endpoint Instagram | Tinggi | Monitor perubahan API Instagram, update dynamic ruleset secara berkala |
| Injeksi UI bentrok dengan pembaruan DOM Instagram | Sedang | Shadow DOM + observasi lokal, uji regresi rutin |
| Penyalahgunaan untuk pelanggaran privasi pihak lain | Tinggi | Disclaimer eksplisit, tidak mempromosikan penggunaan tanpa izin pemilik konten |
| Kebocoran data melalui background fetch Lightbox | Kritis | Header otorisasi hanya diproses in-memory, tidak pernah dikirim keluar browser |

### 12.2 Compliance
- **Instagram ToS:** hanya untuk penggunaan personal, bukan redistribusi massal konten — prinsip yang sama dipertahankan dari CLI v2.0.
- **Copyright:** pengguna bertanggung jawab atas konten yang diunduh.
- **GDPR/Privacy:** tidak ada telemetry, semua operasi berjalan lokal di browser pengguna.

### 12.3 Disclaimer
> "Gunakan secara bertanggung jawab dan jangan mengunduh atau melihat konten tanpa mempertimbangkan privasi pemiliknya."

---

## 13. Roadmap Migrasi

### Phase 0: Sunset CLI (Paralel, Minggu 1–6)
- CLI `ig_story_dl` v2.0 masuk mode maintenance-only: hanya menerima *security patch* kritis.
- Dokumentasi README CLI diperbarui dengan notifikasi migrasi dan tautan ke ekstensi begitu tersedia di store.

### Phase 1: Core Foundation & Network Engine (Minggu 1–2)
- Setup monorepo WXT dengan TypeScript dan target cross-browser.
- Implementasi `declarativeNetRequest` untuk blokir endpoint `seen` secara dinamis.
- Skrip `MutationObserver` dasar untuk tombol unduh pada Stories dan Feed Posts.

### Phase 2: Floating Ghost Hub & Lightbox (Minggu 3–4)
- Komponen Shadow DOM untuk dock mengambang di samping tombol Messages.
- Integrasi input username target dan background fetch untuk tray reels/story target.
- Antarmuka Lightbox modal untuk melihat story tanpa render halaman utama.

### Phase 3: Advanced Media Handlers & Split Actions (Minggu 5)
- Split Action Button pada Carousel Post dan Highlight.
- Unduhan foto profil HD via metadata akun.
- Penamaan folder otomatis dan sanitasi karakter file (mewarisi logika `sanitize_title_filter` dari CLI).

### Phase 4: Cross-Browser Verification & Polishing (Minggu 6)
- Uji kompatibilitas Chrome MV3, Firefox MV3, Edge.
- Validasi performa rendering, uji regresi terhadap pembaruan DOM Instagram.
- Packaging untuk Chrome Web Store, Firefox Add-ons, Edge Add-ons.
- Publikasi pengumuman migrasi resmi dan penghentian dukungan aktif CLI.

---

## 14. Metrik Keberhasilan

### KPI Teknis
- **Beacon block rate:** > 99% permintaan `seen` berhasil dicegat.
- **Download success rate:** > 98% untuk media yang dapat diakses.
- **Crash/UI break rate akibat update DOM Instagram:** < 2% per rilis Instagram.

### KPI Adoption
- **Instalasi store (gabungan Chrome/Firefox/Edge):** target 500+ dalam 3 bulan pertama pasca-rilis.
- **Retensi pengguna migrasi dari CLI:** target 50%+ pengguna CLI aktif beralih ke ekstensi dalam 2 bulan.
- **Issue resolution time:** < 7 hari untuk bug, < 30 hari untuk fitur baru.

### KPI Keamanan
- **Zero kebocoran kredensial/sesi.**
- **Zero laporan pemblokiran akun Instagram** akibat penggunaan ekstensi.

---

## 15. Risiko & Mitigasi

| Risiko | Probabilitas | Dampak | Mitigasi |
|--------|--------------|--------|----------|
| Instagram mengubah struktur DOM/endpoint secara drastis | Tinggi | Tinggi | Observability internal, uji regresi rutin, arsitektur modular per selector |
| Store review (Chrome/Firefox) menolak ekstensi karena kebijakan scraping | Sedang | Tinggi | Dokumentasi kebijakan privasi jelas, tidak ada API key/kredensial pihak ketiga, disclaimer penggunaan personal |
| Pengguna CLI lama enggan bermigrasi | Sedang | Sedang | Panduan migrasi, feature parity di Bagian 8, dukungan transisi |
| Akun pengguna tetap ter-*flag* meski Ghost Mode aktif | Rendah | Tinggi | Uji menyeluruh terhadap seluruh endpoint telemetri terkait, bukan hanya `seen` |
| Kehilangan maintainer | Rendah | Tinggi | Dokumentasi kode dan arsitektur yang jelas untuk kontributor baru |

---

## 16. Dokumentasi Teknis

### 16.1 Struktur Repositori (Diusulkan)
```
downplaygram/
├── src/
│   ├── background/
│   │   └── ghost-engine.ts       # declarativeNetRequest rules
│   ├── content/
│   │   ├── observer.ts           # MutationObserver engine
│   │   ├── injectors/            # Contextual button injectors
│   │   └── ghost-hub/            # Floating Ghost Hub (Shadow DOM component)
│   ├── lib/
│   │   ├── media-sniffer.ts      # CDN sniffing & sanitization (FR-05)
│   │   └── downloader.ts         # chrome.downloads wrapper
│   └── storage/
│       └── settings.ts           # chrome.storage.local layer
├── public/
│   └── manifest.json
├── tests/
├── wxt.config.ts
├── package.json
└── README.md
```

### 16.2 Warisan Dokumentasi CLI
Repositori CLI (`Instagram-Story-Downloader`, Python) tetap dipertahankan sebagai arsip dengan README yang diperbarui berisi notifikasi migrasi dan tautan ke ekstensi. Riwayat 11 bug yang telah diperbaiki (BUG-001 s.d. BUG-011) dan 195+ unit test tetap menjadi referensi teknis internal, terutama untuk logika sanitasi nama file dan penanganan rate limiting yang dipetakan ulang ke Downplaygram.

---

## 17. Lampiran

### A. Glosarium
- **Ghost Viewing:** melihat Story/Highlight tanpa tercatat di daftar *viewers* pemilik akun.
- **Seen Beacon:** permintaan jaringan yang dikirim Instagram untuk menandai story sudah dilihat.
- **declarativeNetRequest:** API Manifest V3 untuk memblokir/memodifikasi permintaan jaringan tanpa membaca isinya.
- **Shadow DOM:** teknik isolasi DOM/CSS agar komponen ekstensi tidak bentrok dengan gaya halaman host.
- **DASH:** format streaming adaptif; fragmen inisialisasinya (`dashinit`) diabaikan demi progressive MP4 utuh.
- **Highlight:** Story yang di-archive permanen oleh pemilik akun.

### B. Referensi
- [Chrome Extensions: declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)
- [WXT Framework](https://wxt.dev/)
- [webextension-polyfill](https://github.com/mozilla/webextension-polyfill)
- [Instagram Terms of Service](https://help.instagram.com/581066165581870)

### C. Changelog

| Versi | Tanggal | Perubahan |
|-------|---------|-----------|
| 1.0 (Initial) | 26 Aug 2024 | Initial commit CLI dengan script dasar + README |
| 1.0-draft | 7 Sep 2026 | Penambahan PRD documentation (CLI) |
| 2.0 | 7 Sep 2026 | Modular refactor CLI: `src/ig_story_dl`, sesi terenkripsi (Fernet + keyring), Highlight & Post download, 11 bug fixed, i18n (EN/ID), 195 unit test (90% coverage) |
| 3.0 (Migration) | Sep 2026 | Migrasi arsitektur penuh dari CLI Python ke ekstensi browser Manifest V3 "Downplaygram": Ghost Viewing Engine, Floating Ghost Hub, in-page contextual download buttons, split action button, direct CDN sniffing; CLI memasuki mode maintenance-only |

---

**Dokumen ini akan diperbarui seiring perkembangan migrasi.**
**Pemilik dokumen:** Michael Arhdyn (maiekerurahadian@gmail.com)
**Lisensi:** Open source (lihat LICENSE untuk detail)
