"""
Test suite for paginated students endpoints
Tests:
- /api/students-paginated/all (new paginated endpoint)
- /api/students-paginated/stats/summary (statistics endpoint)
- /api/admin/students (existing endpoint - should still work)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from review request
SUPERADMIN = {"email": "superadmin@muafakat.link", "password": "admin123"}
BENDAHARI = {"email": "bendahari@muafakat.link", "password": "bendahari123"}


class TestStudentsPaginated:
    """Tests for the new /api/students-paginated endpoints"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

    def get_auth_token(self, email: str, password: str) -> str:
        """Get authentication token for a user"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        return None

    def test_01_superadmin_login(self):
        """Test superadmin can login"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=SUPERADMIN)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "superadmin"
        print("✓ Superadmin login successful")

    def test_02_bendahari_login(self):
        """Test bendahari can login"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=BENDAHARI)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "bendahari"
        print("✓ Bendahari login successful")

    def test_03_paginated_students_basic(self):
        """Test /api/students-paginated/all returns paginated results"""
        token = self.get_auth_token(SUPERADMIN["email"], SUPERADMIN["password"])
        assert token, "Failed to get auth token"

        headers = {"Authorization": f"Bearer {token}"}
        response = self.session.get(f"{BASE_URL}/api/students-paginated/all", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Check response structure
        assert "students" in data, "Missing 'students' in response"
        assert "pagination" in data, "Missing 'pagination' in response"
        
        # Check pagination structure
        pagination = data["pagination"]
        assert "page" in pagination, "Missing 'page' in pagination"
        assert "limit" in pagination, "Missing 'limit' in pagination"
        assert "total" in pagination, "Missing 'total' in pagination"
        assert "total_pages" in pagination, "Missing 'total_pages' in pagination"
        assert "has_next" in pagination, "Missing 'has_next' in pagination"
        assert "has_prev" in pagination, "Missing 'has_prev' in pagination"
        
        print(f"✓ Paginated students returned {len(data['students'])} students")
        print(f"  Total: {pagination['total']}, Pages: {pagination['total_pages']}")

    def test_04_paginated_students_with_limit(self):
        """Test pagination with specific limit"""
        token = self.get_auth_token(SUPERADMIN["email"], SUPERADMIN["password"])
        assert token, "Failed to get auth token"

        headers = {"Authorization": f"Bearer {token}"}
        
        # Request with limit=5
        response = self.session.get(
            f"{BASE_URL}/api/students-paginated/all?limit=5",
            headers=headers
        )
        
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Check limit is applied
        assert data["pagination"]["limit"] == 5, "Limit not applied correctly"
        assert len(data["students"]) <= 5, "More students returned than limit"
        
        print(f"✓ Limit parameter works: returned {len(data['students'])} students (limit=5)")

    def test_05_paginated_students_page_navigation(self):
        """Test page navigation"""
        token = self.get_auth_token(SUPERADMIN["email"], SUPERADMIN["password"])
        assert token, "Failed to get auth token"

        headers = {"Authorization": f"Bearer {token}"}
        
        # Get first page
        response1 = self.session.get(
            f"{BASE_URL}/api/students-paginated/all?page=1&limit=2",
            headers=headers
        )
        assert response1.status_code == 200
        data1 = response1.json()
        
        # Get second page
        response2 = self.session.get(
            f"{BASE_URL}/api/students-paginated/all?page=2&limit=2",
            headers=headers
        )
        assert response2.status_code == 200
        data2 = response2.json()
        
        # Verify pagination info
        assert data1["pagination"]["page"] == 1, "Page 1 not returned correctly"
        assert data2["pagination"]["page"] == 2, "Page 2 not returned correctly"
        assert data1["pagination"]["has_prev"] == False, "Page 1 should not have prev"
        
        if data1["pagination"]["total"] > 2:
            assert data1["pagination"]["has_next"] == True, "Page 1 should have next"
        
        print("✓ Page navigation works correctly")

    def test_06_paginated_students_search(self):
        """Test search parameter"""
        token = self.get_auth_token(SUPERADMIN["email"], SUPERADMIN["password"])
        assert token, "Failed to get auth token"

        headers = {"Authorization": f"Bearer {token}"}
        
        # Search for "Ahmad" (common name in test data)
        response = self.session.get(
            f"{BASE_URL}/api/students-paginated/all?search=Ahmad",
            headers=headers
        )
        
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Search should work (may or may not return results depending on data)
        assert "students" in data
        assert "pagination" in data
        
        print(f"✓ Search works: found {len(data['students'])} students matching 'Ahmad'")

    def test_07_paginated_students_filter_by_form(self):
        """Test filter by form (tingkatan)"""
        token = self.get_auth_token(SUPERADMIN["email"], SUPERADMIN["password"])
        assert token, "Failed to get auth token"

        headers = {"Authorization": f"Bearer {token}"}
        
        # Filter by form=4
        response = self.session.get(
            f"{BASE_URL}/api/students-paginated/all?form=4",
            headers=headers
        )
        
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Check all returned students are form 4
        for student in data["students"]:
            assert student["form"] == 4, f"Student {student['full_name']} is form {student['form']}, not 4"
        
        print(f"✓ Form filter works: {len(data['students'])} students in form 4")

    def test_08_paginated_students_filter_by_status(self):
        """Test filter by status"""
        token = self.get_auth_token(SUPERADMIN["email"], SUPERADMIN["password"])
        assert token, "Failed to get auth token"

        headers = {"Authorization": f"Bearer {token}"}
        
        # Filter by approved status
        response = self.session.get(
            f"{BASE_URL}/api/students-paginated/all?status=approved",
            headers=headers
        )
        
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Check all returned students are approved
        for student in data["students"]:
            assert student["status"] == "approved", f"Student {student['full_name']} is {student['status']}"
        
        print(f"✓ Status filter works: {len(data['students'])} approved students")

    def test_09_paginated_students_filter_by_class(self):
        """Test filter by class_name"""
        token = self.get_auth_token(SUPERADMIN["email"], SUPERADMIN["password"])
        assert token, "Failed to get auth token"

        headers = {"Authorization": f"Bearer {token}"}
        
        # Filter by class A
        response = self.session.get(
            f"{BASE_URL}/api/students-paginated/all?class_name=A",
            headers=headers
        )
        
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Check all returned students are in class A
        for student in data["students"]:
            assert student["class_name"] == "A", f"Student {student['full_name']} is in class {student['class_name']}"
        
        print(f"✓ Class filter works: {len(data['students'])} students in class A")

    def test_10_stats_summary_endpoint(self):
        """Test /api/students-paginated/stats/summary endpoint"""
        token = self.get_auth_token(SUPERADMIN["email"], SUPERADMIN["password"])
        assert token, "Failed to get auth token"

        headers = {"Authorization": f"Bearer {token}"}
        response = self.session.get(
            f"{BASE_URL}/api/students-paginated/stats/summary",
            headers=headers
        )
        
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Check response structure
        assert "total" in data, "Missing 'total' in stats"
        assert "approved" in data, "Missing 'approved' in stats"
        assert "pending" in data, "Missing 'pending' in stats"
        assert "rejected" in data, "Missing 'rejected' in stats"
        assert "by_form" in data, "Missing 'by_form' in stats"
        assert "by_class" in data, "Missing 'by_class' in stats"
        
        # Validate data types
        assert isinstance(data["total"], int), "total should be int"
        assert isinstance(data["approved"], int), "approved should be int"
        assert isinstance(data["pending"], int), "pending should be int"
        assert isinstance(data["rejected"], int), "rejected should be int"
        assert isinstance(data["by_form"], dict), "by_form should be dict"
        assert isinstance(data["by_class"], dict), "by_class should be dict"
        
        print(f"✓ Stats summary works:")
        print(f"  Total: {data['total']}, Approved: {data['approved']}, Pending: {data['pending']}")

    def test_11_existing_admin_students_still_works(self):
        """Test existing /api/admin/students endpoint still works"""
        token = self.get_auth_token(SUPERADMIN["email"], SUPERADMIN["password"])
        assert token, "Failed to get auth token"

        headers = {"Authorization": f"Bearer {token}"}
        response = self.session.get(f"{BASE_URL}/api/admin/students", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Check response structure (same as before)
        assert "students" in data, "Missing 'students' in response"
        assert "pagination" in data, "Missing 'pagination' in response"
        
        print(f"✓ Existing /api/admin/students still works: {len(data['students'])} students")

    def test_12_bendahari_can_access_paginated_students(self):
        """Test bendahari role can access paginated students"""
        token = self.get_auth_token(BENDAHARI["email"], BENDAHARI["password"])
        assert token, "Failed to get bendahari token"

        headers = {"Authorization": f"Bearer {token}"}
        response = self.session.get(f"{BASE_URL}/api/students-paginated/all", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        data = response.json()
        
        assert "students" in data
        assert "pagination" in data
        
        print(f"✓ Bendahari can access paginated students: {len(data['students'])} students")

    def test_13_bendahari_can_access_admin_students(self):
        """Test bendahari role can access admin students endpoint"""
        token = self.get_auth_token(BENDAHARI["email"], BENDAHARI["password"])
        assert token, "Failed to get bendahari token"

        headers = {"Authorization": f"Bearer {token}"}
        response = self.session.get(f"{BASE_URL}/api/admin/students", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        data = response.json()
        
        assert "students" in data
        
        print(f"✓ Bendahari can access /api/admin/students: {len(data['students'])} students")

    def test_14_combined_filters(self):
        """Test combining multiple filters"""
        token = self.get_auth_token(SUPERADMIN["email"], SUPERADMIN["password"])
        assert token, "Failed to get auth token"

        headers = {"Authorization": f"Bearer {token}"}
        
        # Combine status and form filters
        response = self.session.get(
            f"{BASE_URL}/api/students-paginated/all?status=approved&form=4&limit=10",
            headers=headers
        )
        
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Verify filters applied
        for student in data["students"]:
            assert student["status"] == "approved", f"Status mismatch"
            assert student["form"] == 4, f"Form mismatch"
        
        print(f"✓ Combined filters work: {len(data['students'])} approved students in form 4")

    def test_15_invalid_page_number(self):
        """Test invalid page number handling"""
        token = self.get_auth_token(SUPERADMIN["email"], SUPERADMIN["password"])
        assert token, "Failed to get auth token"

        headers = {"Authorization": f"Bearer {token}"}
        
        # Request with page=0 (invalid)
        response = self.session.get(
            f"{BASE_URL}/api/students-paginated/all?page=0",
            headers=headers
        )
        
        # Should return 422 (Validation Error) since page must be >= 1
        assert response.status_code == 422, f"Expected 422 for page=0, got {response.status_code}"
        
        print("✓ Invalid page number (0) correctly rejected")

    def test_16_limit_boundary(self):
        """Test limit boundary (max 100)"""
        token = self.get_auth_token(SUPERADMIN["email"], SUPERADMIN["password"])
        assert token, "Failed to get auth token"

        headers = {"Authorization": f"Bearer {token}"}
        
        # Request with limit=101 (over max)
        response = self.session.get(
            f"{BASE_URL}/api/students-paginated/all?limit=101",
            headers=headers
        )
        
        # Should return 422 (Validation Error) since limit max is 100
        assert response.status_code == 422, f"Expected 422 for limit=101, got {response.status_code}"
        
        print("✓ Limit boundary (101) correctly rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
