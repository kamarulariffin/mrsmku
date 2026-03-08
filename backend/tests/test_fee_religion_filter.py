"""
Test: Fee Item Religion Filter Feature
- Tests that ALL fee items are returned including non-applicable ones
- Tests islam_only flag is correctly set
- Tests applicable flag is correctly set based on student religion
- Tests non-Muslim students see Islam-only items as not_applicable
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestFeeReligionFilter:
    """Tests for fee items with religion-based filtering"""
    
    @pytest.fixture(scope="class")
    def muslim_parent_token(self):
        """Get token for parent with Muslim child"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "parent@muafakat.link",
            "password": "parent123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def non_muslim_parent_token(self):
        """Get token for parent with non-Muslim child (Buddha)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "parent4@muafakat.link",
            "password": "parent123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json().get("access_token")
    
    def test_pending_items_returns_all_items(self, non_muslim_parent_token):
        """Test that API returns ALL fee items including non-applicable ones"""
        headers = {"Authorization": f"Bearer {non_muslim_parent_token}"}
        response = requests.get(f"{BASE_URL}/api/payment-center/pending-items", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Should have yuran_detailed with items
        assert "yuran_detailed" in data
        assert len(data["yuran_detailed"]) > 0
        
        # Find Goh Wei Liang (Buddha student)
        goh_yuran = None
        for yuran in data["yuran_detailed"]:
            if "Goh Wei Liang" in yuran.get("student_name", ""):
                goh_yuran = yuran
                break
        
        assert goh_yuran is not None, "Goh Wei Liang yuran not found"
        
        # Should have items array
        items = goh_yuran.get("items", [])
        assert len(items) > 0, "No items found for Goh Wei Liang"
        
        # Verify Kelas Al-Quran exists (even though not applicable)
        kelas_alquran = None
        for item in items:
            if "Al-Quran" in item.get("name", ""):
                kelas_alquran = item
                break
        
        assert kelas_alquran is not None, "Kelas Al-Quran should be in items list even for non-Muslim"
        print(f"✓ Kelas Al-Quran found for non-Muslim student")
    
    def test_non_muslim_sees_islam_only_as_not_applicable(self, non_muslim_parent_token):
        """Test that non-Muslim student has islam_only items marked as not_applicable"""
        headers = {"Authorization": f"Bearer {non_muslim_parent_token}"}
        response = requests.get(f"{BASE_URL}/api/payment-center/pending-items", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Find Goh Wei Liang (Buddha student)
        goh_yuran = None
        for yuran in data["yuran_detailed"]:
            if "Goh Wei Liang" in yuran.get("student_name", ""):
                goh_yuran = yuran
                break
        
        assert goh_yuran is not None
        
        # Verify student religion
        assert goh_yuran.get("student_religion") == "Buddha", "Student religion should be Buddha"
        print(f"✓ Student religion correctly set to Buddha")
        
        # Find Kelas Al-Quran
        items = goh_yuran.get("items", [])
        kelas_alquran = None
        for item in items:
            if "Al-Quran" in item.get("name", ""):
                kelas_alquran = item
                break
        
        assert kelas_alquran is not None
        
        # Verify islam_only flag
        assert kelas_alquran.get("islam_only") == True, "Kelas Al-Quran should have islam_only=True"
        print(f"✓ Kelas Al-Quran has islam_only=True")
        
        # Verify applicable flag
        assert kelas_alquran.get("applicable") == False, "Kelas Al-Quran should be applicable=False for Buddhist"
        print(f"✓ Kelas Al-Quran has applicable=False for Buddhist student")
        
        # Verify status
        assert kelas_alquran.get("status") == "not_applicable", "Status should be 'not_applicable'"
        print(f"✓ Kelas Al-Quran has status='not_applicable'")
    
    def test_muslim_sees_all_items_applicable(self, muslim_parent_token):
        """Test that Muslim student has all religion-specific items as applicable"""
        headers = {"Authorization": f"Bearer {muslim_parent_token}"}
        response = requests.get(f"{BASE_URL}/api/payment-center/pending-items", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Find Muslim student
        muslim_yuran = None
        for yuran in data["yuran_detailed"]:
            if yuran.get("student_religion") == "Islam":
                muslim_yuran = yuran
                break
        
        assert muslim_yuran is not None, "No Muslim student found"
        print(f"✓ Found Muslim student: {muslim_yuran.get('student_name')}")
        
        # Verify no items are marked as not_applicable
        items = muslim_yuran.get("items", [])
        not_applicable_items = [i for i in items if i.get("applicable") == False]
        
        assert len(not_applicable_items) == 0, f"Muslim student should not have not_applicable items: {not_applicable_items}"
        print(f"✓ Muslim student has 0 not_applicable items")
        
        # Find Kelas Al-Quran - should be applicable for Muslim
        kelas_alquran = None
        for item in items:
            if "Al-Quran" in item.get("name", ""):
                kelas_alquran = item
                break
        
        if kelas_alquran:
            assert kelas_alquran.get("applicable") == True, "Kelas Al-Quran should be applicable for Muslim"
            assert kelas_alquran.get("islam_only") == True, "Kelas Al-Quran should have islam_only=True"
            print(f"✓ Kelas Al-Quran is applicable for Muslim student")
    
    def test_item_has_required_fields(self, non_muslim_parent_token):
        """Test that items have all required fields for frontend display"""
        headers = {"Authorization": f"Bearer {non_muslim_parent_token}"}
        response = requests.get(f"{BASE_URL}/api/payment-center/pending-items", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Get first yuran with items
        yuran = data["yuran_detailed"][0]
        items = yuran.get("items", [])
        
        assert len(items) > 0
        
        # Check required fields for frontend
        required_fields = ["code", "name", "amount", "islam_only", "applicable", "status"]
        
        for item in items[:3]:  # Check first 3 items
            for field in required_fields:
                assert field in item, f"Missing field '{field}' in item: {item.get('name')}"
        
        print(f"✓ All items have required fields: {required_fields}")
    
    def test_student_religion_in_yuran_detailed(self, non_muslim_parent_token):
        """Test that student_religion is included in yuran_detailed response"""
        headers = {"Authorization": f"Bearer {non_muslim_parent_token}"}
        response = requests.get(f"{BASE_URL}/api/payment-center/pending-items", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        for yuran in data["yuran_detailed"]:
            assert "student_religion" in yuran, "student_religion should be in yuran_detailed"
            assert yuran["student_religion"] is not None, "student_religion should not be None"
        
        print(f"✓ All yuran_detailed entries have student_religion field")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
