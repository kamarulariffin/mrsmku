/**
 * Shared form validation helpers.
 * Used across ChildrenPage, RegisterPage, and other forms for consistency.
 */

export function validateName(name, fieldName = 'Nama') {
  if (!name || !name.trim()) return `${fieldName} tidak boleh kosong`;
  if (/\d/.test(name)) return `${fieldName} tidak boleh mengandungi nombor`;
  if (name.trim().length < 3) return `${fieldName} terlalu pendek (minimum 3 aksara)`;
  if (/[!@#$%^&*()_+=[\]{};:"\\|<>?/~`]/.test(name)) return `${fieldName} mengandungi aksara tidak sah`;
  return null;
}

export function validateEmail(email, required = true) {
  if (!email || !email.trim()) return required ? 'Emel wajib diisi' : null;
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email.trim()) ? null : 'Format emel tidak sah';
}

export function validatePhone(phone, required = true) {
  if (!phone || !phone.trim()) return required ? 'Nombor telefon wajib diisi' : null;
  const cleaned = phone.replace(/[-\s]/g, '');
  if (cleaned.startsWith('01') && cleaned.length >= 10 && cleaned.length <= 12 && /^\d+$/.test(cleaned)) return null;
  if (cleaned.startsWith('601') && cleaned.length >= 11 && /^\d+$/.test(cleaned)) return null;
  if (cleaned.startsWith('+60') && cleaned.length >= 12) return null;
  return required
    ? 'Format nombor telefon tidak sah (cth: 0123456789)'
    : 'Format No. Telefon tidak sah (contoh: 01X-XXXXXXX)';
}

export function validateIC(ic) {
  if (!ic || !ic.trim()) return 'No. Kad Pengenalan tidak boleh kosong';
  const cleaned = ic.replace(/[-\s]/g, '');
  if (cleaned.length !== 12) return 'No. Kad Pengenalan mestilah 12 digit';
  if (!/^\d+$/.test(cleaned)) return 'No. Kad Pengenalan hanya boleh mengandungi nombor';
  const month = parseInt(cleaned.substring(2, 4), 10);
  const day = parseInt(cleaned.substring(4, 6), 10);
  if (month < 1 || month > 12) return 'No. Kad Pengenalan tidak sah - bulan tidak betul';
  if (day < 1 || day > 31) return 'No. Kad Pengenalan tidak sah - hari tidak betul';
  return null;
}

export function validateMatric(matric) {
  if (!matric || !matric.trim()) return 'No. Matrik tidak boleh kosong';
  if (matric.trim().length < 5) return 'No. Matrik terlalu pendek';
  if (matric.trim().length > 20) return 'No. Matrik terlalu panjang';
  return null;
}

/** Validate class name format (standalone). For list-based validation use allowedClasses in form. */
export function validateClassName(className, allowedClasses = null) {
  if (!className || !className.trim()) return 'Nama kelas tidak boleh kosong';
  if (Array.isArray(allowedClasses) && allowedClasses.length > 0) {
    return allowedClasses.includes(className) ? null : `Kelas mesti salah satu dari: ${allowedClasses.join(', ')}`;
  }
  const upper = className.trim().toUpperCase();
  const validSingle = ['A', 'B', 'C', 'D', 'E', 'F'];
  const validNames = ['BESTARI', 'CEMERLANG', 'DINAMIK', 'ELIT', 'GEMILANG', 'HEBAT'];
  if (validSingle.includes(upper) || validNames.includes(upper)) return null;
  if (/^[A-F]\d?$/.test(upper)) return null;
  return 'Format kelas tidak sah. Gunakan A-F atau nama kelas standard';
}
