/**
 * Central Cart Module - Item types supported by the unified troli.
 * Semua pembayaran (yuran, koperasi, marketplace, sedekah, tabung, tiket bas)
 * disatukan dalam satu troli berpusat.
 */
export const CART_ITEM_TYPES = {
  YURAN: 'yuran',
  YURAN_PARTIAL: 'yuran_partial',
  KOPERASI: 'koperasi',
  BUS: 'bus',
  INFAQ: 'infaq',
  TABUNG: 'tabung',
  MARKETPLACE: 'marketplace'
};

export const CART_ITEM_TYPE_LABELS = {
  [CART_ITEM_TYPES.YURAN]: 'Yuran',
  [CART_ITEM_TYPES.YURAN_PARTIAL]: 'Bayaran Sebahagian Yuran',
  [CART_ITEM_TYPES.KOPERASI]: 'Koperasi',
  [CART_ITEM_TYPES.BUS]: 'Tiket Bas',
  [CART_ITEM_TYPES.INFAQ]: 'Sumbangan',
  [CART_ITEM_TYPES.TABUNG]: 'Tabung',
  [CART_ITEM_TYPES.MARKETPLACE]: 'Marketplace'
};
