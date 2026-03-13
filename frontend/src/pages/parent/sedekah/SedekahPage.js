import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * Deprecated legacy Sedekah page.
 * Unified donation flow now redirects to /tabung and uses centralized cart.
 */
export const SedekahPage = () => <Navigate to="/tabung" replace />;

export default SedekahPage;
