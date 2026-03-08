"""
Test Campaign Detail Page Features
- HTML description rendering
- Image gallery with navigation
- QR Code generation and display
- Database cleanup verification
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://yuran-admin-panel.preview.emergentagent.com')


class TestCampaignDetailFeatures:
    """Test campaign detail page features"""

    def test_campaign_with_images_has_gallery(self):
        """Campaign with multiple images returns images array"""
        # Campaign 699468223811869d2fa5441b has 2 images
        response = requests.get(f"{BASE_URL}/api/tabung/public/campaigns/699468223811869d2fa5441b")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "images" in data, "Response should contain images array"
        assert len(data["images"]) == 2, f"Expected 2 images, got {len(data['images'])}"
        
        # Verify image structure
        for img in data["images"]:
            assert "id" in img, "Image should have id"
            assert "url" in img, "Image should have url"
            assert "filename" in img, "Image should have filename"
            assert img["url"].startswith("/api/tabung/images/"), f"Image URL format incorrect: {img['url']}"

    def test_campaign_html_description_stored(self):
        """Campaign with HTML description has full_description field"""
        response = requests.get(f"{BASE_URL}/api/tabung/public/campaigns/699468223811869d2fa5441b")
        assert response.status_code == 200
        
        data = response.json()
        assert "full_description" in data, "Response should contain full_description"
        
        # Verify HTML content exists
        full_desc = data["full_description"]
        assert "<p>" in full_desc, "Description should contain <p> tags"
        assert "<ul>" in full_desc, "Description should contain <ul> tags"
        assert "<li>" in full_desc, "Description should contain <li> tags"
        assert "<strong>" in full_desc or "<em>" in full_desc, "Description should contain formatting tags"

    def test_campaign_qr_code_generated(self):
        """Campaign has QR code base64 and URL"""
        # Test first campaign
        response1 = requests.get(f"{BASE_URL}/api/tabung/public/campaigns/699468223811869d2fa5441b")
        assert response1.status_code == 200
        data1 = response1.json()
        
        assert "qr_code_base64" in data1, "Response should contain qr_code_base64"
        assert "qr_code_url" in data1, "Response should contain qr_code_url"
        assert data1["qr_code_base64"] is not None, "QR code base64 should not be null"
        assert len(data1["qr_code_base64"]) > 100, "QR code base64 should be substantial"
        assert "/kempen/" in data1["qr_code_url"], "QR URL should contain /kempen/ path"
        
        # Test second campaign
        response2 = requests.get(f"{BASE_URL}/api/tabung/public/campaigns/699468293811869d2fa5441e")
        assert response2.status_code == 200
        data2 = response2.json()
        
        assert data2["qr_code_base64"] is not None, "Second campaign should also have QR code"
        assert data2["qr_code_url"] is not None, "Second campaign should have QR URL"

    def test_campaign_without_images(self):
        """Campaign without images returns empty images array"""
        response = requests.get(f"{BASE_URL}/api/tabung/public/campaigns/699468293811869d2fa5441e")
        assert response.status_code == 200
        
        data = response.json()
        assert "images" in data, "Response should contain images array"
        assert len(data["images"]) == 0, f"Expected 0 images, got {len(data['images'])}"

    def test_campaign_image_url_accessible(self):
        """Campaign images can be accessed via URL"""
        # Get campaign with images
        response = requests.get(f"{BASE_URL}/api/tabung/public/campaigns/699468223811869d2fa5441b")
        assert response.status_code == 200
        
        data = response.json()
        if data.get("images") and len(data["images"]) > 0:
            image_url = data["images"][0]["url"]
            full_url = f"{BASE_URL}{image_url}"
            
            img_response = requests.get(full_url)
            assert img_response.status_code == 200, f"Image not accessible: {full_url}"
            assert "image" in img_response.headers.get("content-type", ""), "Response should be an image"


class TestDatabaseCleanup:
    """Test that TEST data has been cleaned from database"""

    def test_no_test_donations_exist(self):
        """Verify no TEST_ prefixed donations exist in database"""
        # This requires admin access or direct DB check
        # For API testing, we check public donations list
        response = requests.get(f"{BASE_URL}/api/tabung/public/campaigns")
        assert response.status_code == 200
        
        campaigns = response.json()
        for campaign in campaigns:
            # Check recent_donors if available
            if "recent_donors" in campaign:
                for donor in campaign.get("recent_donors", []):
                    donor_name = donor.get("donor_name", "")
                    assert not donor_name.startswith("TEST_"), f"Found TEST data: {donor_name}"

    def test_donations_contain_real_data(self):
        """Verify donations are real user data, not test data"""
        response = requests.get(f"{BASE_URL}/api/tabung/public/campaigns/699468223811869d2fa5441b")
        assert response.status_code == 200
        
        data = response.json()
        recent_donations = data.get("recent_donations", [])
        
        for donation in recent_donations:
            donor_name = donation.get("donor_name", "")
            # TEST data should be cleaned
            assert not donor_name.startswith("TEST_"), f"Found TEST data in donations: {donor_name}"


class TestCampaignStructure:
    """Test campaign data structure for detail page"""

    def test_campaign_has_required_fields(self):
        """Campaign response has all required fields for detail page"""
        response = requests.get(f"{BASE_URL}/api/tabung/public/campaigns/699468223811869d2fa5441b")
        assert response.status_code == 200
        
        data = response.json()
        
        required_fields = [
            "id", "title", "description", "full_description",
            "image_url", "images", "campaign_type", "status",
            "donor_count", "is_public", "qr_code_base64", "qr_code_url"
        ]
        
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"

    def test_slot_campaign_fields(self):
        """Slot-based campaign has slot-specific fields"""
        response = requests.get(f"{BASE_URL}/api/tabung/public/campaigns/699468223811869d2fa5441b")
        assert response.status_code == 200
        
        data = response.json()
        assert data["campaign_type"] == "slot"
        
        slot_fields = ["total_slots", "slots_sold", "slots_available", "price_per_slot"]
        for field in slot_fields:
            assert field in data, f"Missing slot field: {field}"
        
        assert data["total_slots"] > 0, "total_slots should be positive"
        assert data["price_per_slot"] > 0, "price_per_slot should be positive"

    def test_amount_campaign_fields(self):
        """Amount-based campaign has amount-specific fields"""
        response = requests.get(f"{BASE_URL}/api/tabung/public/campaigns/699468293811869d2fa5441e")
        assert response.status_code == 200
        
        data = response.json()
        assert data["campaign_type"] == "amount"
        
        amount_fields = ["target_amount", "collected_amount", "min_amount", "max_amount"]
        for field in amount_fields:
            assert field in data, f"Missing amount field: {field}"
        
        assert data["target_amount"] > 0, "target_amount should be positive"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
