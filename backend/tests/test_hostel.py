"""
e-Hostel Module Tests for Warden Role
Tests hostel checkout/checkin functionality in MRSM School Management System

Test Coverage:
- Warden login and authentication
- Hostel stats endpoint
- Hostel students list (filtered by block)
- Checkout flow (record student leaving)
- Checkin flow (record student returning)
- Hostel records history
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
WARDEN_EMAIL = "warden1@muafakat.link"
WARDEN_PASSWORD = "warden123"
TEST_STUDENT_MATRIC = "S2026001"


class TestWardenAuth:
    """Warden authentication tests"""
    
    def test_warden_login_success(self):
        """Test warden can login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": WARDEN_EMAIL,
            "password": WARDEN_PASSWORD
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["role"] == "warden"
        assert data["user"]["email"] == WARDEN_EMAIL
    
    def test_warden_login_invalid_password(self):
        """Test login fails with wrong password"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": WARDEN_EMAIL,
            "password": "wrongpassword"
        })
        
        assert response.status_code == 401


@pytest.fixture
def warden_token():
    """Get warden authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": WARDEN_EMAIL,
        "password": WARDEN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Warden authentication failed")


@pytest.fixture
def auth_headers(warden_token):
    """Get authorization headers"""
    return {"Authorization": f"Bearer {warden_token}"}


class TestHostelStats:
    """Hostel statistics endpoint tests"""
    
    def test_hostel_stats_returns_data(self, auth_headers):
        """Test hostel stats endpoint returns valid data"""
        response = requests.get(f"{BASE_URL}/api/hostel/stats", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify expected fields
        assert "total_students" in data
        assert "in_hostel" in data
        assert "out_count" in data
        assert "today_checkouts" in data
        assert "today_checkins" in data
        assert "block" in data
        
        # Data type validation
        assert isinstance(data["total_students"], int)
        assert isinstance(data["in_hostel"], int)
        assert isinstance(data["out_count"], int)
        
        # Block assigned to warden1 is Blok A
        assert data["block"] == "Blok A"
    
    def test_hostel_stats_unauthorized(self):
        """Test hostel stats requires authentication"""
        response = requests.get(f"{BASE_URL}/api/hostel/stats")
        # 403 Forbidden is returned when no token is provided (not authenticated)
        assert response.status_code in [401, 403]


class TestHostelStudents:
    """Hostel students list endpoint tests"""
    
    def test_get_students_in_block(self, auth_headers):
        """Test getting students list filtered by warden's block"""
        response = requests.get(f"{BASE_URL}/api/hostel/students", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Should return a list
        assert isinstance(data, list)
        
        # Verify student S2026001 is in the list (Ali bin Abu from Blok A)
        student_matrics = [s["matric"] for s in data]
        assert TEST_STUDENT_MATRIC in student_matrics
    
    def test_student_has_required_fields(self, auth_headers):
        """Test student records have all required fields"""
        response = requests.get(f"{BASE_URL}/api/hostel/students", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data) > 0:
            student = data[0]
            assert "id" in student
            assert "matric" in student
            assert "fullName" in student
            assert "block" in student
            assert "hostel_status" in student


class TestHostelCheckout:
    """Hostel checkout (keluar) functionality tests"""
    
    def test_checkout_student(self, auth_headers):
        """Test recording student checkout"""
        # First get a student ID
        students_response = requests.get(f"{BASE_URL}/api/hostel/students", headers=auth_headers)
        students = students_response.json()
        
        if not students:
            pytest.skip("No students available for checkout test")
        
        # Find student in hostel
        student = next((s for s in students if s["hostel_status"] == "dalam_asrama"), None)
        if not student:
            # If no student in hostel, the previous test may have left them checked out
            # This is still valid - we just skip
            pytest.skip("No student currently in hostel")
        
        # Perform checkout
        checkout_data = {
            "student_id": student["id"],
            "tarikh_keluar": datetime.now().isoformat(),
            "pic_name": "TEST_Parent Name",
            "driver_name": "TEST_Driver",
            "vehicle_out": "TEST 1234",
            "kategori": "lawatan"
        }
        
        response = requests.post(f"{BASE_URL}/api/hostel/checkout", 
                                json=checkout_data, 
                                headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["message"] == "Rekod keluar disimpan"
        
        # Verify student status changed
        students_after = requests.get(f"{BASE_URL}/api/hostel/students", headers=auth_headers).json()
        updated_student = next((s for s in students_after if s["id"] == student["id"]), None)
        assert updated_student is not None
        assert updated_student["hostel_status"] == "keluar"
    
    def test_checkout_invalid_student(self, auth_headers):
        """Test checkout fails for non-existent student"""
        checkout_data = {
            "student_id": "000000000000000000000000",
            "tarikh_keluar": datetime.now().isoformat(),
            "pic_name": "TEST_Name",
            "kategori": "lawatan"
        }
        
        response = requests.post(f"{BASE_URL}/api/hostel/checkout", 
                                json=checkout_data, 
                                headers=auth_headers)
        
        assert response.status_code == 404


class TestHostelCheckin:
    """Hostel checkin (masuk) functionality tests"""
    
    def test_checkin_student(self, auth_headers):
        """Test recording student checkin (return to hostel)"""
        # Get students currently out
        students_response = requests.get(f"{BASE_URL}/api/hostel/students", headers=auth_headers)
        students = students_response.json()
        
        # Find student who is checked out
        student_out = next((s for s in students if s["hostel_status"] == "keluar"), None)
        
        if not student_out:
            pytest.skip("No student currently checked out to test checkin")
        
        # Get the record ID
        record_id = student_out.get("latest_record_id")
        if not record_id:
            pytest.skip("No record ID found for student")
        
        # Perform checkin
        response = requests.post(f"{BASE_URL}/api/hostel/checkin/{record_id}", 
                                headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Rekod masuk dikemaskini"
        
        # Verify student status changed back to dalam_asrama
        students_after = requests.get(f"{BASE_URL}/api/hostel/students", headers=auth_headers).json()
        updated_student = next((s for s in students_after if s["id"] == student_out["id"]), None)
        assert updated_student is not None
        assert updated_student["hostel_status"] == "dalam_asrama"


class TestHostelRecords:
    """Hostel records history tests"""
    
    def test_get_hostel_records(self, auth_headers):
        """Test getting hostel records history"""
        response = requests.get(f"{BASE_URL}/api/hostel/records", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Should return a list
        assert isinstance(data, list)
    
    def test_records_have_required_fields(self, auth_headers):
        """Test record entries have required fields"""
        response = requests.get(f"{BASE_URL}/api/hostel/records", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data) > 0:
            record = data[0]
            assert "id" in record
            assert "student_name" in record
            assert "check_type" in record
            assert "kategori" in record


class TestHostelIntegration:
    """Full integration test for checkout and checkin flow"""
    
    def test_full_checkout_checkin_cycle(self, auth_headers):
        """Test complete checkout then checkin flow"""
        # Get students
        students = requests.get(f"{BASE_URL}/api/hostel/students", headers=auth_headers).json()
        
        # Find student in hostel
        student = next((s for s in students if s["hostel_status"] == "dalam_asrama"), None)
        
        if not student:
            pytest.skip("No student available for integration test")
        
        student_id = student["id"]
        
        # Step 1: Checkout
        checkout_response = requests.post(f"{BASE_URL}/api/hostel/checkout", 
                                         json={
                                             "student_id": student_id,
                                             "pic_name": "TEST_Integration Parent",
                                             "kategori": "lawatan"
                                         }, 
                                         headers=auth_headers)
        
        assert checkout_response.status_code == 200
        record_id = checkout_response.json()["id"]
        print(f"Checkout successful, record_id: {record_id}")
        
        # Verify student is out
        students_mid = requests.get(f"{BASE_URL}/api/hostel/students", headers=auth_headers).json()
        student_mid = next((s for s in students_mid if s["id"] == student_id), None)
        assert student_mid["hostel_status"] == "keluar"
        print("Student status verified as 'keluar'")
        
        # Step 2: Checkin
        checkin_response = requests.post(f"{BASE_URL}/api/hostel/checkin/{record_id}", 
                                        headers=auth_headers)
        
        assert checkin_response.status_code == 200
        print("Checkin successful")
        
        # Verify student is back
        students_end = requests.get(f"{BASE_URL}/api/hostel/students", headers=auth_headers).json()
        student_end = next((s for s in students_end if s["id"] == student_id), None)
        assert student_end["hostel_status"] == "dalam_asrama"
        print("Student status verified as 'dalam_asrama'")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
