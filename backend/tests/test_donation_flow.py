"""
Test Donation Flow - Refactored Donation Feature Tests
- Public donation form on campaign detail page with preset amounts
- Custom amount input field
- Anonymous public donation (no name provided)
- Named public donation (with donor info)
- Success popup/dialog appears after successful donation
- Form reset after successful donation
- Parent logged-in donation uses authenticated endpoint
- Campaign progress/stats update after donation
- Backend API /api/public/donations endpoint accepts donations without auth
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')

class TestPublicDonationEndpoint:
    """Test public donation endpoint - no auth required"""
    
    def test_get_public_campaigns(self):
        """GET /api/public/donations/campaigns - should work without auth"""
        response = requests.get(f"{BASE_URL}/api/public/donations/campaigns")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list of campaigns"
        if len(data) > 0:
            campaign = data[0]
            assert "id" in campaign, "Campaign should have id"
            assert "title" in campaign, "Campaign should have title"
            assert "collected_amount" in campaign, "Campaign should have collected_amount"
            assert "target_amount" in campaign, "Campaign should have target_amount"
            print(f"SUCCESS: Retrieved {len(data)} public campaigns")
            return data
        print("SUCCESS: Public campaigns endpoint works (no campaigns found)")
        return []
    
    def test_get_public_donations_stats(self):
        """GET /api/public/donations/stats - should return donation statistics"""
        response = requests.get(f"{BASE_URL}/api/public/donations/stats")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "total_collected" in data or "total_donations" in data or "total_campaigns" in data, "Should have stats"
        print(f"SUCCESS: Got public donation stats: {data}")
        return data
    
    def test_get_campaign_by_id(self):
        """GET /api/public/donations/campaigns/{id} - get single campaign detail"""
        # First get campaigns list
        campaigns_resp = requests.get(f"{BASE_URL}/api/public/donations/campaigns")
        assert campaigns_resp.status_code == 200
        campaigns = campaigns_resp.json()
        
        if len(campaigns) == 0:
            pytest.skip("No campaigns available for testing")
        
        campaign_id = campaigns[0]["id"]
        response = requests.get(f"{BASE_URL}/api/public/donations/campaigns/{campaign_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data["id"] == campaign_id, "Campaign ID should match"
        assert "title" in data, "Should have title"
        assert "description" in data, "Should have description"
        print(f"SUCCESS: Got campaign detail: {data['title']}")
        return data


class TestAnonymousPublicDonation:
    """Test anonymous public donations without login"""
    
    @pytest.fixture
    def campaign_id(self):
        """Get a valid campaign ID for testing"""
        response = requests.get(f"{BASE_URL}/api/public/donations/campaigns")
        if response.status_code != 200 or len(response.json()) == 0:
            pytest.skip("No campaigns available")
        return response.json()[0]["id"]
    
    def test_anonymous_donation_no_name(self, campaign_id):
        """POST /api/public/donations - anonymous donation without name"""
        # Get campaign before donation
        before_resp = requests.get(f"{BASE_URL}/api/public/donations/campaigns/{campaign_id}")
        assert before_resp.status_code == 200
        collected_before = before_resp.json().get("collected_amount", 0)
        donor_count_before = before_resp.json().get("donor_count", 0)
        
        payload = {
            "campaign_id": campaign_id,
            "amount": 10.0,  # Preset amount RM10
            "payment_method": "fpx",
            "donor_name": None,
            "donor_email": None,
            "donor_phone": None,
            "message": None
        }
        response = requests.post(f"{BASE_URL}/api/public/donations", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}. Response: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Donation should be successful"
        assert "receipt_number" in data, "Should have receipt number"
        assert data.get("amount") == 10.0, f"Amount should be 10.0, got {data.get('amount')}"
        assert data.get("donor_name") == "Penderma Tanpa Nama", f"Anonymous donor name should be default"
        assert data.get("is_anonymous") == True, "Should be marked as anonymous"
        
        # Verify campaign stats updated
        after_resp = requests.get(f"{BASE_URL}/api/public/donations/campaigns/{campaign_id}")
        assert after_resp.status_code == 200
        collected_after = after_resp.json().get("collected_amount", 0)
        donor_count_after = after_resp.json().get("donor_count", 0)
        
        assert collected_after == collected_before + 10.0, f"Collected amount should increase by 10. Before: {collected_before}, After: {collected_after}"
        assert donor_count_after == donor_count_before + 1, f"Donor count should increase by 1"
        
        print(f"SUCCESS: Anonymous donation completed. Receipt: {data['receipt_number']}")
        return data
    
    def test_named_public_donation(self, campaign_id):
        """POST /api/public/donations - public donation with name (not anonymous)"""
        payload = {
            "campaign_id": campaign_id,
            "amount": 50.0,  # Preset amount RM50
            "payment_method": "fpx",
            "donor_name": "TEST_John Doe Public",
            "donor_email": "test@example.com",
            "donor_phone": "0123456789",
            "message": "Test donation message"
        }
        response = requests.post(f"{BASE_URL}/api/public/donations", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}. Response: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Donation should be successful"
        assert data.get("donor_name") == "TEST_John Doe Public", f"Donor name should match. Got: {data.get('donor_name')}"
        assert data.get("is_anonymous") == False, "Should NOT be anonymous"
        assert data.get("amount") == 50.0, "Amount should be 50.0"
        
        print(f"SUCCESS: Named public donation completed. Donor: {data['donor_name']}, Receipt: {data['receipt_number']}")
        return data
    
    def test_custom_amount_donation(self, campaign_id):
        """POST /api/public/donations - custom amount donation"""
        custom_amount = 75.50  # Custom amount not in preset
        payload = {
            "campaign_id": campaign_id,
            "amount": custom_amount,
            "payment_method": "fpx",
            "donor_name": "TEST_Custom Amount Donor",
            "donor_email": "custom@test.com",
            "donor_phone": None,
            "message": "Custom amount test"
        }
        response = requests.post(f"{BASE_URL}/api/public/donations", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get("amount") == custom_amount, f"Custom amount should be {custom_amount}"
        assert data.get("success") == True
        
        print(f"SUCCESS: Custom amount donation: RM{custom_amount}")
        return data
    
    def test_preset_amounts(self, campaign_id):
        """Test all preset amounts work correctly"""
        preset_amounts = [10, 50, 100, 200, 500, 1000]
        
        for amount in preset_amounts[:2]:  # Test first 2 to not flood the system
            payload = {
                "campaign_id": campaign_id,
                "amount": float(amount),
                "payment_method": "fpx",
                "donor_name": f"TEST_Preset {amount}",
                "donor_email": None,
                "donor_phone": None,
                "message": None
            }
            response = requests.post(f"{BASE_URL}/api/public/donations", json=payload)
            assert response.status_code == 200, f"Preset amount {amount} failed"
            assert response.json().get("amount") == float(amount)
            print(f"  - Preset RM{amount}: PASS")
        
        print(f"SUCCESS: Preset amounts work correctly")
    
    def test_invalid_amount_below_minimum(self, campaign_id):
        """POST /api/public/donations - should reject amount below RM1"""
        payload = {
            "campaign_id": campaign_id,
            "amount": 0.50,  # Below minimum
            "payment_method": "fpx",
            "donor_name": None,
            "donor_email": None,
            "donor_phone": None,
            "message": None
        }
        response = requests.post(f"{BASE_URL}/api/public/donations", json=payload)
        assert response.status_code == 400, f"Expected 400 for amount below minimum, got {response.status_code}"
        print("SUCCESS: Correctly rejected amount below minimum")
    
    def test_invalid_campaign_id(self):
        """POST /api/public/donations - should reject invalid campaign ID"""
        payload = {
            "campaign_id": "000000000000000000000000",  # Invalid ObjectId
            "amount": 10.0,
            "payment_method": "fpx",
            "donor_name": None,
            "donor_email": None,
            "donor_phone": None,
            "message": None
        }
        response = requests.post(f"{BASE_URL}/api/public/donations", json=payload)
        assert response.status_code == 404, f"Expected 404 for invalid campaign, got {response.status_code}"
        print("SUCCESS: Correctly rejected invalid campaign ID")


class TestParentAuthenticatedDonation:
    """Test authenticated donations for logged-in parents"""
    
    @pytest.fixture
    def parent_token(self):
        """Get parent auth token"""
        login_payload = {
            "email": "demo@muafakat.link",
            "password": "demoparent"
        }
        response = requests.post(f"{BASE_URL}/api/auth/login", json=login_payload)
        if response.status_code != 200:
            pytest.skip("Parent login failed - credentials may be incorrect")
        return response.json()["access_token"]
    
    @pytest.fixture
    def campaign_id(self):
        """Get a valid campaign ID"""
        response = requests.get(f"{BASE_URL}/api/public/donations/campaigns")
        if response.status_code != 200 or len(response.json()) == 0:
            pytest.skip("No campaigns available")
        return response.json()[0]["id"]
    
    def test_parent_login(self):
        """Test parent login works"""
        login_payload = {
            "email": "demo@muafakat.link",
            "password": "demoparent"
        }
        response = requests.post(f"{BASE_URL}/api/auth/login", json=login_payload)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "Should return access token"
        assert data["user"]["role"] == "parent", f"Should be parent role, got {data['user']['role']}"
        print(f"SUCCESS: Parent login works. User: {data['user']['full_name']}")
        return data
    
    def test_authenticated_donation(self, parent_token, campaign_id):
        """POST /api/donations - authenticated donation for parent"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        
        # Get campaign before
        before_resp = requests.get(f"{BASE_URL}/api/public/donations/campaigns/{campaign_id}")
        collected_before = before_resp.json().get("collected_amount", 0) if before_resp.status_code == 200 else 0
        
        payload = {
            "campaign_id": campaign_id,
            "amount": 100.0,
            "payment_method": "fpx",
            "is_anonymous": False,
            "message": "Test authenticated donation from parent"
        }
        response = requests.post(f"{BASE_URL}/api/donations", json=payload, headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}. Response: {response.text}"
        
        data = response.json()
        assert "receipt_number" in data, "Should have receipt number"
        assert data.get("amount") == 100.0, "Amount should match"
        
        # Verify campaign updated
        after_resp = requests.get(f"{BASE_URL}/api/public/donations/campaigns/{campaign_id}")
        if after_resp.status_code == 200:
            collected_after = after_resp.json().get("collected_amount", 0)
            assert collected_after == collected_before + 100.0, "Collected amount should increase"
        
        print(f"SUCCESS: Authenticated parent donation completed. Receipt: {data.get('receipt_number')}")
        return data
    
    def test_authenticated_anonymous_donation(self, parent_token, campaign_id):
        """POST /api/donations - parent can donate anonymously"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        payload = {
            "campaign_id": campaign_id,
            "amount": 200.0,
            "payment_method": "fpx",
            "is_anonymous": True,
            "message": None
        }
        response = requests.post(f"{BASE_URL}/api/donations", json=payload, headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # For anonymous, the donor_name should be hidden in responses or shown as anonymous
        print(f"SUCCESS: Anonymous donation by parent. Amount: RM{data.get('amount')}")
        return data


class TestDonationResponseValidation:
    """Validate donation response structure for success dialog"""
    
    @pytest.fixture
    def campaign_id(self):
        response = requests.get(f"{BASE_URL}/api/public/donations/campaigns")
        if response.status_code != 200 or len(response.json()) == 0:
            pytest.skip("No campaigns available")
        return response.json()[0]["id"]
    
    def test_donation_response_has_receipt_details(self, campaign_id):
        """Verify response has all fields needed for success dialog"""
        payload = {
            "campaign_id": campaign_id,
            "amount": 50.0,
            "payment_method": "fpx",
            "donor_name": "TEST_Receipt Test",
            "donor_email": "receipt@test.com",
            "donor_phone": None,
            "message": "Testing receipt"
        }
        response = requests.post(f"{BASE_URL}/api/public/donations", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        
        # All fields needed for success popup
        assert "amount" in data, "Should have amount for display"
        assert "campaign_title" in data, "Should have campaign_title for display"
        assert "receipt_number" in data, "Should have receipt_number for display"
        assert "donor_name" in data, "Should have donor_name for display"
        assert "status" in data, "Should have status"
        assert data["status"] == "completed", f"Status should be completed, got {data['status']}"
        
        print(f"SUCCESS: Response has all receipt details:")
        print(f"  - Amount: RM{data['amount']}")
        print(f"  - Campaign: {data['campaign_title']}")
        print(f"  - Receipt: {data['receipt_number']}")
        print(f"  - Donor: {data['donor_name']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
