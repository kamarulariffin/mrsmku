# Cadangan: Troli Berpusat (Unified Cart)

## Objektif
Menyatukan **semua pembayaran**—yuran, koperasi, marketplace, sedekah/tabung, tiket bas—dalam **satu troli berpusat** supaya pengguna boleh menambah item dari mana-mana modul dan membuat satu pembayaran di Pusat Bayaran.

## Keadaan Semasa

| Sumber        | Cart / Aliran semasa |
|---------------|----------------------|
| Yuran         | ✅ Troli berpusat (CartContext → payment-center cart) |
| Koperasi      | ✅ CartContext `addKoperasiToCart`; backend koperasi ada cart sendiri (koop_cart) |
| Tiket Bas     | ✅ CartContext `addBusTicketToCart` |
| Sedekah/Tabung| ✅ CartContext `addInfaqToCart` (infaq) |
| Marketplace   | ❌ Tiada cart; order terus (POST /orders) |

## Apa Yang Sudah Dilakukan

1. **Modul troli berpusat (frontend)**
   - `frontend/src/modules/centralCart/`:
     - `constants.js`: `CART_ITEM_TYPES`, `CART_ITEM_TYPE_LABELS` (yuran, koperasi, bus, infaq, tabung, marketplace).
     - `index.js`: export `useCentralCart` (alias `useCart`), `CartDrawer`, `CartIconButton`, constants.
   - **CartIconButton**: Klik ikon troli → **buka drawer** (bukan terus ke halaman).
   - **CartDrawer**: Dipaparkan dalam `DashboardLayout`; senarai item mengikut jenis (Yuran, Koperasi, Tiket Bas, Sumbangan, Marketplace); butang **"Teruskan ke Pembayaran"** → `/payment-center`; bila troli kosong, butang **"Pergi ke Pusat Bayaran"**.
   - Semua halaman dalam layout (Yuran, Koperasi, Bas, Tabung, dll.) guna **troli yang sama**; checkout hanya di Pusat Bayaran.

2. **CartContext (sedia ada)**
   - `addYuranToCart`, `addKoperasiToCart`, `addBusTicketToCart`, `addInfaqToCart`.
   - Cart disimpan di backend melalui `GET/POST /api/payment-center/cart` (dan remove/update/clear).

## Cadangan Langkah Seterusnya

### 1. Backend: Satu cart API sahaja
- **Pusat Bayaran** kekal sebagai sumber benar cart: `GET/POST /api/payment-center/cart` (dan update/remove/clear).
- Sokong `item_type`: `yuran`, `yuran_partial`, `koperasi`, `bus`, `infaq`, `tabung`, `marketplace` (jika mahu marketplace masuk troli).
- **Koperasi**: Setuju sama ada:
  - **(A)** Halaman Koperasi hanya guna troli berpusat (tambah ke payment-center cart), dan cart koperasi (koop_cart) tidak lagi digunakan untuk checkout; atau  
  - **(B)** Kekal dua cart tetapi "Checkout" di Koperasi bawa item ke troli berpusat / redirect ke Pusat Bayaran untuk bayar sekali.

### 2. Marketplace dalam troli (pilihan)
- Tambah `item_type: 'marketplace'` di payment-center cart.
- Di halaman Marketplace: butang **"Tambah ke Troli"** (selain atau menggantikan **"Beli Sekarang"**) panggil `addToCart('marketplace', { item_id, name, amount, quantity, metadata })`.
- Checkout marketplace item bersama item lain di Pusat Bayaran; backend semasa checkout proses order marketplace dari item cart.

### 3. Tabung / Sedekah
- Sudah disokong melalui `addInfaqToCart`. Pastikan halaman Tabung/Sedekah (bila pengguna pilih kempen dan jumlah) gunakan **"Tambah ke Troli"** lalu pengguna boleh gabung dengan yuran/koperasi dan bayar sekali di Pusat Bayaran.

### 4. Penyegerakan cart dengan database (pilihan)
- Jika backend payment-center cart masih in-memory, pertimbang simpan cart ke DB (contoh: jadual `user_cart` / `cart_items`) supaya cart kekal merentas sesi dan peranti.

## Ringkasan Manfaat
- Satu ikon troli, satu drawer, satu tempat bayar (Pusat Bayaran).
- Pengguna boleh kumpul yuran + koperasi + sedekah/tabung + (pilihan) marketplace dalam satu troli dan bayar sekali.
- Kurang keliru antara banyak "cart" atau "checkout" di modul berbeza.
