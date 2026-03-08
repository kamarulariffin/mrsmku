"""
Test Campaign Form Page - Create/Edit Dedicated Page
Tests the new dedicated pages for create/edit campaign instead of modal
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://yuran-admin-panel.preview.emergentagent.com')

class TestCampaignFormPageAPIs:
    """Test backend APIs for the new Campaign Form Page"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test with authentication"""
        # Login as superadmin
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "superadmin@muafakat.link", "password": "admin123"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        self.created_campaign_id = None
        yield
        # Cleanup - delete test campaign if created
        if self.created_campaign_id:
            try:
                requests.delete(
                    f"{BASE_URL}/api/tabung/campaigns/{self.created_campaign_id}",
                    headers=self.headers
                )
            except:
                pass
    
    def test_01_get_campaigns_list(self):
        """Test GET /api/tabung/campaigns returns list"""
        response = requests.get(
            f"{BASE_URL}/api/tabung/campaigns",
            headers=self.headers
        )
        assert response.status_code == 200
        campaigns = response.json()
        assert isinstance(campaigns, list)
        print(f"Found {len(campaigns)} campaigns")
    
    def test_02_create_slot_campaign(self):
        """Test POST /api/tabung/campaigns creates slot-based campaign"""
        payload = {
            "title": "TEST_Create_Slot_Campaign",
            "description": "Test slot campaign from dedicated page",
            "full_description": "<p>Full description with <b>rich text</b></p>",
            "campaign_type": "slot",
            "total_slots": 100,
            "price_per_slot": 25,
            "min_slots": 1,
            "max_slots": 10,
            "is_public": True,
            "allow_anonymous": True
        }
        response = requests.post(
            f"{BASE_URL}/api/tabung/campaigns",
            json=payload,
            headers=self.headers
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        assert "id" in data
        self.created_campaign_id = data["id"]
        print(f"Created slot campaign: {self.created_campaign_id}")
    
    def test_03_create_amount_campaign(self):
        """Test POST /api/tabung/campaigns creates amount-based campaign"""
        payload = {
            "title": "TEST_Create_Amount_Campaign",
            "description": "Test amount campaign from dedicated page",
            "full_description": "<p>Full description for sedekah</p>",
            "campaign_type": "amount",
            "target_amount": 10000,
            "min_amount": 10,
            "max_amount": 1000,
            "is_public": True,
            "allow_anonymous": True
        }
        response = requests.post(
            f"{BASE_URL}/api/tabung/campaigns",
            json=payload,
            headers=self.headers
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        assert "id" in data
        self.created_campaign_id = data["id"]
        print(f"Created amount campaign: {self.created_campaign_id}")
    
    def test_04_get_campaign_detail(self):
        """Test GET /api/tabung/campaigns/:id returns campaign with data"""
        # First create a campaign
        create_response = requests.post(
            f"{BASE_URL}/api/tabung/campaigns",
            json={
                "title": "TEST_Get_Detail_Campaign",
                "description": "Test description",
                "campaign_type": "slot",
                "total_slots": 50,
                "price_per_slot": 20
            },
            headers=self.headers
        )
        assert create_response.status_code == 200
        campaign_id = create_response.json()["id"]
        self.created_campaign_id = campaign_id
        
        # Get detail
        response = requests.get(
            f"{BASE_URL}/api/tabung/campaigns/{campaign_id}",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify all expected fields for edit form
        assert data["id"] == campaign_id
        assert data["title"] == "TEST_Get_Detail_Campaign"
        assert data["description"] == "Test description"
        assert data["campaign_type"] == "slot"
        assert data["total_slots"] == 50
        assert data["price_per_slot"] == 20
        assert "status" in data
        assert "images" in data
        assert "full_description" in data
        print(f"Campaign detail verified: {data['title']}")
    
    def test_05_update_campaign(self):
        """Test PUT /api/tabung/campaigns/:id updates campaign"""
        # First create
        create_response = requests.post(
            f"{BASE_URL}/api/tabung/campaigns",
            json={
                "title": "TEST_Update_Before",
                "description": "Before update",
                "campaign_type": "amount",
                "target_amount": 5000
            },
            headers=self.headers
        )
        assert create_response.status_code == 200
        campaign_id = create_response.json()["id"]
        self.created_campaign_id = campaign_id
        
        # Update
        update_response = requests.put(
            f"{BASE_URL}/api/tabung/campaigns/{campaign_id}",
            json={
                "title": "TEST_Update_After",
                "description": "After update",
                "full_description": "<h1>Updated rich content</h1>",
                "target_amount": 10000
            },
            headers=self.headers
        )
        assert update_response.status_code == 200
        
        # Verify update
        get_response = requests.get(
            f"{BASE_URL}/api/tabung/campaigns/{campaign_id}",
            headers=self.headers
        )
        data = get_response.json()
        assert data["title"] == "TEST_Update_After"
        assert data["description"] == "After update"
        assert data["target_amount"] == 10000
        print(f"Campaign updated successfully")
    
    def test_06_validation_empty_title(self):
        """Test validation - empty title returns error"""
        response = requests.post(
            f"{BASE_URL}/api/tabung/campaigns",
            json={
                "title": "",
                "campaign_type": "slot",
                "total_slots": 100,
                "price_per_slot": 25
            },
            headers=self.headers
        )
        # Should fail validation (422 or 400)
        assert response.status_code in [400, 422], f"Expected validation error, got {response.status_code}"
        print("Empty title validation works")
    
    def test_07_validation_slot_campaign_missing_fields(self):
        """Test validation - slot campaign requires slots and price"""
        response = requests.post(
            f"{BASE_URL}/api/tabung/campaigns",
            json={
                "title": "TEST_Invalid_Slot",
                "campaign_type": "slot"
                # Missing total_slots and price_per_slot
            },
            headers=self.headers
        )
        assert response.status_code in [400, 422]
        print("Slot campaign validation works")
    
    def test_08_validation_amount_campaign_missing_target(self):
        """Test validation - amount campaign requires target_amount"""
        response = requests.post(
            f"{BASE_URL}/api/tabung/campaigns",
            json={
                "title": "TEST_Invalid_Amount",
                "campaign_type": "amount"
                # Missing target_amount
            },
            headers=self.headers
        )
        assert response.status_code in [400, 422]
        print("Amount campaign validation works")
    
    def test_09_get_stats_for_dashboard(self):
        """Test GET /api/tabung/stats returns statistics"""
        response = requests.get(
            f"{BASE_URL}/api/tabung/stats",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "campaigns" in data
        assert "donations" in data
        assert "by_type" in data
        print(f"Stats: {data['campaigns']['active']} active campaigns")
    
    def test_10_share_data_endpoint(self):
        """Test GET /api/tabung/campaigns/:id/share-data returns share links"""
        # Get an existing campaign
        campaigns_response = requests.get(
            f"{BASE_URL}/api/tabung/campaigns",
            headers=self.headers
        )
        campaigns = campaigns_response.json()
        if not campaigns:
            pytest.skip("No campaigns available")
        
        campaign_id = campaigns[0]["id"]
        
        response = requests.get(
            f"{BASE_URL}/api/tabung/campaigns/{campaign_id}/share-data",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "url" in data
        assert "share_links" in data
        assert "whatsapp" in data["share_links"]
        assert "facebook" in data["share_links"]
        assert "telegram" in data["share_links"]
        print(f"Share data: {data['url']}")
    
    def test_11_qrcode_generation(self):
        """Test GET /api/tabung/campaigns/:id/qrcode returns PNG image"""
        # Get an existing campaign
        campaigns_response = requests.get(
            f"{BASE_URL}/api/tabung/campaigns",
            headers=self.headers
        )
        campaigns = campaigns_response.json()
        if not campaigns:
            pytest.skip("No campaigns available")
        
        campaign_id = campaigns[0]["id"]
        
        response = requests.get(
            f"{BASE_URL}/api/tabung/campaigns/{campaign_id}/qrcode",
            headers=self.headers
        )
        assert response.status_code == 200
        assert response.headers.get("content-type") == "image/png"
        print(f"QR code generated, size: {len(response.content)} bytes")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
