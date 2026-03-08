"""
Test cases for Tabung & Sumbangan Featured Campaign Features
- PUT /api/tabung/campaigns/{id}/featured - Toggle featured status
- is_featured field in campaign responses
- days_remaining calculation
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestFeaturedCampaignAPI:
    """Test featured campaign toggle API and related fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as superadmin
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "admin123"
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        self.token = login_res.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Store created campaign IDs for cleanup
        self.created_campaigns = []
        yield
        
        # Cleanup: Delete created test campaigns
        for campaign_id in self.created_campaigns:
            try:
                self.session.delete(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}")
            except:
                pass
    
    def test_toggle_featured_status_on(self):
        """Test setting campaign as featured (Pilihan Utama)"""
        # Create a test campaign
        create_res = self.session.post(f"{BASE_URL}/api/tabung/campaigns", json={
            "title": "TEST_Featured_Toggle_On",
            "description": "Test campaign for featured toggle",
            "campaign_type": "amount",
            "target_amount": 1000.0
        })
        assert create_res.status_code == 200, f"Create failed: {create_res.text}"
        campaign_id = create_res.json()["id"]
        self.created_campaigns.append(campaign_id)
        
        # Toggle featured status ON
        toggle_res = self.session.put(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}/featured")
        assert toggle_res.status_code == 200, f"Toggle failed: {toggle_res.text}"
        
        # Verify response
        toggle_data = toggle_res.json()
        assert toggle_data.get("is_featured") == True
        assert "Pilihan Utama" in toggle_data.get("message", "")
        
        # Verify campaign is now featured
        get_res = self.session.get(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}")
        assert get_res.status_code == 200
        campaign = get_res.json()
        assert campaign.get("is_featured") == True
    
    def test_toggle_featured_status_off(self):
        """Test removing campaign from featured (Pilihan Utama)"""
        # Create a test campaign
        create_res = self.session.post(f"{BASE_URL}/api/tabung/campaigns", json={
            "title": "TEST_Featured_Toggle_Off",
            "description": "Test campaign for featured toggle off",
            "campaign_type": "amount",
            "target_amount": 1000.0
        })
        assert create_res.status_code == 200
        campaign_id = create_res.json()["id"]
        self.created_campaigns.append(campaign_id)
        
        # First toggle ON
        self.session.put(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}/featured")
        
        # Then toggle OFF
        toggle_res = self.session.put(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}/featured")
        assert toggle_res.status_code == 200
        
        toggle_data = toggle_res.json()
        assert toggle_data.get("is_featured") == False
        assert "dibuang" in toggle_data.get("message", "").lower()
        
        # Verify campaign is no longer featured
        get_res = self.session.get(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}")
        assert get_res.status_code == 200
        campaign = get_res.json()
        assert campaign.get("is_featured") == False
    
    def test_featured_campaign_in_list(self):
        """Test that is_featured field appears in campaign list"""
        # Get campaigns list
        list_res = self.session.get(f"{BASE_URL}/api/tabung/campaigns")
        assert list_res.status_code == 200
        
        campaigns = list_res.json()
        assert isinstance(campaigns, list)
        
        # Check that is_featured field exists in response
        if campaigns:
            campaign = campaigns[0]
            assert "is_featured" in campaign, "is_featured field missing from campaign list response"
    
    def test_days_remaining_calculation_active(self):
        """Test days_remaining calculation for active campaign ending in 10 days"""
        # Create campaign ending in 10 days
        end_date = (datetime.now() + timedelta(days=10)).strftime("%Y-%m-%d")
        
        create_res = self.session.post(f"{BASE_URL}/api/tabung/campaigns", json={
            "title": "TEST_Days_Remaining_10",
            "description": "Test campaign for days remaining calculation",
            "campaign_type": "amount",
            "target_amount": 1000.0,
            "end_date": end_date
        })
        assert create_res.status_code == 200
        campaign_id = create_res.json()["id"]
        self.created_campaigns.append(campaign_id)
        
        # Verify days_remaining
        get_res = self.session.get(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}")
        assert get_res.status_code == 200
        campaign = get_res.json()
        
        # Should be around 9-10 days (depending on time)
        assert "days_remaining" in campaign
        assert campaign["days_remaining"] is not None
        assert 8 <= campaign["days_remaining"] <= 11, f"Expected 8-11 days remaining, got {campaign['days_remaining']}"
    
    def test_days_remaining_within_two_weeks(self):
        """Test days_remaining for campaign ending within 2 weeks (yellow ring)"""
        # Create campaign ending in 5 days (within 14 days)
        end_date = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")
        
        create_res = self.session.post(f"{BASE_URL}/api/tabung/campaigns", json={
            "title": "TEST_Days_Remaining_5",
            "description": "Test campaign for 2 week warning",
            "campaign_type": "amount",
            "target_amount": 1000.0,
            "end_date": end_date
        })
        assert create_res.status_code == 200
        campaign_id = create_res.json()["id"]
        self.created_campaigns.append(campaign_id)
        
        # Verify days_remaining
        get_res = self.session.get(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}")
        assert get_res.status_code == 200
        campaign = get_res.json()
        
        # Should be around 4-5 days and <= 14 (for yellow ring logic)
        assert campaign["days_remaining"] is not None
        assert campaign["days_remaining"] <= 14, "Campaign should be within 2 weeks"
        assert campaign["days_remaining"] > 0, "Campaign should not be ended yet"
        assert campaign["date_status"] == "active"
        assert campaign["can_donate"] == True
    
    def test_days_remaining_ended_campaign(self):
        """Test days_remaining for ended campaign (red ring)"""
        # Create campaign with past end date
        end_date = (datetime.now() - timedelta(days=5)).strftime("%Y-%m-%d")
        
        create_res = self.session.post(f"{BASE_URL}/api/tabung/campaigns", json={
            "title": "TEST_Days_Remaining_Ended",
            "description": "Test campaign for ended status",
            "campaign_type": "amount",
            "target_amount": 1000.0,
            "end_date": end_date
        })
        assert create_res.status_code == 200
        campaign_id = create_res.json()["id"]
        self.created_campaigns.append(campaign_id)
        
        # Verify campaign is ended
        get_res = self.session.get(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}")
        assert get_res.status_code == 200
        campaign = get_res.json()
        
        assert campaign["date_status"] == "ended"
        assert campaign["date_remark"] == "Kutipan Sudah Tamat"
        assert campaign["can_donate"] == False
        # days_remaining should be 0 for ended campaigns
        assert campaign["days_remaining"] is not None
        assert campaign["days_remaining"] == 0
    
    def test_toggle_featured_unauthorized(self):
        """Test that non-admin cannot toggle featured status"""
        # Login as parent
        parent_session = requests.Session()
        parent_session.headers.update({"Content-Type": "application/json"})
        login_res = parent_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "parent@muafakat.link",
            "password": "parent123"
        })
        
        if login_res.status_code == 200:
            parent_token = login_res.json()["access_token"]
            parent_session.headers.update({"Authorization": f"Bearer {parent_token}"})
            
            # Get any campaign
            campaigns_res = parent_session.get(f"{BASE_URL}/api/tabung/campaigns")
            if campaigns_res.status_code == 200 and campaigns_res.json():
                campaign_id = campaigns_res.json()[0]["id"]
                
                # Try to toggle featured - should fail
                toggle_res = parent_session.put(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}/featured")
                assert toggle_res.status_code == 403, f"Expected 403 for parent user, got {toggle_res.status_code}"
    
    def test_featured_campaign_update_via_put(self):
        """Test updating is_featured via regular campaign update endpoint"""
        # Create a test campaign
        create_res = self.session.post(f"{BASE_URL}/api/tabung/campaigns", json={
            "title": "TEST_Featured_Update",
            "description": "Test campaign for featured update",
            "campaign_type": "slot",
            "total_slots": 100,
            "price_per_slot": 50.0
        })
        assert create_res.status_code == 200
        campaign_id = create_res.json()["id"]
        self.created_campaigns.append(campaign_id)
        
        # Update via PUT with is_featured
        update_res = self.session.put(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}", json={
            "is_featured": True
        })
        assert update_res.status_code == 200
        
        # Verify
        get_res = self.session.get(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}")
        assert get_res.status_code == 200
        campaign = get_res.json()
        assert campaign.get("is_featured") == True


class TestCampaignRingColors:
    """Test that campaign data supports ring color logic in frontend"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as superadmin
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "admin123"
        })
        assert login_res.status_code == 200
        self.token = login_res.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        self.created_campaigns = []
        yield
        
        for campaign_id in self.created_campaigns:
            try:
                self.session.delete(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}")
            except:
                pass
    
    def test_green_ring_active_campaign(self):
        """Test active campaign without end date (Green ring)"""
        create_res = self.session.post(f"{BASE_URL}/api/tabung/campaigns", json={
            "title": "TEST_Green_Ring_Active",
            "description": "Test active campaign for green ring",
            "campaign_type": "amount",
            "target_amount": 1000.0
        })
        assert create_res.status_code == 200
        campaign_id = create_res.json()["id"]
        self.created_campaigns.append(campaign_id)
        
        get_res = self.session.get(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}")
        assert get_res.status_code == 200
        campaign = get_res.json()
        
        # For green ring: date_status == 'active' and can_donate == true
        assert campaign["date_status"] == "active"
        assert campaign["can_donate"] == True
        # No specific days_remaining (null or > 14)
    
    def test_yellow_ring_ending_soon(self):
        """Test campaign ending within 2 weeks (Yellow ring)"""
        end_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        
        create_res = self.session.post(f"{BASE_URL}/api/tabung/campaigns", json={
            "title": "TEST_Yellow_Ring_Soon",
            "description": "Test campaign for yellow ring",
            "campaign_type": "amount",
            "target_amount": 1000.0,
            "end_date": end_date
        })
        assert create_res.status_code == 200
        campaign_id = create_res.json()["id"]
        self.created_campaigns.append(campaign_id)
        
        get_res = self.session.get(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}")
        assert get_res.status_code == 200
        campaign = get_res.json()
        
        # For yellow ring: days_remaining <= 14 and > 0
        assert campaign["days_remaining"] is not None
        assert 0 < campaign["days_remaining"] <= 14
        assert campaign["date_status"] == "active"
        assert campaign["can_donate"] == True
    
    def test_red_ring_ended(self):
        """Test ended campaign (Red ring)"""
        end_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        
        create_res = self.session.post(f"{BASE_URL}/api/tabung/campaigns", json={
            "title": "TEST_Red_Ring_Ended",
            "description": "Test campaign for red ring",
            "campaign_type": "amount",
            "target_amount": 1000.0,
            "end_date": end_date
        })
        assert create_res.status_code == 200
        campaign_id = create_res.json()["id"]
        self.created_campaigns.append(campaign_id)
        
        get_res = self.session.get(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}")
        assert get_res.status_code == 200
        campaign = get_res.json()
        
        # For red ring: date_status == 'ended'
        assert campaign["date_status"] == "ended"
        assert campaign["date_remark"] == "Kutipan Sudah Tamat"
        assert campaign["can_donate"] == False
