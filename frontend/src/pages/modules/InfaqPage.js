import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * Deprecated legacy Infaq page.
 * Unified donation flow now routes through /tabung with centralized cart.
 */
const InfaqPage = () => <Navigate to="/tabung" replace />;

export default InfaqPage;
