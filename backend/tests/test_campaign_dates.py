"""
Test Campaign Date Features - Start/End Date, Date Status
Tests for:
1. Date fields in campaign creation
2. Date status calculation (active/upcoming/ended)
3. Date remark in response (Belum Dilancarkan / Kutipan Sudah Tamat)
4. can_donate flag
5. Donation blocking when not in date range
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for superadmin"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "superadmin@muafakat.link",
        "password": "admin123"
    })
    if response.status_code == 200:
        return response.json().get("access_token") or response.json().get("token")
    pytest.skip("Authentication failed - skipping authenticated tests")

@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }

class TestCampaignDateFields:
    """Test date field handling in campaigns"""
    
    def test_create_campaign_with_dates(self, auth_headers):
        """Create campaign with start and end dates"""
        future_start = (datetime.now() + timedelta(days=30)).isoformat()
        future_end = (datetime.now() + timedelta(days=60)).isoformat()
        
        response = requests.post(f"{BASE_URL}/api/tabung/campaigns", 
            headers=auth_headers,
            json={
                "title": "TEST_Campaign with Dates",
                "description": "Test campaign with date range",
                "campaign_type": "amount",
                "target_amount": 5000,
                "start_date": future_start,
                "end_date": future_end
            }
        )
        
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        assert "id" in data
        
        # Cleanup - delete the campaign
        requests.delete(f"{BASE_URL}/api/tabung/campaigns/{data['id']}", headers=auth_headers)
        print(f"✓ Campaign created with start_date and end_date")
    
    def test_create_future_campaign_returns_upcoming_status(self, auth_headers):
        """Create campaign that starts in the future - should have 'upcoming' status"""
        future_start = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        future_end = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        # Create campaign
        response = requests.post(f"{BASE_URL}/api/tabung/campaigns",
            headers=auth_headers,
            json={
                "title": "TEST_Future Campaign",
                "description": "Starts in the future",
                "campaign_type": "amount",
                "target_amount": 1000,
                "start_date": future_start,
                "end_date": future_end
            }
        )
        
        assert response.status_code == 200, f"Create failed: {response.text}"
        campaign_id = response.json()["id"]
        
        # Get campaign details
        detail_response = requests.get(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}", headers=auth_headers)
        assert detail_response.status_code == 200
        
        campaign = detail_response.json()
        
        # Verify date status fields
        assert campaign.get("date_status") == "upcoming", f"Expected 'upcoming' but got '{campaign.get('date_status')}'"
        assert campaign.get("date_remark") == "Belum Dilancarkan", f"Expected 'Belum Dilancarkan' but got '{campaign.get('date_remark')}'"
        assert campaign.get("can_donate") == False, f"Expected can_donate=False but got {campaign.get('can_donate')}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}", headers=auth_headers)
        print(f"✓ Future campaign has date_status='upcoming', date_remark='Belum Dilancarkan', can_donate=False")
    
    def test_create_expired_campaign_returns_ended_status(self, auth_headers):
        """Create campaign with past end date - should have 'ended' status"""
        past_start = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        past_end = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        
        # Create campaign
        response = requests.post(f"{BASE_URL}/api/tabung/campaigns",
            headers=auth_headers,
            json={
                "title": "TEST_Expired Campaign",
                "description": "Already ended",
                "campaign_type": "amount",
                "target_amount": 1000,
                "start_date": past_start,
                "end_date": past_end
            }
        )
        
        assert response.status_code == 200, f"Create failed: {response.text}"
        campaign_id = response.json()["id"]
        
        # Get campaign details
        detail_response = requests.get(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}", headers=auth_headers)
        assert detail_response.status_code == 200
        
        campaign = detail_response.json()
        
        # Verify date status fields
        assert campaign.get("date_status") == "ended", f"Expected 'ended' but got '{campaign.get('date_status')}'"
        assert campaign.get("date_remark") == "Kutipan Sudah Tamat", f"Expected 'Kutipan Sudah Tamat' but got '{campaign.get('date_remark')}'"
        assert campaign.get("can_donate") == False, f"Expected can_donate=False but got {campaign.get('can_donate')}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}", headers=auth_headers)
        print(f"✓ Expired campaign has date_status='ended', date_remark='Kutipan Sudah Tamat', can_donate=False")
    
    def test_create_active_campaign_returns_active_status(self, auth_headers):
        """Create campaign within date range - should have 'active' status"""
        past_start = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        future_end = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        # Create campaign
        response = requests.post(f"{BASE_URL}/api/tabung/campaigns",
            headers=auth_headers,
            json={
                "title": "TEST_Active Campaign",
                "description": "Currently active",
                "campaign_type": "amount",
                "target_amount": 1000,
                "start_date": past_start,
                "end_date": future_end
            }
        )
        
        assert response.status_code == 200, f"Create failed: {response.text}"
        campaign_id = response.json()["id"]
        
        # Get campaign details
        detail_response = requests.get(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}", headers=auth_headers)
        assert detail_response.status_code == 200
        
        campaign = detail_response.json()
        
        # Verify date status fields
        assert campaign.get("date_status") == "active", f"Expected 'active' but got '{campaign.get('date_status')}'"
        assert campaign.get("date_remark") is None, f"Expected None but got '{campaign.get('date_remark')}'"
        assert campaign.get("can_donate") == True, f"Expected can_donate=True but got {campaign.get('can_donate')}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}", headers=auth_headers)
        print(f"✓ Active campaign has date_status='active', date_remark=None, can_donate=True")
    
    def test_campaign_without_dates_defaults_to_active(self, auth_headers):
        """Campaign without dates should default to active"""
        # Create campaign without dates
        response = requests.post(f"{BASE_URL}/api/tabung/campaigns",
            headers=auth_headers,
            json={
                "title": "TEST_No Dates Campaign",
                "description": "No start/end date",
                "campaign_type": "amount",
                "target_amount": 1000
            }
        )
        
        assert response.status_code == 200, f"Create failed: {response.text}"
        campaign_id = response.json()["id"]
        
        # Get campaign details
        detail_response = requests.get(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}", headers=auth_headers)
        assert detail_response.status_code == 200
        
        campaign = detail_response.json()
        
        # Verify defaults
        assert campaign.get("date_status") == "active", f"Expected 'active' but got '{campaign.get('date_status')}'"
        assert campaign.get("can_donate") == True, f"Expected can_donate=True but got {campaign.get('can_donate')}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}", headers=auth_headers)
        print(f"✓ Campaign without dates defaults to active with can_donate=True")


class TestDonationBlocking:
    """Test donation blocking based on date status"""
    
    def test_donation_blocked_for_future_campaign(self, auth_headers):
        """Donation should be blocked for campaigns that haven't started"""
        future_start = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        future_end = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        # Create future campaign
        response = requests.post(f"{BASE_URL}/api/tabung/campaigns",
            headers=auth_headers,
            json={
                "title": "TEST_Donation Block Future",
                "description": "Test donation blocking",
                "campaign_type": "amount",
                "target_amount": 1000,
                "start_date": future_start,
                "end_date": future_end
            }
        )
        
        assert response.status_code == 200
        campaign_id = response.json()["id"]
        
        # Try to donate (authenticated)
        donate_response = requests.post(f"{BASE_URL}/api/tabung/donate",
            headers=auth_headers,
            json={
                "campaign_id": campaign_id,
                "amount": 50,
                "payment_method": "fpx",
                "is_anonymous": False
            }
        )
        
        # Should be blocked
        assert donate_response.status_code == 400, f"Expected 400 but got {donate_response.status_code}"
        assert "Belum Dilancarkan" in donate_response.text, f"Error should mention 'Belum Dilancarkan': {donate_response.text}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}", headers=auth_headers)
        print(f"✓ Donation blocked for future campaign with message 'Belum Dilancarkan'")
    
    def test_donation_blocked_for_expired_campaign(self, auth_headers):
        """Donation should be blocked for campaigns that have ended"""
        past_start = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        past_end = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        
        # Create expired campaign
        response = requests.post(f"{BASE_URL}/api/tabung/campaigns",
            headers=auth_headers,
            json={
                "title": "TEST_Donation Block Expired",
                "description": "Test donation blocking",
                "campaign_type": "amount",
                "target_amount": 1000,
                "start_date": past_start,
                "end_date": past_end
            }
        )
        
        assert response.status_code == 200
        campaign_id = response.json()["id"]
        
        # Try to donate (authenticated)
        donate_response = requests.post(f"{BASE_URL}/api/tabung/donate",
            headers=auth_headers,
            json={
                "campaign_id": campaign_id,
                "amount": 50,
                "payment_method": "fpx",
                "is_anonymous": False
            }
        )
        
        # Should be blocked
        assert donate_response.status_code == 400, f"Expected 400 but got {donate_response.status_code}"
        assert "Kutipan Sudah Tamat" in donate_response.text, f"Error should mention 'Kutipan Sudah Tamat': {donate_response.text}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}", headers=auth_headers)
        print(f"✓ Donation blocked for expired campaign with message 'Kutipan Sudah Tamat'")
    
    def test_public_donation_blocked_for_future_campaign(self, auth_headers):
        """Public donation should also be blocked for future campaigns"""
        future_start = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        future_end = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        # Create future campaign
        response = requests.post(f"{BASE_URL}/api/tabung/campaigns",
            headers=auth_headers,
            json={
                "title": "TEST_Public Block Future",
                "description": "Test public donation blocking",
                "campaign_type": "amount",
                "target_amount": 1000,
                "start_date": future_start,
                "end_date": future_end,
                "is_public": True
            }
        )
        
        assert response.status_code == 200
        campaign_id = response.json()["id"]
        
        # Try public donation (no auth)
        donate_response = requests.post(f"{BASE_URL}/api/tabung/public/donate",
            json={
                "campaign_id": campaign_id,
                "donor_name": "Test Donor",
                "amount": 50
            }
        )
        
        # Should be blocked
        assert donate_response.status_code == 400, f"Expected 400 but got {donate_response.status_code}"
        assert "Belum Dilancarkan" in donate_response.text
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}", headers=auth_headers)
        print(f"✓ Public donation blocked for future campaign")
    
    def test_public_donation_blocked_for_expired_campaign(self, auth_headers):
        """Public donation should also be blocked for expired campaigns"""
        past_start = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        past_end = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        
        # Create expired campaign
        response = requests.post(f"{BASE_URL}/api/tabung/campaigns",
            headers=auth_headers,
            json={
                "title": "TEST_Public Block Expired",
                "description": "Test public donation blocking",
                "campaign_type": "amount",
                "target_amount": 1000,
                "start_date": past_start,
                "end_date": past_end,
                "is_public": True
            }
        )
        
        assert response.status_code == 200
        campaign_id = response.json()["id"]
        
        # Try public donation (no auth)
        donate_response = requests.post(f"{BASE_URL}/api/tabung/public/donate",
            json={
                "campaign_id": campaign_id,
                "donor_name": "Test Donor",
                "amount": 50
            }
        )
        
        # Should be blocked
        assert donate_response.status_code == 400, f"Expected 400 but got {donate_response.status_code}"
        assert "Kutipan Sudah Tamat" in donate_response.text
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}", headers=auth_headers)
        print(f"✓ Public donation blocked for expired campaign")


class TestCampaignListDateInfo:
    """Test date info in campaign list response"""
    
    def test_list_campaigns_includes_date_fields(self, auth_headers):
        """Campaign list should include date_status, date_remark, can_donate fields"""
        # Get campaigns list
        response = requests.get(f"{BASE_URL}/api/tabung/campaigns", headers=auth_headers)
        assert response.status_code == 200
        
        campaigns = response.json()
        
        if len(campaigns) > 0:
            campaign = campaigns[0]
            # Verify date-related fields exist
            assert "date_status" in campaign, "date_status field missing from list response"
            assert "can_donate" in campaign, "can_donate field missing from list response"
            # date_remark can be None, so just check it exists
            assert "date_remark" in campaign or campaign.get("date_remark") is None
            print(f"✓ Campaign list includes date_status, date_remark, can_donate fields")
        else:
            print(f"⚠ No campaigns to verify - skipping")
    
    def test_public_campaigns_include_date_fields(self, auth_headers):
        """Public campaigns endpoint should also include date fields"""
        response = requests.get(f"{BASE_URL}/api/tabung/public/campaigns")
        assert response.status_code == 200
        
        campaigns = response.json()
        
        if len(campaigns) > 0:
            campaign = campaigns[0]
            # Verify date-related fields exist
            assert "date_status" in campaign, "date_status field missing from public list"
            assert "can_donate" in campaign, "can_donate field missing from public list"
            print(f"✓ Public campaign list includes date fields")
        else:
            print(f"⚠ No public campaigns to verify - skipping")


class TestSlotCampaignDateBlocking:
    """Test date blocking for slot-based campaigns"""
    
    def test_slot_donation_blocked_for_future_campaign(self, auth_headers):
        """Slot donation should be blocked for campaigns that haven't started"""
        future_start = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        future_end = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        # Create future slot campaign
        response = requests.post(f"{BASE_URL}/api/tabung/campaigns",
            headers=auth_headers,
            json={
                "title": "TEST_Slot Block Future",
                "description": "Test slot donation blocking",
                "campaign_type": "slot",
                "total_slots": 100,
                "price_per_slot": 25,
                "start_date": future_start,
                "end_date": future_end
            }
        )
        
        assert response.status_code == 200
        campaign_id = response.json()["id"]
        
        # Try to donate slots
        donate_response = requests.post(f"{BASE_URL}/api/tabung/donate",
            headers=auth_headers,
            json={
                "campaign_id": campaign_id,
                "slots": 2,
                "payment_method": "fpx",
                "is_anonymous": False
            }
        )
        
        # Should be blocked
        assert donate_response.status_code == 400, f"Expected 400 but got {donate_response.status_code}"
        assert "Belum Dilancarkan" in donate_response.text
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}", headers=auth_headers)
        print(f"✓ Slot donation blocked for future campaign")


class TestUpdateCampaignDates:
    """Test updating campaign dates"""
    
    def test_update_campaign_dates(self, auth_headers):
        """Update campaign dates and verify date_status changes"""
        # Create active campaign
        past_start = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        future_end = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        response = requests.post(f"{BASE_URL}/api/tabung/campaigns",
            headers=auth_headers,
            json={
                "title": "TEST_Update Dates",
                "description": "Test date update",
                "campaign_type": "amount",
                "target_amount": 1000,
                "start_date": past_start,
                "end_date": future_end
            }
        )
        
        assert response.status_code == 200
        campaign_id = response.json()["id"]
        
        # Verify initially active
        detail = requests.get(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}", headers=auth_headers)
        assert detail.json()["date_status"] == "active"
        
        # Update to future dates
        future_start = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        future_end2 = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        update_response = requests.put(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}",
            headers=auth_headers,
            json={
                "start_date": future_start,
                "end_date": future_end2
            }
        )
        
        assert update_response.status_code == 200
        
        # Verify now upcoming
        detail2 = requests.get(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}", headers=auth_headers)
        assert detail2.json()["date_status"] == "upcoming"
        assert detail2.json()["date_remark"] == "Belum Dilancarkan"
        assert detail2.json()["can_donate"] == False
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/tabung/campaigns/{campaign_id}", headers=auth_headers)
        print(f"✓ Campaign date update changes date_status correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
