const DEFAULT_ERROR_MESSAGE = 'Ralat berlaku. Sila cuba lagi.';

function extractDetail(detail) {
  if (!detail) return '';
  if (typeof detail === 'string') return detail.trim();
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (typeof first === 'string') return first.trim();
    if (first && typeof first === 'object') {
      const msg = first.msg || first.message || first.detail;
      if (typeof msg === 'string') return msg.trim();
    }
  }
  if (typeof detail === 'object') {
    const msg = detail.message || detail.msg;
    if (typeof msg === 'string') return msg.trim();
  }
  return '';
}

export function getUserFriendlyError(error, fallbackMessage = DEFAULT_ERROR_MESSAGE) {
  if (!error) return fallbackMessage;

  const status = error?.response?.status;
  const detail = extractDetail(error?.response?.data?.detail);
  const message = extractDetail(error?.response?.data?.message);
  const backendMessage = detail || message;

  if (!error.response) {
    return 'Tidak dapat berhubung ke pelayan. Sila semak internet anda atau cuba lagi sebentar.';
  }

  if (status === 401) {
    return 'Sesi anda telah tamat. Sila log masuk semula untuk teruskan.';
  }
  if (status === 403) {
    return 'Anda tidak mempunyai akses untuk tindakan ini.';
  }
  if (status === 404) {
    return backendMessage || 'Data tidak dijumpai. Sila muat semula halaman.';
  }
  if (status === 409) {
    return backendMessage || 'Rekod bertindih ditemui. Sila semak semula input anda.';
  }
  if (status === 422) {
    return backendMessage || 'Maklumat yang dihantar tidak lengkap atau tidak sah.';
  }
  if (status >= 500) {
    return 'Ralat pelayan berlaku. Sila cuba lagi dalam beberapa minit.';
  }

  if (backendMessage) return backendMessage;
  return fallbackMessage;
}

export default getUserFriendlyError;
