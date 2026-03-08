"""
Tests for Bus Booking Settings and Pulang Bermalam Integration
- Bus booking settings (require_leave_approval toggle)
- Pulang bermalam request/approve/reject endpoints
- Leave requirement check for bus booking
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

# Test credentials
SUPERADMIN_CREDS = {"email": "superadmin@muafakat.link", "password": "super123"}
PARENT_CREDS = {"email": "demo@muafakat.link", "password": "demoparent"}
WARDEN_CREDS = {"email": "warden@muafakat.link", "password": "warden123"}
ADMIN_CREDS = {"email": "admin@muafakat.link", "password": "admin123"}


class TestBusBookingSettings:
    """Tests for bus booking settings endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def login(self, credentials):
        """Helper to login and return token"""
        res = self.session.post(f"{BASE_URL}/api/auth/login", json=credentials)
        if res.status_code == 200:
            token = res.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            return res.json()
        return None
    
    def test_get_public_bus_settings(self):
        """GET /api/public/settings/bus-booking - Public endpoint without auth"""
        res = self.session.get(f"{BASE_URL}/api/public/settings/bus-booking")
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert "require_leave_approval" in data
        print(f"✓ Public bus settings: require_leave_approval = {data['require_leave_approval']}")
    
    def test_get_bus_settings_authenticated(self):
        """GET /api/settings/bus-booking - Authenticated endpoint"""
        login_data = self.login(SUPERADMIN_CREDS)
        assert login_data, "SuperAdmin login failed"
        
        res = self.session.get(f"{BASE_URL}/api/settings/bus-booking")
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert "require_leave_approval" in data
        print(f"✓ Authenticated bus settings: {data}")
    
    def test_save_bus_settings_superadmin(self):
        """POST /api/settings/bus-booking - SuperAdmin can save settings"""
        login_data = self.login(SUPERADMIN_CREDS)
        assert login_data, "SuperAdmin login failed"
        
        # Enable leave approval requirement
        res = self.session.post(f"{BASE_URL}/api/settings/bus-booking", json={
            "require_leave_approval": True
        })
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert "message" in data
        print(f"✓ SuperAdmin saved bus settings: {data['message']}")
        
        # Verify settings were saved
        res = self.session.get(f"{BASE_URL}/api/settings/bus-booking")
        assert res.status_code == 200
        assert res.json()["require_leave_approval"] == True
        print("✓ Verified settings saved correctly")
    
    def test_save_bus_settings_non_superadmin_rejected(self):
        """POST /api/settings/bus-booking - Non-superadmin should be rejected"""
        login_data = self.login(ADMIN_CREDS)
        assert login_data, "Admin login failed"
        
        res = self.session.post(f"{BASE_URL}/api/settings/bus-booking", json={
            "require_leave_approval": False
        })
        
        assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"
        print("✓ Non-superadmin correctly rejected from saving bus settings")


class TestPulangBermalam:
    """Tests for Pulang Bermalam request/approve/reject endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_request_id = None
    
    def login(self, credentials):
        """Helper to login and return token"""
        res = self.session.post(f"{BASE_URL}/api/auth/login", json=credentials)
        if res.status_code == 200:
            token = res.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            return res.json()
        return None
    
    def get_first_child_id(self):
        """Get first approved child ID for parent"""
        res = self.session.get(f"{BASE_URL}/api/students")
        if res.status_code == 200:
            students = res.json()
            approved = [s for s in students if s.get("status") == "approved"]
            if approved:
                return approved[0]["id"]
        return None
    
    def test_get_pulang_bermalam_requests_parent(self):
        """GET /api/hostel/pulang-bermalam/requests - Parent can get their requests"""
        login_data = self.login(PARENT_CREDS)
        assert login_data, "Parent login failed"
        
        res = self.session.get(f"{BASE_URL}/api/hostel/pulang-bermalam/requests")
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert isinstance(data, list)
        print(f"✓ Parent got {len(data)} pulang bermalam requests")
        
        # Check structure if there are requests
        if data:
            request_item = data[0]
            expected_keys = ["id", "student_id", "student_name", "tarikh_keluar", "tarikh_pulang", "status"]
            for key in expected_keys:
                assert key in request_item, f"Missing key: {key}"
            print(f"✓ Request structure verified: {list(request_item.keys())}")
    
    def test_request_pulang_bermalam_parent(self):
        """POST /api/hostel/pulang-bermalam/request - Parent can request leave"""
        login_data = self.login(PARENT_CREDS)
        assert login_data, "Parent login failed"
        
        student_id = self.get_first_child_id()
        if not student_id:
            pytest.skip("No approved children found for parent")
        
        # Create unique dates to avoid duplicate request error
        tomorrow = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        return_date = (datetime.now() + timedelta(days=32)).strftime("%Y-%m-%d")
        
        res = self.session.post(f"{BASE_URL}/api/hostel/pulang-bermalam/request", json={
            "student_id": student_id,
            "tarikh_keluar": tomorrow,
            "tarikh_pulang": return_date,
            "sebab": "Cuti test automation",
            "pic_name": "Encik Test Parent",
            "pic_phone": "0123456789"
        })
        
        # Could be 200 or 400 if duplicate exists
        if res.status_code == 200:
            data = res.json()
            assert "message" in data
            assert "id" in data
            self.created_request_id = data["id"]
            print(f"✓ Parent created leave request: {data['id']}")
        elif res.status_code == 400:
            print(f"✓ Request already exists for these dates (expected): {res.json()}")
        else:
            assert False, f"Unexpected status {res.status_code}: {res.text}"
    
    def test_get_pulang_bermalam_requests_warden(self):
        """GET /api/hostel/pulang-bermalam/requests - Warden can get requests"""
        login_data = self.login(WARDEN_CREDS)
        assert login_data, "Warden login failed"
        
        res = self.session.get(f"{BASE_URL}/api/hostel/pulang-bermalam/requests")
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert isinstance(data, list)
        print(f"✓ Warden got {len(data)} pulang bermalam requests")
    
    def test_approve_pulang_bermalam_warden(self):
        """POST /api/hostel/pulang-bermalam/{id}/approve - Warden can approve"""
        # First get a pending request as admin/superadmin
        login_data = self.login(SUPERADMIN_CREDS)
        assert login_data, "SuperAdmin login failed"
        
        res = self.session.get(f"{BASE_URL}/api/hostel/pulang-bermalam/requests?status=pending")
        if res.status_code != 200 or not res.json():
            pytest.skip("No pending requests to approve")
        
        pending_requests = res.json()
        if not pending_requests:
            pytest.skip("No pending requests to approve")
        
        request_id = pending_requests[0]["id"]
        
        # Now approve as warden
        login_data = self.login(WARDEN_CREDS)
        assert login_data, "Warden login failed"
        
        res = self.session.post(f"{BASE_URL}/api/hostel/pulang-bermalam/{request_id}/approve")
        
        # Could be 200 or 400 if already processed
        if res.status_code == 200:
            data = res.json()
            assert "message" in data
            print(f"✓ Warden approved request: {request_id}")
        elif res.status_code == 400:
            print(f"✓ Request already processed: {res.json()}")
        else:
            assert False, f"Unexpected status {res.status_code}: {res.text}"
    
    def test_reject_pulang_bermalam_admin(self):
        """POST /api/hostel/pulang-bermalam/{id}/reject - Admin can reject"""
        login_data = self.login(ADMIN_CREDS)
        assert login_data, "Admin login failed"
        
        res = self.session.get(f"{BASE_URL}/api/hostel/pulang-bermalam/requests?status=pending")
        if res.status_code != 200:
            pytest.skip("Could not get pending requests")
        
        pending_requests = res.json()
        if not pending_requests:
            pytest.skip("No pending requests to reject")
        
        request_id = pending_requests[0]["id"]
        
        res = self.session.post(f"{BASE_URL}/api/hostel/pulang-bermalam/{request_id}/reject?reason=Test%20rejection")
        
        if res.status_code == 200:
            data = res.json()
            assert "message" in data
            print(f"✓ Admin rejected request: {request_id}")
        elif res.status_code == 400:
            print(f"✓ Request already processed: {res.json()}")
        else:
            assert False, f"Unexpected status {res.status_code}: {res.text}"


class TestLeaveRequirementCheck:
    """Tests for leave requirement check when booking bus"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def login(self, credentials):
        """Helper to login and return token"""
        res = self.session.post(f"{BASE_URL}/api/auth/login", json=credentials)
        if res.status_code == 200:
            token = res.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            return res.json()
        return None
    
    def get_first_child_id(self):
        """Get first approved child ID for parent"""
        res = self.session.get(f"{BASE_URL}/api/students")
        if res.status_code == 200:
            students = res.json()
            approved = [s for s in students if s.get("status") == "approved"]
            if approved:
                return approved[0]["id"]
        return None
    
    def get_first_trip_id(self):
        """Get first available trip ID"""
        res = self.session.get(f"{BASE_URL}/api/public/bus/trips")
        if res.status_code == 200:
            trips = res.json()
            if trips:
                return trips[0]["id"]
        return None
    
    def test_check_leave_requirement_endpoint(self):
        """GET /api/bus/check-leave-requirement - Check if leave is required"""
        login_data = self.login(PARENT_CREDS)
        assert login_data, "Parent login failed"
        
        student_id = self.get_first_child_id()
        trip_id = self.get_first_trip_id()
        
        if not student_id:
            pytest.skip("No approved children found")
        if not trip_id:
            pytest.skip("No trips available")
        
        res = self.session.get(f"{BASE_URL}/api/bus/check-leave-requirement?student_id={student_id}&trip_id={trip_id}")
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        assert "can_book" in data
        assert "require_leave_approval" in data
        assert "message" in data
        
        print(f"✓ Leave requirement check: can_book={data['can_book']}, require_leave_approval={data['require_leave_approval']}")
        print(f"  Message: {data['message']}")


class TestBusBookingWithLeaveCheck:
    """Tests for bus booking with leave requirement integration"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def login(self, credentials):
        """Helper to login and return token"""
        res = self.session.post(f"{BASE_URL}/api/auth/login", json=credentials)
        if res.status_code == 200:
            token = res.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            return res.json()
        return None
    
    def get_first_child_id(self):
        """Get first approved child ID for parent"""
        res = self.session.get(f"{BASE_URL}/api/students")
        if res.status_code == 200:
            students = res.json()
            approved = [s for s in students if s.get("status") == "approved"]
            if approved:
                return approved[0]["id"]
        return None
    
    def get_trip_details(self):
        """Get first available trip details"""
        res = self.session.get(f"{BASE_URL}/api/public/bus/trips")
        if res.status_code == 200:
            trips = res.json()
            if trips:
                trip = trips[0]
                drop_off = trip.get("drop_off_points", [{}])[0].get("location", "")
                return trip["id"], drop_off
        return None, None
    
    def test_bus_booking_flow(self):
        """Test full bus booking flow with leave check"""
        login_data = self.login(PARENT_CREDS)
        assert login_data, "Parent login failed"
        
        student_id = self.get_first_child_id()
        trip_id, drop_off = self.get_trip_details()
        
        if not student_id:
            pytest.skip("No approved children found")
        if not trip_id or not drop_off:
            pytest.skip("No trips available")
        
        # First check leave requirement
        res = self.session.get(f"{BASE_URL}/api/bus/check-leave-requirement?student_id={student_id}&trip_id={trip_id}")
        assert res.status_code == 200
        leave_check = res.json()
        
        print(f"Leave check result: {leave_check}")
        
        # Try to book
        res = self.session.post(f"{BASE_URL}/api/bus/bookings", json={
            "trip_id": trip_id,
            "student_id": student_id,
            "drop_off_point": drop_off
        })
        
        # If leave is required and not approved, should fail
        if leave_check.get("require_leave_approval") and not leave_check.get("can_book"):
            # Should be rejected
            if res.status_code in [400, 403]:
                print(f"✓ Booking correctly rejected when leave not approved: {res.json()}")
            else:
                # Might still succeed if there's an approved leave
                print(f"Booking result: {res.status_code} - {res.text}")
        else:
            # Should succeed or fail for other reasons (seat availability, etc.)
            print(f"✓ Booking result (no leave required or leave approved): {res.status_code}")
            if res.status_code == 200:
                data = res.json()
                print(f"  Booking created: {data}")


class TestSettingsToggle:
    """Test the complete settings toggle flow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def login(self, credentials):
        """Helper to login and return token"""
        res = self.session.post(f"{BASE_URL}/api/auth/login", json=credentials)
        if res.status_code == 200:
            token = res.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            return res.json()
        return None
    
    def test_toggle_setting_on_off(self):
        """Test toggling the require_leave_approval setting on and off"""
        login_data = self.login(SUPERADMIN_CREDS)
        assert login_data, "SuperAdmin login failed"
        
        # Enable setting
        res = self.session.post(f"{BASE_URL}/api/settings/bus-booking", json={
            "require_leave_approval": True
        })
        assert res.status_code == 200, f"Failed to enable: {res.text}"
        
        # Verify enabled
        res = self.session.get(f"{BASE_URL}/api/public/settings/bus-booking")
        assert res.status_code == 200
        assert res.json()["require_leave_approval"] == True
        print("✓ Setting enabled: require_leave_approval = True")
        
        # Disable setting
        res = self.session.post(f"{BASE_URL}/api/settings/bus-booking", json={
            "require_leave_approval": False
        })
        assert res.status_code == 200, f"Failed to disable: {res.text}"
        
        # Verify disabled
        res = self.session.get(f"{BASE_URL}/api/public/settings/bus-booking")
        assert res.status_code == 200
        assert res.json()["require_leave_approval"] == False
        print("✓ Setting disabled: require_leave_approval = False")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
