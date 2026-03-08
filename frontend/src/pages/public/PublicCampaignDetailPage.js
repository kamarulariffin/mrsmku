import React from 'react';
import { Navigate, useParams } from 'react-router-dom';

export default function PublicCampaignDetailPage() {
  const { campaignId } = useParams();

  if (!campaignId) {
    return <Navigate to="/sedekah" replace />;
  }

  // Legacy public detail route now points to unified donation detail page.
  return <Navigate to={`/donate/${campaignId}`} replace />;
}
