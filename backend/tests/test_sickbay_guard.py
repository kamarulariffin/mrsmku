"""
Backend API Tests for Sick Bay and Guard (Vehicle) Modules
- Tests warden sickbay functionality: checkin, checkout, stats
- Tests guard vehicle functionality: register, scan, search
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://yuran-admin-panel.preview.emergentagent.com')

# Test credentials
WARDEN_EMAIL = "warden1@muafakat.link"
WARDEN_PASSWORD = "warden123"
GUARD_EMAIL = "guard1@muafakat.link"
GUARD_PASSWORD = "guard123"

class TestSickBayModule:
    """Sick Bay (Bilik Sakit) module tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as warden and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": WARDEN_EMAIL,
            "password": WARDEN_PASSWORD
        })
        assert response.status_code == 200, f"Warden login failed: {response.text}"
        data = response.json()
        self.token = data["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        self.user = data["user"]
    
    def test_warden_login_success(self):
        """Test warden1 can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": WARDEN_EMAIL,
            "password": WARDEN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["role"] == "warden"
        assert data["user"]["email"] == WARDEN_EMAIL
        assert "sickbay.view" in data["user"]["permissions"]
        print("✓ Warden login successful")
    
    def test_get_sickbay_stats(self):
        """Test GET /api/sickbay/stats"""
        response = requests.get(f"{BASE_URL}/api/sickbay/stats", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "in_sickbay" in data
        assert "today_visits" in data
        assert "today_discharges" in data
        assert "common_symptoms" in data
        print(f"✓ Sickbay stats: In={data['in_sickbay']}, Visits={data['today_visits']}")
    
    def test_search_students_for_sickbay(self):
        """Test GET /api/sickbay/students with search"""
        response = requests.get(
            f"{BASE_URL}/api/sickbay/students?search=S2026001",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should find at least one student
        if len(data) > 0:
            student = data[0]
            assert "id" in student
            assert "matric" in student
            assert "fullName" in student
            print(f"✓ Found student: {student['fullName']} ({student['matric']})")
        else:
            print("⚠ No students found - may need to seed test data")
    
    def test_sickbay_checkin_and_checkout_flow(self):
        """Test complete sickbay checkin and checkout flow"""
        # First get a student
        students_response = requests.get(
            f"{BASE_URL}/api/sickbay/students?search=S2026001",
            headers=self.headers
        )
        assert students_response.status_code == 200
        students = students_response.json()
        
        if len(students) == 0:
            pytest.skip("No students available for testing")
        
        student = students[0]
        student_id = student["id"]
        
        # Checkin to sickbay
        checkin_data = {
            "student_id": student_id,
            "check_in_time": datetime.now().isoformat(),
            "symptoms": "Demam",
            "initial_treatment": "Paracetamol",
            "follow_up": "Rehat"
        }
        checkin_response = requests.post(
            f"{BASE_URL}/api/sickbay/checkin",
            json=checkin_data,
            headers=self.headers
        )
        assert checkin_response.status_code == 200, f"Checkin failed: {checkin_response.text}"
        checkin_result = checkin_response.json()
        assert "id" in checkin_result
        record_id = checkin_result["id"]
        print(f"✓ Sickbay checkin successful, record ID: {record_id}")
        
        # Verify record appears in list
        records_response = requests.get(f"{BASE_URL}/api/sickbay/records", headers=self.headers)
        assert records_response.status_code == 200
        records = records_response.json()
        found = any(r["id"] == record_id for r in records)
        assert found, "Checkin record not found in list"
        print("✓ Record appears in sickbay records list")
        
        # Checkout from sickbay
        checkout_response = requests.post(
            f"{BASE_URL}/api/sickbay/checkout/{record_id}",
            headers=self.headers
        )
        assert checkout_response.status_code == 200
        print("✓ Sickbay checkout successful")
        
        # Verify checkout time is set
        records_response = requests.get(f"{BASE_URL}/api/sickbay/records", headers=self.headers)
        records = records_response.json()
        record = next((r for r in records if r["id"] == record_id), None)
        assert record is not None
        assert record.get("check_out_time") is not None
        print("✓ Checkout time recorded correctly")
    
    def test_get_sickbay_records(self):
        """Test GET /api/sickbay/records"""
        response = requests.get(f"{BASE_URL}/api/sickbay/records", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} sickbay records")


class TestGuardVehicleModule:
    """Guard Vehicle module tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as guard and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": GUARD_EMAIL,
            "password": GUARD_PASSWORD
        })
        assert response.status_code == 200, f"Guard login failed: {response.text}"
        data = response.json()
        self.token = data["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        self.user = data["user"]
    
    def test_guard_login_success(self):
        """Test guard1 can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": GUARD_EMAIL,
            "password": GUARD_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["role"] == "guard"
        assert data["user"]["email"] == GUARD_EMAIL
        assert "vehicle.scan" in data["user"]["permissions"]
        print("✓ Guard login successful")
    
    def test_get_vehicle_stats(self):
        """Test GET /api/vehicles/stats"""
        response = requests.get(f"{BASE_URL}/api/vehicles/stats", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "total_vehicles" in data
        assert "today_scans" in data
        assert "recent_scans" in data
        print(f"✓ Vehicle stats: Total={data['total_vehicles']}, Scans today={data['today_scans']}")
    
    def test_search_students_for_vehicle(self):
        """Test GET /api/guard/students with search"""
        response = requests.get(
            f"{BASE_URL}/api/guard/students?search=S2026001",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            student = data[0]
            assert "id" in student
            assert "matric" in student
            assert "fullName" in student
            print(f"✓ Found student: {student['fullName']} ({student['matric']})")
    
    def test_vehicle_register_scan_and_search_flow(self):
        """Test complete vehicle registration, scan and search flow"""
        import random
        import string
        
        # First get a student
        students_response = requests.get(
            f"{BASE_URL}/api/guard/students?search=S2026001",
            headers=self.headers
        )
        assert students_response.status_code == 200
        students = students_response.json()
        
        if len(students) == 0:
            pytest.skip("No students available for testing")
        
        student = students[0]
        student_id = student["id"]
        
        # Generate unique plate number for test
        random_suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
        plate_number = f"TEST{random_suffix}"
        
        # Register vehicle
        register_data = {
            "plate_number": plate_number,
            "owner_name": "Test Owner",
            "relationship": "bapa",
            "phone": "0123456789",
            "student_id": student_id
        }
        register_response = requests.post(
            f"{BASE_URL}/api/vehicles/register",
            json=register_data,
            headers=self.headers
        )
        assert register_response.status_code == 200, f"Register failed: {register_response.text}"
        register_result = register_response.json()
        assert "id" in register_result
        assert "qr_code" in register_result
        vehicle_id = register_result["id"]
        print(f"✓ Vehicle registered: {plate_number}, QR: {register_result['qr_code']}")
        
        # Verify vehicle appears in list
        vehicles_response = requests.get(f"{BASE_URL}/api/vehicles", headers=self.headers)
        assert vehicles_response.status_code == 200
        vehicles = vehicles_response.json()
        found = any(v["plate_number"] == plate_number for v in vehicles)
        assert found, "Registered vehicle not found in list"
        print("✓ Vehicle appears in vehicles list")
        
        # Search vehicle
        search_response = requests.get(
            f"{BASE_URL}/api/vehicles/search/{plate_number}",
            headers=self.headers
        )
        assert search_response.status_code == 200
        search_result = search_response.json()
        assert search_result["found"] == True
        assert search_result["vehicle"]["plate_number"] == plate_number
        print(f"✓ Vehicle search successful: {search_result['vehicle']['plate_number']}")
        
        # Scan vehicle (logs the scan)
        scan_response = requests.post(
            f"{BASE_URL}/api/vehicles/scan/{plate_number}",
            headers=self.headers
        )
        assert scan_response.status_code == 200
        scan_result = scan_response.json()
        assert "vehicle" in scan_result
        print("✓ Vehicle scan logged successfully")
        
        # Check scans list
        scans_response = requests.get(f"{BASE_URL}/api/vehicles/scans", headers=self.headers)
        assert scans_response.status_code == 200
        scans = scans_response.json()
        found_scan = any(s["plate_number"] == plate_number for s in scans)
        assert found_scan, "Scan not found in scans list"
        print("✓ Scan appears in scans list")
        
        # Cleanup - delete the test vehicle
        delete_response = requests.delete(
            f"{BASE_URL}/api/vehicles/{vehicle_id}",
            headers=self.headers
        )
        assert delete_response.status_code == 200
        print("✓ Test vehicle cleaned up")
    
    def test_get_vehicles_list(self):
        """Test GET /api/vehicles"""
        response = requests.get(f"{BASE_URL}/api/vehicles", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} registered vehicles")
    
    def test_get_vehicle_scans(self):
        """Test GET /api/vehicles/scans"""
        response = requests.get(f"{BASE_URL}/api/vehicles/scans", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} vehicle scans")
    
    def test_search_unregistered_vehicle(self):
        """Test searching for non-existent vehicle"""
        response = requests.get(
            f"{BASE_URL}/api/vehicles/search/NOTEXIST123",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["found"] == False
        print("✓ Unregistered vehicle correctly returns not found")


class TestAccessControl:
    """Test role-based access control"""
    
    def test_warden_cannot_access_vehicle_endpoints(self):
        """Warden should not have access to vehicle endpoints"""
        # Login as warden
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": WARDEN_EMAIL,
            "password": WARDEN_PASSWORD
        })
        token = response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Try to access vehicle endpoints
        vehicles_response = requests.get(f"{BASE_URL}/api/vehicles", headers=headers)
        assert vehicles_response.status_code == 403, "Warden should not access vehicle list"
        print("✓ Warden correctly denied access to vehicle endpoints")
    
    def test_guard_cannot_access_sickbay_endpoints(self):
        """Guard should not have access to sickbay endpoints"""
        # Login as guard
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": GUARD_EMAIL,
            "password": GUARD_PASSWORD
        })
        token = response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Try to access sickbay endpoints
        sickbay_response = requests.get(f"{BASE_URL}/api/sickbay/stats", headers=headers)
        assert sickbay_response.status_code == 403, "Guard should not access sickbay stats"
        print("✓ Guard correctly denied access to sickbay endpoints")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
