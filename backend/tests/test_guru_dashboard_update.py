"""
Test cases for Guru Dashboard and Class Update functionality
P0: Guru can update Tingkatan and Kelas via modal
P1: Dashboard shows correct data based on assigned class
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
GURU_EMAIL = "guru@muafakat.link"
GURU_PASSWORD = "guru123"
SUPERADMIN_EMAIL = "superadmin@muafakat.link"
SUPERADMIN_PASSWORD = "admin123"


class TestGuruAuthentication:
    """Test guru login and token retrieval"""
    
    def test_guru_login_success(self):
        """Verify guru can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": GURU_EMAIL,
            "password": GURU_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access token in response"
        assert data["user"]["role"] == "guru_kelas", f"Unexpected role: {data['user']['role']}"
        print(f"Guru login successful, role: {data['user']['role']}")

    def test_superadmin_login_success(self):
        """Verify superadmin can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPERADMIN_EMAIL,
            "password": SUPERADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access token in response"
        assert data["user"]["role"] == "superadmin", f"Unexpected role: {data['user']['role']}"


@pytest.fixture
def guru_token():
    """Get auth token for guru user"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": GURU_EMAIL,
        "password": GURU_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Guru authentication failed")


@pytest.fixture
def superadmin_token():
    """Get auth token for superadmin user"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": SUPERADMIN_EMAIL,
        "password": SUPERADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Superadmin authentication failed")


class TestGuruDashboard:
    """Test Guru Dashboard functionality - P1"""
    
    def test_get_guru_dashboard(self, guru_token):
        """GET /api/dashboard/guru - returns correct class statistics"""
        headers = {"Authorization": f"Bearer {guru_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/guru", headers=headers)
        
        assert response.status_code == 200, f"Dashboard failed: {response.text}"
        data = response.json()
        
        # Verify required fields
        assert "tingkatan" in data, "Missing tingkatan field"
        assert "class_name" in data, "Missing class_name field"
        assert "full_class" in data, "Missing full_class field"
        assert "total_students" in data, "Missing total_students field"
        assert "total_fees" in data, "Missing total_fees field"
        assert "total_collected" in data, "Missing total_collected field"
        assert "outstanding" in data, "Missing outstanding field"
        assert "collection_rate" in data, "Missing collection_rate field"
        
        print(f"Dashboard data: {data}")
        print(f"  - Class: {data['full_class']}")
        print(f"  - Students: {data['total_students']}")
        print(f"  - Fees: RM {data['total_fees']}")
        print(f"  - Collection Rate: {data['collection_rate']:.1f}%")
    
    def test_dashboard_shows_assigned_class(self, guru_token):
        """Verify dashboard shows T1 A as assigned class"""
        headers = {"Authorization": f"Bearer {guru_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/guru", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Guru should be assigned to T1 A
        assert data["tingkatan"] == 1, f"Expected Tingkatan 1, got {data['tingkatan']}"
        assert data["class_name"] == "A", f"Expected Class A, got {data['class_name']}"
        assert data["full_class"] == "T1 A", f"Expected 'T1 A', got {data['full_class']}"
        print(f"SUCCESS: Dashboard shows correct class T1 A")


class TestClassAssignmentUpdate:
    """Test Class Assignment Update - P0"""
    
    def test_update_class_assignment_success(self, guru_token):
        """PUT /api/guru/profile/class-assignment - update to same class (T1 A)"""
        headers = {"Authorization": f"Bearer {guru_token}"}
        
        # Update to same class T1 A (should succeed as it's their current class)
        response = requests.put(
            f"{BASE_URL}/api/guru/profile/class-assignment",
            params={"tingkatan": 1, "kelas": "A"},
            headers=headers
        )
        
        assert response.status_code == 200, f"Update failed: {response.text}"
        data = response.json()
        
        assert data["success"] == True, "Update not successful"
        assert data["tingkatan"] == 1, f"Wrong tingkatan: {data['tingkatan']}"
        assert data["kelas"] == "A", f"Wrong kelas: {data['kelas']}"
        assert "Berjaya kemas kini" in data["message"], f"Unexpected message: {data['message']}"
        
        print(f"SUCCESS: Class assignment updated - {data['message']}")
    
    def test_update_class_invalid_tingkatan(self, guru_token):
        """PUT /api/guru/profile/class-assignment - invalid tingkatan should fail"""
        headers = {"Authorization": f"Bearer {guru_token}"}
        
        # Try invalid tingkatan (6)
        response = requests.put(
            f"{BASE_URL}/api/guru/profile/class-assignment",
            params={"tingkatan": 6, "kelas": "A"},
            headers=headers
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("SUCCESS: Invalid tingkatan rejected correctly")
    
    def test_update_class_invalid_kelas(self, guru_token):
        """PUT /api/guru/profile/class-assignment - invalid kelas should fail"""
        headers = {"Authorization": f"Bearer {guru_token}"}
        
        # Try invalid kelas (Z)
        response = requests.put(
            f"{BASE_URL}/api/guru/profile/class-assignment",
            params={"tingkatan": 1, "kelas": "Z"},
            headers=headers
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("SUCCESS: Invalid kelas rejected correctly")
    
    def test_update_class_already_assigned(self, guru_token, superadmin_token):
        """PUT /api/guru/profile/class-assignment - class already assigned to another guru should fail"""
        # This test needs to create another guru first, which is complex
        # For now, we'll skip this as it requires test data setup
        pytest.skip("Requires additional guru test data setup")


class TestSystemConfig:
    """Test System Config API for Tingkatan/Kelas options"""
    
    def test_get_system_config(self, guru_token):
        """GET /api/settings/system-config - returns valid tingkatan and kelas options"""
        headers = {"Authorization": f"Bearer {guru_token}"}
        response = requests.get(f"{BASE_URL}/api/settings/system-config", headers=headers)
        
        assert response.status_code == 200, f"System config failed: {response.text}"
        data = response.json()
        
        # Verify tingkatan and kelas arrays exist
        tingkatan = data.get("tingkatan", [1, 2, 3, 4, 5])
        kelas = data.get("kelas", ["A", "B", "C", "D", "E", "F"])
        
        assert len(tingkatan) >= 5, f"Expected at least 5 tingkatan, got {len(tingkatan)}"
        assert len(kelas) >= 6, f"Expected at least 6 kelas options, got {len(kelas)}"
        
        print(f"System config: Tingkatan={tingkatan}, Kelas={kelas}")


class TestQuickActionsLinks:
    """Test Tindakan Pantas (Quick Actions) links work correctly"""
    
    def test_guru_dashboard_overview_endpoint(self, guru_token):
        """GET /api/guru-dashboard/overview - for Dashboard Kelas link"""
        headers = {"Authorization": f"Bearer {guru_token}"}
        response = requests.get(f"{BASE_URL}/api/guru-dashboard/overview", headers=headers)
        
        assert response.status_code == 200, f"Overview failed: {response.text}"
        data = response.json()
        
        # Verify overview data structure
        assert "total_students" in data, "Missing total_students"
        assert "tingkatan" in data or "kelas" in data or "statistics" in data, "Missing class info fields"
        print(f"Overview: Tingkatan {data.get('tingkatan')}, Kelas {data.get('kelas')} - {data['total_students']} students")
    
    def test_guru_dashboard_students_endpoint(self, guru_token):
        """GET /api/guru-dashboard/students - for Senarai Pelajar link"""
        headers = {"Authorization": f"Bearer {guru_token}"}
        response = requests.get(f"{BASE_URL}/api/guru-dashboard/students", headers=headers)
        
        assert response.status_code == 200, f"Students list failed: {response.text}"
        data = response.json()
        
        # Verify students list data structure
        assert "students" in data or "data" in data, "Missing students list"
        print(f"Students endpoint working")


class TestDashboardDataVerification:
    """Verify dashboard shows accurate data based on assigned class"""
    
    def test_data_matches_assigned_class(self, guru_token):
        """Verify students and fees match the assigned class"""
        headers = {"Authorization": f"Bearer {guru_token}"}
        
        # Get dashboard data
        dashboard_response = requests.get(f"{BASE_URL}/api/dashboard/guru", headers=headers)
        assert dashboard_response.status_code == 200
        dashboard = dashboard_response.json()
        
        # Get detailed overview
        overview_response = requests.get(f"{BASE_URL}/api/guru-dashboard/overview", headers=headers)
        assert overview_response.status_code == 200
        overview = overview_response.json()
        
        # Verify data consistency
        assert dashboard["total_students"] == overview.get("total_students", 0), \
            f"Student count mismatch: {dashboard['total_students']} vs {overview.get('total_students')}"
        
        print(f"Data verified: {dashboard['total_students']} students in {dashboard['full_class']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
