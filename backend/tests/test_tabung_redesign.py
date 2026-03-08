"""
Test Suite: Tabung & Sumbangan Redesign Module
Features: QR Code, Image Upload, Share Data, Public Donation Page
"""
import pytest
import requests
import os
import io
from PIL import Image

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "superadmin@muafakat.link"
ADMIN_PASSWORD = "admin123"
PARENT_EMAIL = "parent@muafakat.link"
PARENT_PASSWORD = "parent123"

test_campaign_id = None
test_slot_campaign_id = None


@pytest.fixture(scope="session")
def admin_token():
    """Get admin auth token"""
    res = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL, 
        "password": ADMIN_PASSWORD
    })
    if res.status_code == 200:
        return res.json().get("access_token")
    pytest.skip("Admin authentication failed")


@pytest.fixture(scope="session")
def parent_token():
    """Get parent auth token"""
    res = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": PARENT_EMAIL, 
        "password": PARENT_PASSWORD
    })
    if res.status_code == 200:
        return res.json().get("access_token")
    pytest.skip("Parent authentication failed")


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def parent_headers(parent_token):
    return {"Authorization": f"Bearer {parent_token}", "Content-Type": "application/json"}


class TestCampaignCRUD:
    """Test campaign creation for QR/share/image features"""
    
    def test_create_slot_campaign(self, admin_headers):
        """Create a slot-based campaign for testing QR/share features"""
        global test_slot_campaign_id
        payload = {
            "title": "TEST_QR_Slot_Campaign",
            "description": "Test campaign for QR code and share features",
            "full_description": "This is a full description for the campaign detail page",
            "campaign_type": "slot",
            "total_slots": 100,
            "price_per_slot": 10.0,
            "min_slots": 1,
            "max_slots": 10,
            "is_public": True,
            "allow_anonymous": True
        }
        res = requests.post(f"{BASE_URL}/api/tabung/campaigns", json=payload, headers=admin_headers)
        assert res.status_code == 200, f"Failed to create slot campaign: {res.text}"
        data = res.json()
        assert "id" in data
        test_slot_campaign_id = data["id"]
        print(f"Created slot campaign: {test_slot_campaign_id}")
    
    def test_create_amount_campaign(self, admin_headers):
        """Create an amount-based campaign for testing"""
        global test_campaign_id
        payload = {
            "title": "TEST_QR_Amount_Campaign",
            "description": "Test campaign for amount-based donations",
            "full_description": "Full description with rich content",
            "campaign_type": "amount",
            "target_amount": 5000.0,
            "min_amount": 1.0,
            "max_amount": 1000.0,
            "is_public": True,
            "allow_anonymous": True
        }
        res = requests.post(f"{BASE_URL}/api/tabung/campaigns", json=payload, headers=admin_headers)
        assert res.status_code == 200, f"Failed to create amount campaign: {res.text}"
        data = res.json()
        assert "id" in data
        test_campaign_id = data["id"]
        print(f"Created amount campaign: {test_campaign_id}")


class TestQRCodeGeneration:
    """Test QR code generation endpoint"""
    
    def test_qrcode_endpoint_slot_campaign(self):
        """Test QR code generation for slot campaign"""
        if not test_slot_campaign_id:
            pytest.skip("No slot campaign created")
        
        res = requests.get(f"{BASE_URL}/api/tabung/campaigns/{test_slot_campaign_id}/qrcode")
        assert res.status_code == 200, f"QR code endpoint failed: {res.text}"
        assert res.headers.get('content-type') == 'image/png'
        assert len(res.content) > 0
        print(f"QR code size: {len(res.content)} bytes")
    
    def test_qrcode_endpoint_amount_campaign(self):
        """Test QR code generation for amount campaign"""
        if not test_campaign_id:
            pytest.skip("No amount campaign created")
        
        res = requests.get(f"{BASE_URL}/api/tabung/campaigns/{test_campaign_id}/qrcode")
        assert res.status_code == 200, f"QR code endpoint failed: {res.text}"
        assert res.headers.get('content-type') == 'image/png'
        print("QR code generated successfully for amount campaign")
    
    def test_qrcode_custom_size(self):
        """Test QR code with custom size parameter"""
        if not test_campaign_id:
            pytest.skip("No campaign created")
        
        res = requests.get(f"{BASE_URL}/api/tabung/campaigns/{test_campaign_id}/qrcode?size=500")
        assert res.status_code == 200
        assert res.headers.get('content-type') == 'image/png'
        print("QR code with custom size generated")
    
    def test_qrcode_invalid_campaign(self):
        """Test QR code for non-existent campaign"""
        res = requests.get(f"{BASE_URL}/api/tabung/campaigns/000000000000000000000000/qrcode")
        assert res.status_code == 404


class TestShareDataEndpoint:
    """Test share data endpoint for social media sharing"""
    
    def test_share_data_slot_campaign(self):
        """Test share data endpoint returns proper URLs"""
        if not test_slot_campaign_id:
            pytest.skip("No slot campaign created")
        
        res = requests.get(f"{BASE_URL}/api/tabung/campaigns/{test_slot_campaign_id}/share-data")
        assert res.status_code == 200, f"Share data failed: {res.text}"
        
        data = res.json()
        assert "campaign_id" in data
        assert "title" in data
        assert "url" in data
        assert "qr_code_url" in data
        assert "share_links" in data
        
        share_links = data["share_links"]
        assert "whatsapp" in share_links
        assert "facebook" in share_links
        assert "twitter" in share_links
        assert "telegram" in share_links
        
        # Validate URLs contain correct patterns
        assert "wa.me" in share_links["whatsapp"]
        assert "facebook.com/sharer" in share_links["facebook"]
        assert "twitter.com/intent/tweet" in share_links["twitter"]
        assert "t.me/share" in share_links["telegram"]
        
        print(f"Share data: {data['title']}, URL: {data['url']}")
    
    def test_share_data_amount_campaign(self):
        """Test share data for amount campaign"""
        if not test_campaign_id:
            pytest.skip("No amount campaign created")
        
        res = requests.get(f"{BASE_URL}/api/tabung/campaigns/{test_campaign_id}/share-data")
        assert res.status_code == 200
        data = res.json()
        assert data["campaign_id"] == test_campaign_id
    
    def test_share_data_invalid_campaign(self):
        """Test share data for non-existent campaign"""
        res = requests.get(f"{BASE_URL}/api/tabung/campaigns/000000000000000000000000/share-data")
        assert res.status_code == 404


class TestImageUploadAPI:
    """Test image upload functionality for campaigns"""
    
    def test_upload_image_success(self, admin_headers):
        """Test uploading an image to campaign"""
        if not test_campaign_id:
            pytest.skip("No campaign created")
        
        # Create a simple test image
        img = Image.new('RGB', (100, 100), color='red')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='JPEG')
        img_bytes.seek(0)
        
        files = {'file': ('test_image.jpg', img_bytes, 'image/jpeg')}
        headers = {"Authorization": admin_headers["Authorization"]}
        
        res = requests.post(
            f"{BASE_URL}/api/tabung/campaigns/{test_campaign_id}/images",
            files=files,
            headers=headers
        )
        assert res.status_code == 200, f"Image upload failed: {res.text}"
        data = res.json()
        assert data["success"] == True
        assert "image" in data
        assert "id" in data["image"]
        assert "url" in data["image"]
        print(f"Uploaded image: {data['image']['url']}")
    
    def test_upload_image_unauthorized(self, parent_headers):
        """Test image upload without admin permission fails"""
        if not test_campaign_id:
            pytest.skip("No campaign created")
        
        img = Image.new('RGB', (50, 50), color='blue')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='JPEG')
        img_bytes.seek(0)
        
        files = {'file': ('test.jpg', img_bytes, 'image/jpeg')}
        headers = {"Authorization": parent_headers["Authorization"]}
        
        res = requests.post(
            f"{BASE_URL}/api/tabung/campaigns/{test_campaign_id}/images",
            files=files,
            headers=headers
        )
        assert res.status_code == 403  # Forbidden for non-admin
    
    def test_get_campaign_with_images(self, admin_headers):
        """Test that campaign detail includes images array"""
        if not test_campaign_id:
            pytest.skip("No campaign created")
        
        res = requests.get(
            f"{BASE_URL}/api/tabung/campaigns/{test_campaign_id}",
            headers=admin_headers
        )
        assert res.status_code == 200
        data = res.json()
        assert "images" in data
        assert isinstance(data["images"], list)
        print(f"Campaign has {len(data['images'])} images")


class TestPublicDonationAPI:
    """Test public donation endpoint (no auth required)"""
    
    def test_get_public_campaign(self):
        """Test getting public campaign without auth"""
        if not test_campaign_id:
            pytest.skip("No campaign created")
        
        res = requests.get(f"{BASE_URL}/api/tabung/public/campaigns/{test_campaign_id}")
        assert res.status_code == 200, f"Public campaign fetch failed: {res.text}"
        data = res.json()
        assert data["id"] == test_campaign_id
        assert data["is_public"] == True
        print(f"Public campaign: {data['title']}")
    
    def test_public_donate_amount(self):
        """Test public donation to amount campaign"""
        if not test_campaign_id:
            pytest.skip("No campaign created")
        
        payload = {
            "campaign_id": test_campaign_id,
            "donor_name": "Public Test Donor",
            "donor_email": "public@test.com",
            "donor_phone": "0123456789",
            "amount": 50.0,
            "is_anonymous": False,
            "message": "Test public donation"
        }
        res = requests.post(f"{BASE_URL}/api/tabung/public/donate", json=payload)
        assert res.status_code == 200, f"Public donation failed: {res.text}"
        data = res.json()
        assert data["success"] == True
        assert "donation_id" in data
        assert "receipt_number" in data
        assert data["amount"] == 50.0
        print(f"Public donation success: Receipt {data['receipt_number']}")
    
    def test_public_donate_slot(self):
        """Test public donation to slot campaign"""
        if not test_slot_campaign_id:
            pytest.skip("No slot campaign created")
        
        payload = {
            "campaign_id": test_slot_campaign_id,
            "donor_name": "Slot Public Donor",
            "donor_email": "slot@test.com",
            "slots": 2,
            "is_anonymous": False,
            "message": "Test slot donation"
        }
        res = requests.post(f"{BASE_URL}/api/tabung/public/donate", json=payload)
        assert res.status_code == 200, f"Public slot donation failed: {res.text}"
        data = res.json()
        assert data["success"] == True
        assert data["slots"] == 2
        print(f"Public slot donation: {data['slots']} slots, Receipt {data['receipt_number']}")
    
    def test_public_donate_anonymous(self):
        """Test anonymous public donation"""
        if not test_campaign_id:
            pytest.skip("No campaign created")
        
        payload = {
            "campaign_id": test_campaign_id,
            "donor_name": "",
            "amount": 25.0,
            "is_anonymous": True,
            "message": "Anonymous donation"
        }
        res = requests.post(f"{BASE_URL}/api/tabung/public/donate", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] == True
        print("Anonymous public donation successful")
    
    def test_public_donate_invalid_campaign(self):
        """Test public donation to non-existent campaign"""
        payload = {
            "campaign_id": "000000000000000000000000",
            "donor_name": "Test",
            "amount": 10.0
        }
        res = requests.post(f"{BASE_URL}/api/tabung/public/donate", json=payload)
        assert res.status_code == 404
    
    def test_public_donate_below_min_amount(self):
        """Test public donation below minimum amount fails"""
        if not test_campaign_id:
            pytest.skip("No campaign created")
        
        payload = {
            "campaign_id": test_campaign_id,
            "donor_name": "Test Donor",
            "amount": 0.5  # Below minimum
        }
        res = requests.post(f"{BASE_URL}/api/tabung/public/donate", json=payload)
        assert res.status_code == 400


class TestPublicCampaignsList:
    """Test public campaigns list endpoint"""
    
    def test_get_public_campaigns(self):
        """Test getting list of public campaigns"""
        res = requests.get(f"{BASE_URL}/api/tabung/public/campaigns")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} public campaigns")
    
    def test_get_public_stats(self):
        """Test public stats endpoint"""
        res = requests.get(f"{BASE_URL}/api/tabung/public/stats")
        assert res.status_code == 200
        data = res.json()
        assert "active_campaigns" in data
        assert "total_collected" in data
        assert "total_donations" in data
        print(f"Public stats: {data['active_campaigns']} active campaigns, RM{data['total_collected']:.2f} collected")


class TestCampaignDetailFields:
    """Test campaign detail includes new fields"""
    
    def test_campaign_has_full_description(self, admin_headers):
        """Test campaign has full_description field"""
        if not test_campaign_id:
            pytest.skip("No campaign created")
        
        res = requests.get(f"{BASE_URL}/api/tabung/campaigns/{test_campaign_id}", headers=admin_headers)
        assert res.status_code == 200
        data = res.json()
        assert "full_description" in data
        assert "is_public" in data
        assert "allow_anonymous" in data
        print(f"Campaign fields verified: full_description={len(data['full_description']) if data['full_description'] else 0} chars")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_campaigns(self, admin_headers):
        """Delete test campaigns"""
        global test_campaign_id, test_slot_campaign_id
        
        if test_campaign_id:
            res = requests.delete(f"{BASE_URL}/api/tabung/campaigns/{test_campaign_id}", headers=admin_headers)
            print(f"Cleanup amount campaign: {res.status_code}")
        
        if test_slot_campaign_id:
            res = requests.delete(f"{BASE_URL}/api/tabung/campaigns/{test_slot_campaign_id}", headers=admin_headers)
            print(f"Cleanup slot campaign: {res.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
