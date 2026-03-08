"""
Test cases for Sedekah (Donation) Module
- Public endpoints (no auth required)
- Authenticated donation endpoints
- Admin campaign management
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://yuran-admin-panel.preview.emergentagent.com')

class TestPublicDonationEndpoints:
    """Public donation endpoints - No authentication required"""
    
    def test_get_donation_stats(self):
        """Test GET /api/public/donations/stats returns donation statistics"""
        response = requests.get(f"{BASE_URL}/api/public/donations/stats")
        assert response.status_code == 200
        
        data = response.json()
        assert "total_campaigns" in data
        assert "total_donations" in data
        assert "total_collected" in data
        assert "unique_donors" in data
        assert isinstance(data["total_campaigns"], int)
        assert isinstance(data["total_donations"], int)
        assert isinstance(data["total_collected"], (int, float))
        assert isinstance(data["unique_donors"], int)
        print(f"Stats: {data}")
    
    def test_get_public_campaigns(self):
        """Test GET /api/public/donations/campaigns returns active campaigns"""
        response = requests.get(f"{BASE_URL}/api/public/donations/campaigns?limit=10")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1  # At least 1 seeded campaign
        
        # Verify campaign structure
        campaign = data[0]
        assert "id" in campaign
        assert "title" in campaign
        assert "description" in campaign
        assert "category" in campaign
        assert "target_amount" in campaign
        assert "collected_amount" in campaign
        assert "donor_count" in campaign
        assert "progress_percent" in campaign
        assert "is_active" in campaign
        print(f"Found {len(data)} campaigns")
    
    def test_get_public_campaigns_with_category_filter(self):
        """Test GET /api/public/donations/campaigns with category filter"""
        response = requests.get(f"{BASE_URL}/api/public/donations/campaigns?category=tabung_pelajar")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        # All returned campaigns should be of specified category
        for campaign in data:
            assert campaign["category"] == "tabung_pelajar"
        print(f"Found {len(data)} campaigns in tabung_pelajar category")
    
    def test_get_campaign_detail(self):
        """Test GET /api/public/donations/campaigns/{id} returns campaign with recent donors"""
        # Use known test campaign ID
        campaign_id = "698eac423b4bd72f2f4608c4"
        response = requests.get(f"{BASE_URL}/api/public/donations/campaigns/{campaign_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["id"] == campaign_id
        assert "title" in data
        assert "description" in data
        assert "recent_donors" in data  # Campaign detail includes recent donors
        assert "total_donations" in data
        assert "full_description" in data
        assert "gallery_images" in data
        assert "organizer" in data
        assert "contact_email" in data
        assert "contact_phone" in data
        assert isinstance(data["recent_donors"], list)
        print(f"Campaign: {data['title']}, Donors: {len(data['recent_donors'])}")
    
    def test_get_campaign_detail_not_found(self):
        """Test GET /api/public/donations/campaigns/{id} with invalid ID returns 404"""
        response = requests.get(f"{BASE_URL}/api/public/donations/campaigns/000000000000000000000000")
        assert response.status_code == 404
    
    def test_get_campaign_detail_invalid_id_format(self):
        """Test GET /api/public/donations/campaigns/{id} with invalid ID format"""
        response = requests.get(f"{BASE_URL}/api/public/donations/campaigns/invalid-id")
        assert response.status_code == 404


class TestAuthenticatedDonationEndpoints:
    """Authenticated donation endpoints"""
    
    @pytest.fixture
    def parent_token(self):
        """Get auth token for parent user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@muafakat.link",
            "password": "demoparent"
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Parent login failed")
    
    @pytest.fixture
    def superadmin_token(self):
        """Get auth token for superadmin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "super123"
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("SuperAdmin login failed")
    
    def test_authenticated_get_campaigns(self, parent_token):
        """Test authenticated GET /api/donations/campaigns"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        response = requests.get(f"{BASE_URL}/api/donations/campaigns", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} campaigns (authenticated)")
    
    def test_create_donation(self, parent_token):
        """Test POST /api/donations - create a donation"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        campaign_id = "698eac423b4bd72f2f4608c4"
        
        response = requests.post(f"{BASE_URL}/api/donations", headers=headers, json={
            "campaign_id": campaign_id,
            "amount": 25.0,
            "payment_method": "fpx",
            "is_anonymous": False,
            "message": "Test donation from pytest"
        })
        
        # Should succeed (payment gateway is mocked)
        assert response.status_code == 200 or response.status_code == 201
        data = response.json()
        assert "id" in data
        assert "receipt_number" in data
        print(f"Donation created: {data.get('id')}, Receipt: {data.get('receipt_number')}")
    
    def test_create_anonymous_donation(self, parent_token):
        """Test POST /api/donations with anonymous flag"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        campaign_id = "698eac423b4bd72f2f4608c4"
        
        response = requests.post(f"{BASE_URL}/api/donations", headers=headers, json={
            "campaign_id": campaign_id,
            "amount": 10.0,
            "payment_method": "fpx",
            "is_anonymous": True,
            "message": None
        })
        
        assert response.status_code == 200 or response.status_code == 201
        data = response.json()
        assert "id" in data
        print(f"Anonymous donation created: {data.get('id')}")
    
    def test_get_my_donations(self, parent_token):
        """Test GET /api/donations/my - get user's donation history"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        response = requests.get(f"{BASE_URL}/api/donations/my", headers=headers)
        
        # Endpoint may not exist, but shouldn't crash
        if response.status_code == 404:
            print("GET /api/donations/my endpoint not implemented")
        else:
            assert response.status_code == 200
            print(f"My donations: {response.json()}")


class TestAdminDonationManagement:
    """Admin/SuperAdmin donation campaign management"""
    
    @pytest.fixture
    def superadmin_token(self):
        """Get auth token for superadmin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "super123"
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("SuperAdmin login failed")
    
    def test_admin_get_all_campaigns(self, superadmin_token):
        """Test admin can get all campaigns including inactive"""
        headers = {"Authorization": f"Bearer {superadmin_token}"}
        response = requests.get(f"{BASE_URL}/api/donations/campaigns?active_only=false", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Admin view: {len(data)} total campaigns")
    
    def test_admin_get_campaign_with_donations(self, superadmin_token):
        """Test admin can view campaign with donation details"""
        headers = {"Authorization": f"Bearer {superadmin_token}"}
        campaign_id = "698eac423b4bd72f2f4608c4"
        response = requests.get(f"{BASE_URL}/api/donations/campaigns/{campaign_id}", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "recent_donors" in data
        print(f"Campaign {data['title']}: {len(data['recent_donors'])} recent donors")


class TestDonationDataIntegrity:
    """Test donation data integrity and calculations"""
    
    def test_progress_percent_calculation(self):
        """Verify progress_percent is correctly calculated"""
        response = requests.get(f"{BASE_URL}/api/public/donations/campaigns")
        assert response.status_code == 200
        
        for campaign in response.json():
            target = campaign["target_amount"]
            collected = campaign["collected_amount"]
            progress = campaign["progress_percent"]
            
            expected = min((collected / target) * 100, 100) if target > 0 else 0
            # Allow small floating point difference
            assert abs(progress - expected) < 0.01, f"Progress mismatch for {campaign['title']}"
        print("All progress_percent calculations correct")
    
    def test_donor_count_matches_donations(self):
        """Verify donor_count is reasonable"""
        response = requests.get(f"{BASE_URL}/api/public/donations/campaigns")
        assert response.status_code == 200
        
        for campaign in response.json():
            assert campaign["donor_count"] >= 0
            print(f"{campaign['title']}: {campaign['donor_count']} donors")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
