import { API_URL } from '../services/api';

const createEmptyBox = () => ({
  image_url: '',
  title: '',
  rows: [],
  upload_rows: [],
});

export const DEFAULT_AGM_REPORT_TEMPLATE = {
  header: {
    left_logo_url: '',
    right_logo_url: '',
    right_title: 'Laporan AGM',
    rows: [
      'LAPORAN PENYATA KEWANGAN',
      'BERAKHIR',
    ],
  },
  footer: {
    rows: [
      'Dokumen ini dijana oleh sistem.',
      'Ini adalah cetakan komputer.',
    ],
    left_boxes: [createEmptyBox(), createEmptyBox()],
    right_boxes: [createEmptyBox(), createEmptyBox()],
  },
};

const normalizeLine = (value, maxLen = 240) => {
  const text = String(value || '').trim();
  return text ? text.slice(0, maxLen) : '';
};

const normalizeRows = (rows, maxRows = 12, maxLenPerRow = 240) => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => normalizeLine(row, maxLenPerRow))
    .filter(Boolean)
    .slice(0, maxRows);
};

const normalizeUploadRows = (rows, maxRows = 8) => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const source = row && typeof row === 'object' ? row : {};
      return {
        image_url: normalizeLine(source.image_url, 500),
        caption: normalizeLine(source.caption, 180),
      };
    })
    .filter((row) => row.image_url || row.caption)
    .slice(0, maxRows);
};

const normalizeBox = (rawBox, defaultBox) => {
  const source = rawBox && typeof rawBox === 'object' ? rawBox : {};
  return {
    image_url: normalizeLine(source.image_url ?? defaultBox.image_url, 500),
    title: normalizeLine(source.title ?? defaultBox.title, 120),
    rows: normalizeRows(source.rows, 8, 180),
    upload_rows: normalizeUploadRows(source.upload_rows, 8),
  };
};

const normalizeBoxList = (rawBoxes, defaultBoxes, expectedCount = 2) => {
  const source = Array.isArray(rawBoxes) ? rawBoxes : [];
  const normalized = [];
  for (let idx = 0; idx < expectedCount; idx += 1) {
    normalized.push(normalizeBox(source[idx], defaultBoxes[idx] || createEmptyBox()));
  }
  return normalized;
};

export const normalizeAgmReportTemplate = (rawTemplate) => {
  const source = rawTemplate && typeof rawTemplate === 'object' ? rawTemplate : {};
  const headerSource = source.header && typeof source.header === 'object' ? source.header : {};
  const footerSource = source.footer && typeof source.footer === 'object' ? source.footer : {};

  const headerRows = normalizeRows(headerSource.rows, 12, 240);
  const footerRows = normalizeRows(footerSource.rows, 12, 240);

  return {
    header: {
      left_logo_url: normalizeLine(headerSource.left_logo_url ?? DEFAULT_AGM_REPORT_TEMPLATE.header.left_logo_url, 500),
      right_logo_url: normalizeLine(headerSource.right_logo_url ?? DEFAULT_AGM_REPORT_TEMPLATE.header.right_logo_url, 500),
      right_title: normalizeLine(headerSource.right_title ?? DEFAULT_AGM_REPORT_TEMPLATE.header.right_title, 120) || DEFAULT_AGM_REPORT_TEMPLATE.header.right_title,
      rows: headerRows.length ? headerRows : [...DEFAULT_AGM_REPORT_TEMPLATE.header.rows],
    },
    footer: {
      rows: footerRows.length ? footerRows : [...DEFAULT_AGM_REPORT_TEMPLATE.footer.rows],
      left_boxes: normalizeBoxList(footerSource.left_boxes, DEFAULT_AGM_REPORT_TEMPLATE.footer.left_boxes, 2),
      right_boxes: normalizeBoxList(footerSource.right_boxes, DEFAULT_AGM_REPORT_TEMPLATE.footer.right_boxes, 2),
    },
  };
};

export const resolveAgmReportTemplateAssetUrl = (assetUrl) => {
  const value = String(assetUrl || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const base = String(API_URL || '').replace(/\/$/, '');
  if (!base) return value;
  return value.startsWith('/') ? `${base}${value}` : `${base}/${value}`;
};
