"""
Test cases for Tabung & Sumbangan (Unified Donation Module)
Tests both slot-based and amount-based campaigns and donations
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPERADMIN_EMAIL = "superadmin@muafakat.link"
SUPERADMIN_PASSWORD = "admin123"
PARENT_EMAIL = "parent@muafakat.link"
PARENT_PASSWORD = "parent123"

class TestTabungModule:
    """Test suite for unified Tabung & Sumbangan module"""
    
    admin_token = None
    parent_token = None
    slot_campaign_id = None
    amount_campaign_id = None
    slot_donation_id = None
    amount_donation_id = None
    
    @classmethod
    def setup_class(cls):
        """Get authentication tokens"""
        # Admin login
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPERADMIN_EMAIL,
            "password": SUPERADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        cls.admin_token = response.json()["access_token"]
        
        # Parent login
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARENT_EMAIL,
            "password": PARENT_PASSWORD
        })
        assert response.status_code == 200, f"Parent login failed: {response.text}"
        cls.parent_token = response.json()["access_token"]
    
    def get_admin_headers(self):
        return {"Authorization": f"Bearer {self.admin_token}", "Content-Type": "application/json"}
    
    def get_parent_headers(self):
        return {"Authorization": f"Bearer {self.parent_token}", "Content-Type": "application/json"}
    
    # ==================== CAMPAIGN TESTS ====================
    
    def test_01_create_slot_based_campaign(self):
        """Admin can create slot-based campaign"""
        response = requests.post(f"{BASE_URL}/api/tabung/campaigns", json={
            "title": "TEST_Tabung Surau Al-Hidayah (Slot)",
            "description": "Kempen infaq slot untuk surau",
            "campaign_type": "slot",
            "total_slots": 100,
            "price_per_slot": 50.0,
            "min_slots": 1,
            "max_slots": 10
        }, headers=self.get_admin_headers())
        
        assert response.status_code == 200, f"Failed to create slot campaign: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["message"] == "Kempen berjaya dicipta"
        TestTabungModule.slot_campaign_id = data["id"]
        print(f"Created slot campaign: {data['id']}")
    
    def test_02_create_amount_based_campaign(self):
        """Admin can create amount-based campaign"""
        response = requests.post(f"{BASE_URL}/api/tabung/campaigns", json={
            "title": "TEST_Tabung Bantuan Pelajar (Sumbangan)",
            "description": "Kempen sumbangan untuk bantuan pelajar",
            "campaign_type": "amount",
            "target_amount": 10000.0,
            "min_amount": 10.0,
            "max_amount": 5000.0
        }, headers=self.get_admin_headers())
        
        assert response.status_code == 200, f"Failed to create amount campaign: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["message"] == "Kempen berjaya dicipta"
        TestTabungModule.amount_campaign_id = data["id"]
        print(f"Created amount campaign: {data['id']}")
    
    def test_03_get_all_campaigns(self):
        """Get all campaigns as admin"""
        response = requests.get(f"{BASE_URL}/api/tabung/campaigns", 
                               headers=self.get_admin_headers())
        
        assert response.status_code == 200, f"Failed to get campaigns: {response.text}"
        campaigns = response.json()
        assert isinstance(campaigns, list)
        assert len(campaigns) >= 2  # At least our 2 test campaigns
        
        # Verify campaign structure
        for campaign in campaigns:
            assert "id" in campaign
            assert "title" in campaign
            assert "campaign_type" in campaign
            assert campaign["campaign_type"] in ["slot", "amount"]
            assert "status" in campaign
            print(f"Campaign: {campaign['title']} - Type: {campaign['campaign_type']}")
    
    def test_04_get_campaigns_filtered_by_type(self):
        """Get campaigns filtered by type"""
        # Slot campaigns
        response = requests.get(f"{BASE_URL}/api/tabung/campaigns?campaign_type=slot", 
                               headers=self.get_admin_headers())
        assert response.status_code == 200
        slot_campaigns = response.json()
        for c in slot_campaigns:
            assert c["campaign_type"] == "slot"
        
        # Amount campaigns
        response = requests.get(f"{BASE_URL}/api/tabung/campaigns?campaign_type=amount", 
                               headers=self.get_admin_headers())
        assert response.status_code == 200
        amount_campaigns = response.json()
        for c in amount_campaigns:
            assert c["campaign_type"] == "amount"
        
        print(f"Slot campaigns: {len(slot_campaigns)}, Amount campaigns: {len(amount_campaigns)}")
    
    def test_05_get_campaign_detail(self):
        """Get single campaign details"""
        # Slot campaign
        response = requests.get(f"{BASE_URL}/api/tabung/campaigns/{self.slot_campaign_id}", 
                               headers=self.get_admin_headers())
        assert response.status_code == 200, f"Failed to get slot campaign: {response.text}"
        campaign = response.json()
        assert campaign["campaign_type"] == "slot"
        assert "total_slots" in campaign
        assert "price_per_slot" in campaign
        assert "slots_available" in campaign
        print(f"Slot campaign: {campaign['title']}, Slots: {campaign['slots_available']}/{campaign['total_slots']}")
        
        # Amount campaign
        response = requests.get(f"{BASE_URL}/api/tabung/campaigns/{self.amount_campaign_id}", 
                               headers=self.get_admin_headers())
        assert response.status_code == 200, f"Failed to get amount campaign: {response.text}"
        campaign = response.json()
        assert campaign["campaign_type"] == "amount"
        assert "target_amount" in campaign
        assert "collected_amount" in campaign
        print(f"Amount campaign: {campaign['title']}, Progress: RM{campaign['collected_amount']}/RM{campaign['target_amount']}")
    
    def test_06_update_campaign(self):
        """Admin can update campaign"""
        response = requests.put(f"{BASE_URL}/api/tabung/campaigns/{self.slot_campaign_id}", json={
            "description": "Updated description for slot campaign"
        }, headers=self.get_admin_headers())
        
        assert response.status_code == 200, f"Failed to update campaign: {response.text}"
        assert response.json()["message"] == "Kempen berjaya dikemaskini"
        print("Campaign updated successfully")
    
    # ==================== DONATION TESTS ====================
    
    def test_07_donate_to_slot_campaign(self):
        """Parent can donate to slot-based campaign"""
        response = requests.post(f"{BASE_URL}/api/tabung/donate", json={
            "campaign_id": self.slot_campaign_id,
            "slots": 2,
            "payment_method": "fpx",
            "is_anonymous": False,
            "message": "Semoga memberi manfaat"
        }, headers=self.get_parent_headers())
        
        assert response.status_code == 200, f"Failed to donate to slot campaign: {response.text}"
        data = response.json()
        assert "id" in data
        assert "receipt_number" in data
        assert data["receipt_number"].startswith("SLOT-")  # Slot donation receipt prefix
        assert data["slots"] == 2
        assert data["amount"] == 100.0  # 2 slots x RM50
        assert data["payment_status"] == "completed"
        TestTabungModule.slot_donation_id = data["id"]
        print(f"Slot donation: {data['receipt_number']}, RM{data['amount']}")
    
    def test_08_donate_to_amount_campaign(self):
        """Parent can donate to amount-based campaign"""
        response = requests.post(f"{BASE_URL}/api/tabung/donate", json={
            "campaign_id": self.amount_campaign_id,
            "amount": 50.0,
            "payment_method": "fpx",
            "is_anonymous": True,
            "message": "Sedekah untuk kebaikan"
        }, headers=self.get_parent_headers())
        
        assert response.status_code == 200, f"Failed to donate to amount campaign: {response.text}"
        data = response.json()
        assert "id" in data
        assert "receipt_number" in data
        assert data["receipt_number"].startswith("SED-")  # Amount donation receipt prefix
        assert data["amount"] == 50.0
        assert data["payment_status"] == "completed"
        TestTabungModule.amount_donation_id = data["id"]
        print(f"Amount donation: {data['receipt_number']}, RM{data['amount']}")
    
    def test_09_get_my_donations(self):
        """Parent can view donation history"""
        response = requests.get(f"{BASE_URL}/api/tabung/donations/my", 
                               headers=self.get_parent_headers())
        
        assert response.status_code == 200, f"Failed to get donations: {response.text}"
        donations = response.json()
        assert isinstance(donations, list)
        assert len(donations) >= 2  # At least our 2 test donations
        
        for donation in donations:
            assert "id" in donation
            assert "receipt_number" in donation
            assert "campaign_title" in donation
            assert "amount" in donation
            assert "payment_status" in donation
            # Check badge indicator
            if donation.get("is_slot_based"):
                assert donation["receipt_number"].startswith("SLOT-")
            else:
                assert donation["receipt_number"].startswith("SED-")
        
        print(f"My donations count: {len(donations)}")
    
    def test_10_get_donation_detail(self):
        """Get specific donation details"""
        response = requests.get(f"{BASE_URL}/api/tabung/donations/{self.slot_donation_id}", 
                               headers=self.get_parent_headers())
        
        assert response.status_code == 200, f"Failed to get donation detail: {response.text}"
        donation = response.json()
        assert donation["id"] == self.slot_donation_id
        assert "receipt_number" in donation
        assert donation["receipt_number"].startswith("SLOT-")
        print(f"Donation detail: {donation['receipt_number']}")
    
    # ==================== ADMIN STATISTICS & REPORTS ====================
    
    def test_11_get_admin_donations_list(self):
        """Admin can view all donations"""
        response = requests.get(f"{BASE_URL}/api/tabung/donations", 
                               headers=self.get_admin_headers())
        
        assert response.status_code == 200, f"Failed to get admin donations: {response.text}"
        donations = response.json()
        assert isinstance(donations, list)
        print(f"Total donations: {len(donations)}")
    
    def test_12_get_statistics(self):
        """Admin can view unified donation statistics"""
        response = requests.get(f"{BASE_URL}/api/tabung/stats", 
                               headers=self.get_admin_headers())
        
        assert response.status_code == 200, f"Failed to get stats: {response.text}"
        stats = response.json()
        
        # Verify stats structure
        assert "campaigns" in stats
        assert "donations" in stats
        assert "by_type" in stats
        
        # Campaign stats
        assert "active" in stats["campaigns"]
        assert "completed" in stats["campaigns"]
        assert "slot_based" in stats["campaigns"]
        assert "amount_based" in stats["campaigns"]
        
        # Donation stats
        assert "total_amount" in stats["donations"]
        assert "total_donations" in stats["donations"]
        assert "unique_donors" in stats["donations"]
        
        # By type stats
        assert "slot" in stats["by_type"]
        assert "amount" in stats["by_type"]
        
        print(f"Stats: Active campaigns: {stats['campaigns']['active']}, "
              f"Total collected: RM{stats['donations']['total_amount']}")
    
    def test_13_get_realtime_report(self):
        """Admin can view real-time collection report"""
        response = requests.get(f"{BASE_URL}/api/tabung/reports/real-time", 
                               headers=self.get_admin_headers())
        
        assert response.status_code == 200, f"Failed to get realtime report: {response.text}"
        report = response.json()
        
        # Verify report structure
        assert "today" in report
        assert "this_month" in report
        assert "recent_donations" in report
        assert "active_campaigns" in report
        assert "generated_at" in report
        
        assert "total" in report["today"]
        assert "count" in report["today"]
        
        print(f"Real-time report: Today RM{report['today']['total']}, "
              f"Month RM{report['this_month']['total']}")
    
    def test_14_get_ledger_entries(self):
        """Admin can view financial ledger entries"""
        response = requests.get(f"{BASE_URL}/api/tabung/reports/ledger", 
                               headers=self.get_admin_headers())
        
        assert response.status_code == 200, f"Failed to get ledger: {response.text}"
        ledger = response.json()
        assert isinstance(ledger, list)
        
        for entry in ledger:
            assert "id" in entry
            assert "type" in entry
            assert "amount" in entry
            assert "reference_number" in entry
            assert entry["type"] in ["donation_slot", "donation_amount", "donation_received"]
        
        print(f"Ledger entries: {len(ledger)}")
    
    # ==================== PUBLIC ENDPOINTS ====================
    
    def test_15_public_campaigns(self):
        """Public can view active campaigns"""
        response = requests.get(f"{BASE_URL}/api/tabung/public/campaigns")
        
        assert response.status_code == 200, f"Failed to get public campaigns: {response.text}"
        campaigns = response.json()
        assert isinstance(campaigns, list)
        
        # All returned campaigns should be active
        for campaign in campaigns:
            assert campaign["status"] == "active"
        
        print(f"Public active campaigns: {len(campaigns)}")
    
    def test_16_public_stats(self):
        """Public can view public statistics"""
        response = requests.get(f"{BASE_URL}/api/tabung/public/stats")
        
        assert response.status_code == 200, f"Failed to get public stats: {response.text}"
        stats = response.json()
        
        assert "active_campaigns" in stats
        assert "total_collected" in stats
        assert "total_donations" in stats
        assert "unique_donors" in stats
        
        print(f"Public stats: {stats['active_campaigns']} active campaigns, "
              f"RM{stats['total_collected']} collected")
    
    # ==================== VALIDATION TESTS ====================
    
    def test_17_donate_invalid_slot_count(self):
        """Cannot donate more slots than available"""
        response = requests.post(f"{BASE_URL}/api/tabung/donate", json={
            "campaign_id": self.slot_campaign_id,
            "slots": 1000,  # More than available
            "payment_method": "fpx"
        }, headers=self.get_parent_headers())
        
        # Should fail with 400
        assert response.status_code == 400, f"Should fail for invalid slot count"
        print("Correctly rejected excess slot donation")
    
    def test_18_donate_below_minimum(self):
        """Cannot donate below minimum amount"""
        response = requests.post(f"{BASE_URL}/api/tabung/donate", json={
            "campaign_id": self.amount_campaign_id,
            "amount": 1.0,  # Below min_amount of 10
            "payment_method": "fpx"
        }, headers=self.get_parent_headers())
        
        # Should fail with 400
        assert response.status_code == 400, f"Should fail for amount below minimum"
        print("Correctly rejected below-minimum donation")
    
    def test_19_parent_cannot_access_admin_stats(self):
        """Parent cannot access admin-only statistics"""
        response = requests.get(f"{BASE_URL}/api/tabung/stats", 
                               headers=self.get_parent_headers())
        
        # Should fail with 403
        assert response.status_code == 403, f"Parent should not access admin stats"
        print("Correctly denied parent access to admin stats")
    
    # ==================== CLEANUP ====================
    
    def test_99_cleanup_delete_campaigns(self):
        """Cleanup: Delete test campaigns"""
        # Delete slot campaign
        response = requests.delete(f"{BASE_URL}/api/tabung/campaigns/{self.slot_campaign_id}", 
                                  headers=self.get_admin_headers())
        assert response.status_code == 200, f"Failed to delete slot campaign: {response.text}"
        
        # Delete amount campaign
        response = requests.delete(f"{BASE_URL}/api/tabung/campaigns/{self.amount_campaign_id}", 
                                  headers=self.get_admin_headers())
        assert response.status_code == 200, f"Failed to delete amount campaign: {response.text}"
        
        print("Test campaigns cleaned up (status set to cancelled)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
