"""
Test Suite: Data Synchronization and Student Religion Features
Tests:
- GET /api/admin/sync/status - Check sync status
- POST /api/admin/sync/students - Run sync if needed  
- PUT /api/students/{id} - Update student with religion field
- GET /api/admin/religions - Get list of religions
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://yuran-admin-panel.preview.emergentagent.com").rstrip("/")

# Test credentials
ADMIN_CREDENTIALS = {"email": "admin@muafakat.link", "password": "admin123"}
SUPERADMIN_CREDENTIALS = {"email": "superadmin@muafakat.link", "password": "super123"}


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Admin login failed: {response.status_code}")


@pytest.fixture(scope="module")
def superadmin_token():
    """Get superadmin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERADMIN_CREDENTIALS)
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Superadmin login failed: {response.status_code}")


@pytest.fixture
def admin_headers(admin_token):
    """Get admin headers"""
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture
def superadmin_headers(superadmin_token):
    """Get superadmin headers"""
    return {"Authorization": f"Bearer {superadmin_token}", "Content-Type": "application/json"}


class TestSyncStatus:
    """Tests for GET /api/admin/sync/status endpoint"""

    def test_sync_status_as_admin(self, admin_headers):
        """Admin should be able to get sync status"""
        response = requests.get(f"{BASE_URL}/api/admin/sync/status", headers=admin_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "summary" in data, "Response should have 'summary' field"
        assert "issues" in data, "Response should have 'issues' field"
        assert "sync_needed" in data, "Response should have 'sync_needed' field"
        
        # Verify summary fields
        summary = data["summary"]
        assert "total_users" in summary
        assert "pelajar_users" in summary
        assert "parent_users" in summary
        assert "total_students" in summary
        
        # Verify issues fields
        issues = data["issues"]
        assert "students_without_user_account" in issues
        assert "students_without_religion" in issues
        assert "pelajar_users_without_religion" in issues
        
        print(f"Sync status: {data}")

    def test_sync_status_as_superadmin(self, superadmin_headers):
        """Superadmin should be able to get sync status"""
        response = requests.get(f"{BASE_URL}/api/admin/sync/status", headers=superadmin_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "summary" in data
        assert "sync_needed" in data
        print(f"Superadmin sync check: total_students={data['summary']['total_students']}")

    def test_sync_status_unauthenticated(self):
        """Unauthenticated users should be denied"""
        response = requests.get(f"{BASE_URL}/api/admin/sync/status")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


class TestSyncStudents:
    """Tests for POST /api/admin/sync/students endpoint"""

    def test_sync_students_as_admin(self, admin_headers):
        """Admin should be able to trigger sync"""
        response = requests.post(f"{BASE_URL}/api/admin/sync/students", headers=admin_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "message" in data, "Response should have 'message' field"
        assert "results" in data, "Response should have 'results' field"
        
        # Verify results structure
        results = data["results"]
        assert "users_created" in results
        assert "religion_updated" in results
        assert "errors" in results
        
        print(f"Sync results: {results}")

    def test_sync_students_as_superadmin(self, superadmin_headers):
        """Superadmin should be able to trigger sync"""
        response = requests.post(f"{BASE_URL}/api/admin/sync/students", headers=superadmin_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "message" in data
        assert "results" in data
        print(f"Superadmin sync triggered successfully")

    def test_sync_students_unauthenticated(self):
        """Unauthenticated users should be denied"""
        response = requests.post(f"{BASE_URL}/api/admin/sync/students")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


class TestReligions:
    """Tests for GET /api/admin/religions endpoint"""

    def test_get_religions_list(self):
        """Get list of available religions (public endpoint)"""
        response = requests.get(f"{BASE_URL}/api/admin/religions")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "options" in data, "Response should have 'options' field"
        options = data["options"]
        
        # Verify expected religions are present
        expected_religions = ["Islam", "Buddha", "Hindu", "Kristian"]
        for religion in expected_religions:
            assert religion in options, f"{religion} should be in options list"
        
        print(f"Available religions: {options}")


class TestUpdateStudentReligion:
    """Tests for PUT /api/students/{id} endpoint with religion field"""

    @pytest.fixture
    def sample_student_id(self, admin_headers):
        """Get a sample student ID for testing"""
        response = requests.get(f"{BASE_URL}/api/admin/students?limit=1", headers=admin_headers)
        if response.status_code == 200:
            students = response.json().get("students", [])
            if students:
                return students[0]["id"]
        pytest.skip("No students found for testing")

    def test_update_student_religion(self, admin_headers, sample_student_id):
        """Admin should be able to update student religion"""
        # Get current student data first
        response = requests.get(f"{BASE_URL}/api/admin/students?limit=100", headers=admin_headers)
        students = response.json().get("students", [])
        student = next((s for s in students if s["id"] == sample_student_id), None)
        
        if not student:
            pytest.skip("Could not find student")
        
        original_religion = student.get("religion", "Islam")
        new_religion = "Buddha" if original_religion != "Buddha" else "Hindu"
        
        # Update religion
        update_response = requests.put(
            f"{BASE_URL}/api/students/{sample_student_id}",
            headers=admin_headers,
            json={"religion": new_religion}
        )
        
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}: {update_response.text}"
        updated = update_response.json()
        assert updated.get("religion") == new_religion, f"Religion should be updated to {new_religion}"
        
        # Revert back to original
        requests.put(
            f"{BASE_URL}/api/students/{sample_student_id}",
            headers=admin_headers,
            json={"religion": original_religion}
        )
        print(f"Successfully updated student religion from {original_religion} to {new_religion} and back")

    def test_update_student_multiple_fields(self, admin_headers, sample_student_id):
        """Update multiple fields including religion"""
        update_data = {
            "religion": "Islam",
            "phone": "0123456789",
            "state": "Selangor"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/students/{sample_student_id}",
            headers=admin_headers,
            json=update_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        updated = response.json()
        assert updated.get("religion") == "Islam"
        print(f"Multiple fields updated: religion={updated.get('religion')}, state={updated.get('state')}")

    def test_update_nonexistent_student(self, admin_headers):
        """Update non-existent student should return 404"""
        fake_id = "000000000000000000000000"
        response = requests.put(
            f"{BASE_URL}/api/students/{fake_id}",
            headers=admin_headers,
            json={"religion": "Islam"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestAdminStudentsList:
    """Tests for GET /api/admin/students endpoint - verify religion field"""

    def test_students_list_includes_religion(self, admin_headers):
        """Students list should include religion field"""
        response = requests.get(f"{BASE_URL}/api/admin/students?limit=10", headers=admin_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "students" in data, "Response should have 'students' field"
        students = data["students"]
        
        if students:
            # Check first student has religion field
            first_student = students[0]
            assert "religion" in first_student, "Student should have 'religion' field"
            print(f"First student: {first_student.get('full_name')} - Religion: {first_student.get('religion')}")
        else:
            print("No students found in database")

    def test_students_pagination(self, admin_headers):
        """Test pagination works correctly"""
        response = requests.get(f"{BASE_URL}/api/admin/students?page=1&limit=5", headers=admin_headers)
        
        assert response.status_code == 200
        data = response.json()
        
        assert "pagination" in data
        pagination = data["pagination"]
        assert "page" in pagination
        assert "total" in pagination
        print(f"Pagination: page={pagination['page']}, total={pagination['total']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
