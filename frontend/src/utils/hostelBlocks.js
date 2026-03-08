/**
 * Shared helpers for hostel block (blok asrama) forms.
 * Used by WardenAsramaPage and Superadmin Settings (tab Asrama).
 */

/**
 * Build payload for POST/PUT hostel-blocks API from form state.
 * Jika form.room_config_per_level wujud, guna untuk kira beds_per_level dan hantar room_config_per_level.
 * @param {{ code: string, name: string, gender: string, levels: string[]|string, beds_per_level?: number[], beds_per_room?: number, room_config_per_level?: Array<Array<{rooms:number,beds_per_room:number}>> }} form
 */
export function buildHostelBlockPayload(form) {
  const levels = Array.isArray(form.levels)
    ? form.levels
    : (form.levels || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  const payload = {
    code: (form.code || '').trim().toUpperCase(),
    name: (form.name || '').trim(),
    gender: form.gender || 'lelaki',
    levels,
    is_active: true,
  };
  const roomConfig = form.room_config_per_level;
  if (Array.isArray(roomConfig) && roomConfig.length === levels.length) {
    const normalized = roomConfig.map((levelSegments) =>
      (Array.isArray(levelSegments) ? levelSegments : []).map((seg) => ({
        rooms: Math.max(0, parseInt(seg?.rooms ?? 0, 10) || 0),
        beds_per_room: Math.max(1, Math.min(20, parseInt(seg?.beds_per_room ?? 2, 10) || 2)),
      }))
    );
    payload.room_config_per_level = normalized;
    const beds_per_level = segmentsToBedsPerLevel(normalized);
    if (beds_per_level.some((n) => n > 0)) payload.beds_per_level = beds_per_level;
  } else {
    const rawBeds = form.beds_per_level || [];
    const beds_per_level = levels.map((_, i) => {
      const n = rawBeds[i];
      const val = typeof n === 'number' ? n : parseInt(String(n || 0), 10);
      return isNaN(val) || val < 0 ? 0 : val;
    });
    if (beds_per_level.some((n) => n > 0)) payload.beds_per_level = beds_per_level;
  }
  const bedsPerRoom = form.beds_per_room != null ? parseInt(String(form.beds_per_room), 10) : null;
  if (bedsPerRoom != null && !isNaN(bedsPerRoom) && bedsPerRoom > 0) payload.beds_per_room = bedsPerRoom;
  return payload;
}

/** Format beds_per_level for display e.g. "40+40+40" or "120 katil" */
export function formatBedsPerLevel(bedsPerLevel) {
  if (!Array.isArray(bedsPerLevel) || bedsPerLevel.length === 0) return '–';
  const total = bedsPerLevel.reduce((a, b) => a + (Number(b) || 0), 0);
  if (total === 0) return '–';
  const parts = bedsPerLevel.map((n) => Number(n) || 0).filter(Boolean);
  if (parts.length === 0) return '–';
  return parts.length > 1 ? `${parts.join('+')} (${total} katil)` : `${total} katil`;
}

/** Kira jumlah katil dari bilangan bilik dan katil per bilik. Guna 2 jika bedsPerRoom kosong. */
export function computeBedsFromRooms(rooms, bedsPerRoom) {
  const r = parseInt(String(rooms || 0), 10);
  const b = bedsPerRoom != null && bedsPerRoom !== '' ? parseInt(String(bedsPerRoom), 10) : 2;
  if (isNaN(r) || r < 0) return 0;
  const perRoom = isNaN(b) || b < 1 ? 2 : Math.min(20, b);
  return r * perRoom;
}

/** Anggaran bilangan bilik dari jumlah katil dan katil per bilik (untuk paparan). Return '' jika tiada bedsPerRoom. */
export function roomsFromBeds(beds, bedsPerRoom) {
  const b = Number(beds) || 0;
  if (b <= 0) return '';
  const perRoom = bedsPerRoom != null && bedsPerRoom !== '' ? parseInt(String(bedsPerRoom), 10) : null;
  if (perRoom == null || isNaN(perRoom) || perRoom < 1) return '';
  return Math.round(b / perRoom);
}

/** Jumlah bilik (anggaran) dari beds_per_level dan beds_per_room. Untuk paparan ringkasan. */
export function totalRoomsFromLevels(bedsPerLevel, bedsPerRoom) {
  if (!Array.isArray(bedsPerLevel)) return 0;
  return bedsPerLevel.reduce((sum, beds) => sum + (roomsFromBeds(beds, bedsPerRoom) || 0), 0);
}

function totalBedsForSegments(segments) {
  if (!Array.isArray(segments)) return 0;
  return segments.reduce((sum, seg) => {
    const r = parseInt(seg?.rooms ?? 0, 10);
    const b = Math.max(1, Math.min(20, parseInt(seg?.beds_per_room ?? 0, 10) || 2));
    return sum + (isNaN(r) ? 0 : r) * b;
  }, 0);
}

/**
 * room_config_per_level: array per tingkat; setiap tingkat = array segmen { rooms, beds_per_room }.
 * Kira jumlah katil per tingkat dari segmen.
 */
export function segmentsToBedsPerLevel(roomConfigPerLevel) {
  if (!Array.isArray(roomConfigPerLevel)) return [];
  return roomConfigPerLevel.map((levelSegments) => totalBedsForSegments(levelSegments));
}

/** Jumlah katil untuk satu tingkat (senarai segmen). Untuk paparan. */
export function totalBedsForLevelSegments(segments) {
  return totalBedsForSegments(segments);
}

/** Ringkasan segmen untuk paparan satu baris, cth. "10×3 + 5×5" */
export function formatSegmentSummary(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return '–';
  const parts = segments
    .filter((s) => (Number(s?.rooms) || 0) > 0)
    .map((s) => `${s.rooms}×${s.beds_per_room ?? 2}`);
  return parts.length ? parts.join(' + ') : '0';
}

/**
 * Tukar data lama (beds_per_level + beds_per_room) ke room_config_per_level: satu segmen per tingkat.
 */
export function defaultRoomConfigFromLegacy(levels, bedsPerLevel, bedsPerRoom) {
  const levelsArr = Array.isArray(levels) ? levels : [];
  const beds = Array.isArray(bedsPerLevel) ? bedsPerLevel : [];
  const perRoom = bedsPerRoom != null && bedsPerRoom !== '' ? parseInt(String(bedsPerRoom), 10) : 2;
  const validPerRoom = isNaN(perRoom) || perRoom < 1 ? 2 : Math.min(20, perRoom);
  return levelsArr.map((_, i) => {
    const b = Number(beds[i]) || 0;
    const r = validPerRoom > 0 ? Math.round(b / validPerRoom) : 0;
    return [{ rooms: r, beds_per_room: validPerRoom }];
  });
}

/**
 * Pastikan room_config_per_level ada satu segmen kosong per tingkat jika tiada.
 */
export function ensureRoomConfigLevels(roomConfigPerLevel, levelCount) {
  const current = Array.isArray(roomConfigPerLevel) ? roomConfigPerLevel : [];
  const result = [];
  for (let i = 0; i < levelCount; i++) {
    if (Array.isArray(current[i]) && current[i].length > 0) {
      result.push(current[i].map((seg) => ({ rooms: Number(seg?.rooms) || 0, beds_per_room: Math.max(1, Math.min(20, Number(seg?.beds_per_room) || 2)) })));
    } else {
      result.push([{ rooms: 0, beds_per_room: 2 }]);
    }
  }
  return result;
}
