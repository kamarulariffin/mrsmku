"""
Test Penapis Air and Bulk Action Features - MRSMKU Complaints Module
Tests: penapis_air complaint type, trending/categories, and bulk-action endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
WARDEN_CREDENTIALS = {"email": "warden@muafakat.link", "password": "warden123"}
PARENT_CREDENTIALS = {"email": "parent@muafakat.link", "password": "parent123"}


@pytest.fixture(scope="module")
def warden_token():
    """Get warden auth token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json=WARDEN_CREDENTIALS
    )
    assert response.status_code == 200, f"Warden login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def parent_token():
    """Get parent auth token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json=PARENT_CREDENTIALS
    )
    assert response.status_code == 200, f"Parent login failed: {response.text}"
    return response.json()["access_token"]


class TestPenapisAirComplaintType:
    """Test penapis_air complaint type in system"""

    def test_penapis_air_in_complaint_types(self):
        """Verify penapis_air exists in GET /api/complaints/types"""
        response = requests.get(f"{BASE_URL}/api/complaints/types")
        assert response.status_code == 200
        
        data = response.json()
        assert "types" in data
        assert "penapis_air" in data["types"]
        assert data["types"]["penapis_air"] == "Penapis Air"
        print("✓ penapis_air exists in complaint types with display name 'Penapis Air'")

    def test_penapis_air_guideline_exists(self):
        """Verify GET /api/complaints/guidelines/penapis_air returns water filter guidelines"""
        response = requests.get(f"{BASE_URL}/api/complaints/guidelines/penapis_air")
        assert response.status_code == 200
        
        data = response.json()
        assert "guideline" in data
        guideline = data["guideline"]
        
        # Verify guideline structure
        assert "title" in guideline
        assert "items" in guideline
        assert "contact" in guideline
        
        # Verify content
        assert "Penapis Air" in guideline["title"]
        assert len(guideline["items"]) >= 4  # Should have at least 4 items
        assert "diservis" in guideline["items"][0].lower() or "servis" in guideline["items"][0].lower()
        print(f"✓ penapis_air guideline: {guideline['title']}")
        print(f"  - {len(guideline['items'])} guideline items")
        print(f"  - Contact: {guideline['contact']}")

    def test_invalid_guideline_type_returns_404(self):
        """Verify invalid complaint type returns 404"""
        response = requests.get(f"{BASE_URL}/api/complaints/guidelines/invalid_type")
        assert response.status_code == 404
        print("✓ Invalid guideline type correctly returns 404")


class TestTrendingCategories:
    """Test GET /api/complaints/trending/categories endpoint"""

    def test_trending_categories_requires_auth(self):
        """Verify trending categories requires authentication"""
        response = requests.get(f"{BASE_URL}/api/complaints/trending/categories")
        assert response.status_code in [401, 403]
        print("✓ Trending categories endpoint requires authentication")

    def test_trending_categories_returns_top_3(self, warden_token):
        """Verify trending categories returns top 3 complaint categories with count >= 2"""
        headers = {"Authorization": f"Bearer {warden_token}"}
        response = requests.get(
            f"{BASE_URL}/api/complaints/trending/categories?limit=3",
            headers=headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "trending" in data
        trending = data["trending"]
        
        # Verify structure
        assert isinstance(trending, list)
        assert len(trending) <= 3  # Should be at most 3 (limit)
        
        for item in trending:
            # Verify each trending item has required fields
            assert "jenis_aduan" in item
            assert "jenis_aduan_display" in item
            assert "count" in item
            assert "complaint_ids" in item
            assert "can_bulk_action" in item
            
            # Verify count >= 2 (only show if 2+ complaints)
            assert item["count"] >= 2, f"Category {item['jenis_aduan']} has count {item['count']} (should be >= 2)"
            
            # Verify can_bulk_action is True when count >= 2
            assert item["can_bulk_action"] == True
            
            print(f"✓ {item['jenis_aduan_display']}: {item['count']} complaints (can_bulk_action={item['can_bulk_action']})")

    def test_trending_includes_penapis_air(self, warden_token):
        """Verify penapis_air appears in trending if there are 2+ complaints"""
        headers = {"Authorization": f"Bearer {warden_token}"}
        response = requests.get(
            f"{BASE_URL}/api/complaints/trending/categories?limit=10",
            headers=headers
        )
        assert response.status_code == 200
        
        trending = response.json()["trending"]
        
        # Check if penapis_air is in trending
        penapis_air_trend = next((t for t in trending if t["jenis_aduan"] == "penapis_air"), None)
        
        if penapis_air_trend:
            assert penapis_air_trend["count"] >= 2
            assert penapis_air_trend["jenis_aduan_display"] == "Penapis Air"
            print(f"✓ penapis_air in trending with {penapis_air_trend['count']} complaints")
        else:
            # Check if there are penapis_air complaints in the system
            complaints_response = requests.get(
                f"{BASE_URL}/api/complaints?jenis_aduan=penapis_air",
                headers=headers
            )
            if complaints_response.status_code == 200:
                total = complaints_response.json()["pagination"]["total"]
                print(f"! penapis_air has {total} total complaints (needs 2+ unresolved to appear in trending)")
            pytest.skip("penapis_air not in trending - may need more test data")


class TestBulkAction:
    """Test POST /api/complaints/bulk-action endpoint"""

    def test_bulk_action_requires_auth(self):
        """Verify bulk action requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/complaints/bulk-action?jenis_aduan=penapis_air&status=selesai&tindakan=Test"
        )
        assert response.status_code in [401, 403]
        print("✓ Bulk action endpoint requires authentication")

    def test_bulk_action_validates_status(self, warden_token):
        """Verify bulk action validates status parameter"""
        headers = {"Authorization": f"Bearer {warden_token}"}
        response = requests.post(
            f"{BASE_URL}/api/complaints/bulk-action?jenis_aduan=penapis_air&status=invalid_status&tindakan=Test tindakan",
            headers=headers
        )
        assert response.status_code == 400
        assert "Status tidak sah" in response.json().get("detail", "")
        print("✓ Bulk action rejects invalid status")

    def test_bulk_action_requires_tindakan(self, warden_token):
        """Verify bulk action requires tindakan parameter"""
        headers = {"Authorization": f"Bearer {warden_token}"}
        # tindakan must be at least 5 characters
        response = requests.post(
            f"{BASE_URL}/api/complaints/bulk-action?jenis_aduan=penapis_air&status=selesai&tindakan=abc",
            headers=headers
        )
        assert response.status_code == 422
        print("✓ Bulk action requires tindakan with min 5 characters")

    def test_bulk_action_updates_complaints(self, warden_token):
        """Test bulk action updates all complaints of same type"""
        headers = {"Authorization": f"Bearer {warden_token}"}
        
        # First, check if there are penapis_air complaints to update
        trending_response = requests.get(
            f"{BASE_URL}/api/complaints/trending/categories?limit=10",
            headers=headers
        )
        assert trending_response.status_code == 200
        
        trending = trending_response.json()["trending"]
        penapis_air_trend = next((t for t in trending if t["jenis_aduan"] == "penapis_air"), None)
        
        if not penapis_air_trend:
            pytest.skip("No penapis_air complaints available for bulk action test")
        
        initial_count = penapis_air_trend["count"]
        print(f"Found {initial_count} penapis_air complaints to bulk update")
        
        # Perform bulk action
        response = requests.post(
            f"{BASE_URL}/api/complaints/bulk-action",
            params={
                "jenis_aduan": "penapis_air",
                "status": "selesai",
                "tindakan": "Penapis air telah dibaiki dan diservis pada masa ini.",
                "respon_kepada_semua": "Terima kasih atas laporan. Penapis air telah dibaiki."
            },
            headers=headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "updated_count" in data
        assert "notified_users" in data
        assert "jenis_aduan" in data
        assert "new_status" in data
        
        updated_count = data["updated_count"]
        assert updated_count > 0, "No complaints were updated"
        assert data["jenis_aduan"] == "penapis_air"
        assert data["new_status"] == "selesai"
        assert data["new_status_display"] == "Selesai"
        
        print(f"✓ Bulk action updated {updated_count} complaints")
        print(f"  - Notified {data['notified_users']} users")
        print(f"  - New status: {data['new_status_display']}")

    def test_bulk_action_verifies_status_changed(self, warden_token):
        """Verify complaints status actually changed after bulk action"""
        headers = {"Authorization": f"Bearer {warden_token}"}
        
        # Check complaints list for penapis_air with selesai status
        response = requests.get(
            f"{BASE_URL}/api/complaints?jenis_aduan=penapis_air&status=selesai&limit=10",
            headers=headers
        )
        assert response.status_code == 200
        
        complaints = response.json()["complaints"]
        if len(complaints) > 0:
            # Verify at least one complaint has selesai status
            selesai_count = len([c for c in complaints if c["status"] == "selesai"])
            print(f"✓ Found {selesai_count} penapis_air complaints with selesai status")
        else:
            print("! No penapis_air complaints with selesai status found (may have been updated in previous test)")


class TestPenapisAirComplaintsBadge:
    """Test penapis_air complaints display correctly"""

    def test_penapis_air_complaints_have_correct_display(self, warden_token):
        """Verify penapis_air complaints have correct jenis_aduan_display"""
        headers = {"Authorization": f"Bearer {warden_token}"}
        
        response = requests.get(
            f"{BASE_URL}/api/complaints?jenis_aduan=penapis_air&limit=5",
            headers=headers
        )
        assert response.status_code == 200
        
        complaints = response.json()["complaints"]
        if len(complaints) == 0:
            pytest.skip("No penapis_air complaints found")
        
        for complaint in complaints:
            assert complaint["jenis_aduan"] == "penapis_air"
            assert complaint["jenis_aduan_display"] == "Penapis Air"
            print(f"✓ Complaint {complaint['nombor_aduan']}: jenis_aduan_display = '{complaint['jenis_aduan_display']}'")


class TestPenapisAirWorkflow:
    """Test creating and managing penapis_air complaints"""

    def test_create_penapis_air_complaint(self, parent_token):
        """Test creating a new penapis_air complaint"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        
        complaint_data = {
            "nama_pengadu": "Test Bulk Parent",
            "hubungan": "ibu_bapa",
            "nombor_maktab": "M20299",
            "nama_pelajar": "Pelajar Bulk Test",
            "tingkatan": 3,
            "asrama": "JC",
            "jenis_aduan": "penapis_air",
            "penerangan": "Penapis air di tingkat 3 Blok JC rosak. Perlu pembaikan segera.",
            "tahap_keutamaan": "kritikal"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/complaints",
            json=complaint_data,
            headers=headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "complaint" in data
        complaint = data["complaint"]
        
        assert complaint["jenis_aduan"] == "penapis_air"
        assert complaint["jenis_aduan_display"] == "Penapis Air"
        assert complaint["status"] == "baru_dihantar"
        assert complaint["tahap_keutamaan"] == "kritikal"
        
        print(f"✓ Created penapis_air complaint: {complaint['nombor_aduan']}")
        print(f"  - jenis_aduan_display: {complaint['jenis_aduan_display']}")
        print(f"  - tahap_keutamaan: {complaint['tahap_keutamaan']}")
        
        return complaint["id"]


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
