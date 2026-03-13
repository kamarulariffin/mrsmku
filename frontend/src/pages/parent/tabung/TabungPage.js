import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * Deprecated legacy Tabung page.
 * Canonical flow now lives in /tabung (TabungPageNew + centralized cart).
 */
export default function TabungPage() {
  return <Navigate to="/tabung" replace />;
}
