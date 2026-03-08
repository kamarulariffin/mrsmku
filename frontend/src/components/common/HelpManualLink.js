/**
 * Pautan ke Manual Pengguna Bendahari – bahagian tertentu (section) mengikut halaman/modal.
 * Gunakan pada setiap halaman atau panel slider untuk kontekstual manual.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';

/**
 * @param {string} sectionId - ID bahagian dalam manual (cth. 'tetapan-yuran', 'pusat-bayaran-panel-slider')
 * @param {string} [label='Manual'] - Teks pautan
 * @param {string} [className] - Kelas tambahan
 */
export function HelpManualLink({ sectionId, label = 'Manual', className = '' }) {
  if (!sectionId) return null;
  const to = `/admin/manual-bendahari#${sectionId}`;
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 hover:underline ${className}`}
      title="Buka manual pengguna untuk bahagian ini"
    >
      <HelpCircle className="w-4 h-4 flex-shrink-0" />
      <span>{label}</span>
    </Link>
  );
}

export default HelpManualLink;
