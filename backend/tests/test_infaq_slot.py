"""
Test suite for Infaq Slot Module APIs
Tests: GET campaigns, POST donate, Admin CRUD operations
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
PARENT_EMAIL = "demo@muafakat.link"
PARENT_PASSWORD = "demoparent"
ADMIN_EMAIL = "superadmin@muafakat.link"
ADMIN_PASSWORD = "super123"
BENDAHARI_EMAIL = "bendahari@muafakat.link"
BENDAHARI_PASSWORD = "bendahari123"


class TestInfaqPublicAPIs:
    """Public Infaq endpoint tests (no auth required)"""
    
    def test_get_public_campaigns(self):
        """GET /api/public/infaq/campaigns returns active campaigns"""
        response = requests.get(f"{BASE_URL}/api/public/infaq/campaigns")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # Verify campaign structure
        if len(data) > 0:
            campaign = data[0]
            assert "id" in campaign
            assert "title" in campaign
            assert "total_slots" in campaign
            assert "slots_sold" in campaign
            assert "price_per_slot" in campaign
            assert "slots_available" in campaign
            assert "progress_percent" in campaign
            assert "total_collected" in campaign
            print(f"✓ Found {len(data)} active campaigns")
    
    def test_get_public_campaign_detail(self):
        """GET /api/public/infaq/campaigns/{id} returns campaign details"""
        # First get campaigns list
        list_response = requests.get(f"{BASE_URL}/api/public/infaq/campaigns")
        assert list_response.status_code == 200
        campaigns = list_response.json()
        
        if len(campaigns) > 0:
            campaign_id = campaigns[0]["id"]
            response = requests.get(f"{BASE_URL}/api/public/infaq/campaigns/{campaign_id}")
            assert response.status_code == 200
            
            data = response.json()
            assert data["id"] == campaign_id
            assert "title" in data
            assert "slots_available" in data
            assert "total_collected" in data
            assert "progress_percent" in data
            print(f"✓ Campaign detail: {data['title']}")
        else:
            pytest.skip("No campaigns available for detail test")
    
    def test_get_public_infaq_stats(self):
        """GET /api/public/infaq/stats returns statistics"""
        response = requests.get(f"{BASE_URL}/api/public/infaq/stats")
        assert response.status_code == 200
        
        data = response.json()
        assert "total_collected" in data
        assert "total_slots_sold" in data
        assert "total_campaigns" in data
        assert "unique_donors" in data
        assert "total_donations" in data
        print(f"✓ Stats: {data['total_campaigns']} campaigns, RM{data['total_collected']} collected")
    
    def test_invalid_campaign_id_returns_404(self):
        """GET /api/public/infaq/campaigns/invalid returns 404"""
        response = requests.get(f"{BASE_URL}/api/public/infaq/campaigns/000000000000000000000000")
        assert response.status_code == 404


class TestInfaqAuthenticatedAPIs:
    """Authenticated user Infaq endpoint tests"""
    
    @pytest.fixture
    def parent_token(self):
        """Login as parent and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARENT_EMAIL,
            "password": PARENT_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Parent login failed")
    
    @pytest.fixture
    def admin_token(self):
        """Login as admin and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Admin login failed")
    
    @pytest.fixture
    def bendahari_token(self):
        """Login as bendahari and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": BENDAHARI_EMAIL,
            "password": BENDAHARI_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Bendahari login failed")
    
    def test_get_campaigns_authenticated(self, parent_token):
        """GET /api/infaq/campaigns returns campaigns for logged in users"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        response = requests.get(f"{BASE_URL}/api/infaq/campaigns?status=active", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Authenticated: Found {len(data)} active campaigns")
    
    def test_get_my_donations(self, parent_token):
        """GET /api/infaq/my-donations returns user's donation history"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        response = requests.get(f"{BASE_URL}/api/infaq/my-donations", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ User has {len(data)} donations")
    
    def test_make_donation(self, parent_token):
        """POST /api/infaq/donate creates a donation"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        
        # Get active campaign first
        campaigns_response = requests.get(f"{BASE_URL}/api/infaq/campaigns?status=active", headers=headers)
        assert campaigns_response.status_code == 200
        campaigns = campaigns_response.json()
        
        if len(campaigns) == 0:
            pytest.skip("No active campaigns for donation test")
        
        campaign = campaigns[0]
        if campaign["slots_available"] < 1:
            pytest.skip("No available slots for donation")
        
        # Make donation
        response = requests.post(f"{BASE_URL}/api/infaq/donate", headers=headers, json={
            "campaign_id": campaign["id"],
            "slots": 1,
            "payment_method": "fpx",
            "is_anonymous": False,
            "message": "TEST donation - pytest"
        })
        
        assert response.status_code == 200
        data = response.json()
        
        assert "id" in data
        assert data["slots"] == 1
        assert data["campaign_id"] == campaign["id"]
        assert data["payment_status"] == "completed"
        assert "receipt_number" in data
        assert data["receipt_number"].startswith("INF-")
        
        print(f"✓ Donation created: {data['receipt_number']} - RM{data['amount']}")
    
    def test_donation_with_minimum_slots(self, parent_token):
        """Test donation respects minimum slot requirement"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        
        campaigns_response = requests.get(f"{BASE_URL}/api/infaq/campaigns?status=active", headers=headers)
        campaigns = campaigns_response.json()
        
        if len(campaigns) == 0:
            pytest.skip("No active campaigns")
        
        campaign = campaigns[0]
        min_slots = campaign.get("min_slots", 1)
        
        # Try donating with minimum slots
        response = requests.post(f"{BASE_URL}/api/infaq/donate", headers=headers, json={
            "campaign_id": campaign["id"],
            "slots": min_slots,
            "payment_method": "ewallet"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["slots"] == min_slots
        print(f"✓ Minimum slot donation: {min_slots} slots")
    
    def test_donation_anonymous(self, parent_token):
        """Test anonymous donation"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        
        campaigns_response = requests.get(f"{BASE_URL}/api/infaq/campaigns?status=active", headers=headers)
        campaigns = campaigns_response.json()
        
        if len(campaigns) == 0:
            pytest.skip("No active campaigns")
        
        campaign = campaigns[0]
        if campaign["slots_available"] < 1:
            pytest.skip("No available slots")
        
        response = requests.post(f"{BASE_URL}/api/infaq/donate", headers=headers, json={
            "campaign_id": campaign["id"],
            "slots": 1,
            "payment_method": "card",
            "is_anonymous": True
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["is_anonymous"] == True
        assert data["donor_name"] == "Penderma Tanpa Nama"
        print(f"✓ Anonymous donation: {data['receipt_number']}")


class TestInfaqAdminAPIs:
    """Admin Infaq endpoint tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Login as admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Admin login failed")
    
    @pytest.fixture
    def bendahari_token(self):
        """Login as bendahari"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": BENDAHARI_EMAIL,
            "password": BENDAHARI_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Bendahari login failed")
    
    def test_admin_get_all_campaigns(self, admin_token):
        """GET /api/infaq/campaigns returns all campaigns for admin"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/infaq/campaigns", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Admin: {len(data)} total campaigns")
    
    def test_admin_get_all_donations(self, admin_token):
        """GET /api/infaq/admin/donations returns all donations"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/infaq/admin/donations", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Admin: {len(data)} total donations")
    
    def test_admin_get_stats(self, admin_token):
        """GET /api/infaq/admin/stats returns admin statistics"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/infaq/admin/stats", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "total_campaigns" in data
        assert "active_campaigns" in data
        assert "total_donations" in data
        assert "total_amount" in data
        assert "total_slots_sold" in data
        print(f"✓ Admin stats: {data['active_campaigns']} active, RM{data['total_amount']} collected")
    
    def test_create_campaign(self, admin_token):
        """POST /api/infaq/admin/campaigns creates new campaign"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        unique_title = f"TEST_Campaign_{uuid.uuid4().hex[:8]}"
        
        response = requests.post(f"{BASE_URL}/api/infaq/admin/campaigns", headers=headers, json={
            "title": unique_title,
            "description": "Test campaign created by pytest",
            "total_slots": 100,
            "price_per_slot": 10.0,
            "min_slots": 1,
            "max_slots": 50
        })
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["title"] == unique_title
        assert data["total_slots"] == 100
        assert data["price_per_slot"] == 10.0
        assert data["slots_sold"] == 0
        assert data["status"] == "active"
        assert "id" in data
        
        print(f"✓ Campaign created: {data['title']} (ID: {data['id']})")
        
        # Return campaign id for cleanup
        return data["id"]
    
    def test_update_campaign(self, admin_token):
        """PUT /api/infaq/admin/campaigns/{id} updates campaign"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create a campaign first
        unique_title = f"TEST_Update_{uuid.uuid4().hex[:8]}"
        create_response = requests.post(f"{BASE_URL}/api/infaq/admin/campaigns", headers=headers, json={
            "title": unique_title,
            "description": "Initial description",
            "total_slots": 50,
            "price_per_slot": 20.0
        })
        
        assert create_response.status_code == 200
        campaign_id = create_response.json()["id"]
        
        # Update the campaign
        updated_title = f"{unique_title}_Updated"
        response = requests.put(f"{BASE_URL}/api/infaq/admin/campaigns/{campaign_id}", headers=headers, json={
            "title": updated_title,
            "description": "Updated description",
            "total_slots": 100
        })
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["title"] == updated_title
        assert data["total_slots"] == 100
        print(f"✓ Campaign updated: {data['title']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/infaq/admin/campaigns/{campaign_id}", headers=headers)
    
    def test_delete_campaign(self, admin_token):
        """DELETE /api/infaq/admin/campaigns/{id} cancels campaign"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create a campaign first
        unique_title = f"TEST_Delete_{uuid.uuid4().hex[:8]}"
        create_response = requests.post(f"{BASE_URL}/api/infaq/admin/campaigns", headers=headers, json={
            "title": unique_title,
            "total_slots": 10,
            "price_per_slot": 5.0
        })
        
        assert create_response.status_code == 200
        campaign_id = create_response.json()["id"]
        
        # Delete (cancel) the campaign
        response = requests.delete(f"{BASE_URL}/api/infaq/admin/campaigns/{campaign_id}", headers=headers)
        assert response.status_code == 200
        
        # Verify it's cancelled
        get_response = requests.get(f"{BASE_URL}/api/infaq/campaigns/{campaign_id}", headers=headers)
        assert get_response.status_code == 200
        assert get_response.json()["status"] == "cancelled"
        
        print(f"✓ Campaign cancelled: {unique_title}")
    
    def test_bendahari_can_access_admin_endpoints(self, bendahari_token):
        """Bendahari should have access to infaq admin endpoints"""
        headers = {"Authorization": f"Bearer {bendahari_token}"}
        
        # Test stats access
        response = requests.get(f"{BASE_URL}/api/infaq/admin/stats", headers=headers)
        assert response.status_code == 200
        
        # Test donations access
        donations_response = requests.get(f"{BASE_URL}/api/infaq/admin/donations", headers=headers)
        assert donations_response.status_code == 200
        
        # Test create campaign access
        unique_title = f"TEST_Bendahari_{uuid.uuid4().hex[:8]}"
        create_response = requests.post(f"{BASE_URL}/api/infaq/admin/campaigns", headers=headers, json={
            "title": unique_title,
            "total_slots": 10,
            "price_per_slot": 5.0
        })
        assert create_response.status_code == 200
        
        # Cleanup
        campaign_id = create_response.json()["id"]
        requests.delete(f"{BASE_URL}/api/infaq/admin/campaigns/{campaign_id}", headers=headers)
        
        print("✓ Bendahari has access to admin infaq endpoints")


class TestInfaqValidation:
    """Test validation rules for Infaq donations"""
    
    @pytest.fixture
    def parent_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARENT_EMAIL,
            "password": PARENT_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Login failed")
    
    def test_donation_exceeds_max_slots(self, parent_token):
        """Donation exceeding max_slots should fail"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        
        campaigns_response = requests.get(f"{BASE_URL}/api/infaq/campaigns?status=active", headers=headers)
        campaigns = campaigns_response.json()
        
        if len(campaigns) == 0:
            pytest.skip("No active campaigns")
        
        campaign = campaigns[0]
        max_slots = campaign.get("max_slots", 5000)
        
        # Try donating more than max_slots
        response = requests.post(f"{BASE_URL}/api/infaq/donate", headers=headers, json={
            "campaign_id": campaign["id"],
            "slots": max_slots + 1,
            "payment_method": "fpx"
        })
        
        # Should fail with 400 or validation error
        assert response.status_code in [400, 422]
        print(f"✓ Max slot validation working (max: {max_slots})")
    
    def test_donation_invalid_campaign(self, parent_token):
        """Donation to invalid campaign should fail"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        
        response = requests.post(f"{BASE_URL}/api/infaq/donate", headers=headers, json={
            "campaign_id": "000000000000000000000000",
            "slots": 1,
            "payment_method": "fpx"
        })
        
        assert response.status_code in [400, 404]
        print("✓ Invalid campaign validation working")
    
    def test_donation_zero_slots(self, parent_token):
        """Donation with 0 slots should fail"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        
        campaigns_response = requests.get(f"{BASE_URL}/api/infaq/campaigns?status=active", headers=headers)
        campaigns = campaigns_response.json()
        
        if len(campaigns) == 0:
            pytest.skip("No active campaigns")
        
        campaign = campaigns[0]
        
        response = requests.post(f"{BASE_URL}/api/infaq/donate", headers=headers, json={
            "campaign_id": campaign["id"],
            "slots": 0,
            "payment_method": "fpx"
        })
        
        # Should fail validation
        assert response.status_code in [400, 422]
        print("✓ Zero slots validation working")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
