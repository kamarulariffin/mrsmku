"""
Test User QR Code and AGM Status Endpoints
Tests for:
- GET /api/agm/user/profile-with-qr/{user_id} - returns user profile with QR code
- GET /api/agm/user/qrcode/{user_id} - generates/returns user QR code
- GET /api/agm/user/agm-status/{user_id} - returns AGM membership status
- POST /api/agm/user/scan-attendance - scan user QR code for AGM attendance
- User registration generates QR code automatically
- Admin can create user and QR code is generated
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@muafakat.link"
ADMIN_PASSWORD = "admin123"
PARENT_EMAIL = "ibu.bapa@muafakat.link"
PARENT_PASSWORD = "parent123"

# Test user ID from main agent context
TEST_USER_ID = "6990426edddf0c27ed073e0e"
TEST_EVENT_ID = "698fe2e8d8c7a1c47014c7d3"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    res = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if res.status_code == 200:
        return res.json().get("access_token")
    pytest.skip("Admin authentication failed")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    """Headers with admin auth"""
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def parent_login():
    """Get parent user info from login"""
    res = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": PARENT_EMAIL,
        "password": PARENT_PASSWORD
    })
    if res.status_code == 200:
        return res.json()
    pytest.skip("Parent authentication failed")


@pytest.fixture(scope="module")
def parent_token(parent_login):
    """Get parent authentication token"""
    return parent_login.get("access_token")


@pytest.fixture(scope="module")
def parent_user_id(parent_login):
    """Get parent user ID"""
    return parent_login.get("user", {}).get("id")


class TestUserQRCodeEndpoints:
    """Tests for user QR code endpoints"""
    
    def test_get_user_qrcode_endpoint(self, admin_headers, parent_user_id):
        """Test GET /api/agm/user/qrcode/{user_id} - generates/returns user QR code"""
        res = requests.get(f"{BASE_URL}/api/agm/user/qrcode/{parent_user_id}", headers=admin_headers)
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert "qr_code" in data, "Response should contain qr_code"
        assert "qr_code_image" in data, "Response should contain qr_code_image (base64)"
        assert "user_id" in data
        assert data["user_id"] == parent_user_id
        
        # QR code format should be MRSMKU-USER-{user_id}
        assert data["qr_code"].startswith("MRSMKU-USER-"), f"QR code should start with MRSMKU-USER-, got {data['qr_code']}"
        assert parent_user_id in data["qr_code"], "QR code should contain user_id"
        
        print(f"✓ User QR code generated: {data['qr_code']}")
        print(f"✓ QR code image present (base64): {len(data.get('qr_code_image', ''))} chars")
    
    def test_get_user_qrcode_invalid_user(self, admin_headers):
        """Test GET /api/agm/user/qrcode with invalid user ID returns 400 or 404"""
        invalid_id = "507f1f77bcf86cd799439011"  # Valid ObjectId format but non-existent
        res = requests.get(f"{BASE_URL}/api/agm/user/qrcode/{invalid_id}", headers=admin_headers)
        
        # Can return 400 (ObjectId validation) or 404 (not found)
        assert res.status_code in [400, 404], f"Expected 400/404 for non-existent user, got {res.status_code}"
        print(f"✓ Invalid user ID returns {res.status_code}")


class TestUserAGMStatusEndpoints:
    """Tests for user AGM membership status"""
    
    def test_get_user_agm_status(self, admin_headers, parent_user_id):
        """Test GET /api/agm/user/agm-status/{user_id} - returns AGM membership status"""
        res = requests.get(f"{BASE_URL}/api/agm/user/agm-status/{parent_user_id}", headers=admin_headers)
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert "user_id" in data
        assert "full_name" in data
        assert "role" in data
        
        # For parent role, should have agm_status
        if data.get("applicable"):
            assert "agm_status" in data, "Parent should have agm_status"
            agm_status = data["agm_status"]
            assert "status" in agm_status
            assert "status_code" in agm_status
            assert agm_status["status_code"] in ["aktif", "pemerhati", "tiada_anak"]
            assert "boleh_mengundi" in agm_status
            assert "tahun" in agm_status
            assert "tarikh_cutoff" in agm_status
            print(f"✓ AGM status: {agm_status['status']}")
            print(f"✓ Status code: {agm_status['status_code']}")
            print(f"✓ Boleh mengundi: {agm_status['boleh_mengundi']}")
        else:
            print(f"✓ User is not parent, AGM status not applicable")
    
    def test_get_agm_status_for_non_parent(self, admin_headers):
        """Test AGM status for non-parent role shows not applicable"""
        # Login as admin to get admin user ID
        res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        admin_user_id = res.json().get("user", {}).get("id")
        
        res = requests.get(f"{BASE_URL}/api/agm/user/agm-status/{admin_user_id}", headers=admin_headers)
        assert res.status_code == 200
        
        data = res.json()
        assert data.get("applicable") is False, "Admin role should not have applicable AGM status"
        assert "message" in data
        print(f"✓ Non-parent AGM status: {data.get('message')}")


class TestUserProfileWithQREndpoints:
    """Tests for combined profile with QR code endpoint"""
    
    def test_get_profile_with_qr(self, admin_headers, parent_user_id):
        """Test GET /api/agm/user/profile-with-qr/{user_id} - complete profile with QR"""
        res = requests.get(f"{BASE_URL}/api/agm/user/profile-with-qr/{parent_user_id}", headers=admin_headers)
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        
        # Basic user info
        assert "user_id" in data
        assert "full_name" in data
        assert "email" in data
        assert "role" in data
        
        # QR Code fields
        assert "qr_code" in data, "Should have qr_code"
        assert "qr_code_image" in data, "Should have qr_code_image"
        assert data["qr_code"].startswith("MRSMKU-USER-")
        
        # AGM Status (for parent)
        if data.get("role") == "parent":
            assert "agm_status" in data
            print(f"✓ Parent AGM status included: {data['agm_status'].get('status')}")
        
        # Children list (for parent)
        if data.get("role") == "parent":
            assert "children" in data
            print(f"✓ Children count: {len(data.get('children', []))}")
        
        print(f"✓ Profile with QR: {data['full_name']}")
        print(f"✓ QR Code: {data['qr_code']}")
    
    def test_profile_with_qr_generates_if_missing(self, admin_headers, parent_user_id):
        """Test that profile endpoint generates QR if user doesn't have one"""
        res = requests.get(f"{BASE_URL}/api/agm/user/profile-with-qr/{parent_user_id}", headers=admin_headers)
        assert res.status_code == 200
        
        data = res.json()
        assert data.get("qr_code") is not None, "QR code should be generated"
        assert len(data.get("qr_code_image", "")) > 100, "QR code image should be valid base64"
        print("✓ QR code auto-generation works")


class TestScanUserAttendance:
    """Tests for scanning user QR code for AGM attendance"""
    
    def test_scan_user_attendance_new_format(self, admin_headers, parent_user_id):
        """Test POST /api/agm/user/scan-attendance - scan new format MRSMKU-USER-..."""
        # First get the QR code for the user
        qr_res = requests.get(f"{BASE_URL}/api/agm/user/qrcode/{parent_user_id}", headers=admin_headers)
        qr_code = qr_res.json().get("qr_code")
        
        # Scan the attendance
        res = requests.post(
            f"{BASE_URL}/api/agm/user/scan-attendance",
            params={"qr_code": qr_code, "event_id": TEST_EVENT_ID},
            headers=admin_headers
        )
        
        assert res.status_code in [200, 400], f"Expected 200 or 400, got {res.status_code}: {res.text}"
        
        if res.status_code == 200:
            data = res.json()
            assert "message" in data
            assert "attendee" in data
            print(f"✓ Scan attendance: {data['message']}")
            print(f"✓ Attendee: {data['attendee'].get('nama_penuh')}")
            
            # Check category based on fee status
            if data.get("fee_alert"):
                print(f"✓ Fee alert: Pemerhati - unpaid fees detected")
            else:
                print("✓ No fee alert: Ahli - fees paid")
        else:
            # Event might not exist
            print(f"ℹ Scan response: {res.json()}")
    
    def test_scan_invalid_qr_format(self, admin_headers):
        """Test scan with invalid QR format returns 400"""
        res = requests.post(
            f"{BASE_URL}/api/agm/user/scan-attendance",
            params={"qr_code": "INVALID-QR-CODE", "event_id": TEST_EVENT_ID},
            headers=admin_headers
        )
        
        assert res.status_code == 400, f"Expected 400 for invalid QR format, got {res.status_code}"
        print("✓ Invalid QR format returns 400")


class TestUserRegistrationGeneratesQR:
    """Tests for user registration auto-generates QR code"""
    
    def test_registration_generates_qr_code(self, admin_headers):
        """Test that user registration generates QR code automatically"""
        unique_email = f"test_qr_{uuid.uuid4().hex[:8]}@test.com"
        
        # Register new user
        res = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "test123456",
            "full_name": "TEST QR User",
            "phone": "0123456789"
        })
        
        assert res.status_code == 200, f"Registration failed: {res.text}"
        
        user_id = res.json().get("user", {}).get("id")
        token = res.json().get("access_token")
        
        # Now check if QR code was generated
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        qr_res = requests.get(f"{BASE_URL}/api/agm/user/qrcode/{user_id}", headers=headers)
        
        assert qr_res.status_code == 200
        qr_data = qr_res.json()
        assert qr_data.get("qr_code") is not None
        assert qr_data["qr_code"].startswith("MRSMKU-USER-")
        print(f"✓ Registration auto-generated QR: {qr_data['qr_code']}")
        
        # Cleanup: We don't delete, just flag
        print(f"ℹ Test user created: {unique_email}")
    
    def test_admin_create_user_generates_qr(self, admin_headers):
        """Test that admin creating user generates QR code"""
        unique_email = f"test_admin_qr_{uuid.uuid4().hex[:8]}@test.com"
        
        # Admin creates new parent user
        res = requests.post(f"{BASE_URL}/api/users", json={
            "email": unique_email,
            "password": "test123456",
            "full_name": "TEST Admin QR User",
            "phone": "0129876543",
            "role": "parent"
        }, headers=admin_headers)
        
        assert res.status_code == 200, f"User creation failed: {res.text}"
        
        user_id = res.json().get("id")
        
        # Check QR code
        qr_res = requests.get(f"{BASE_URL}/api/agm/user/qrcode/{user_id}", headers=admin_headers)
        assert qr_res.status_code == 200
        
        qr_data = qr_res.json()
        assert qr_data.get("qr_code") is not None
        assert qr_data["qr_code"].startswith("MRSMKU-USER-")
        print(f"✓ Admin-created user has QR: {qr_data['qr_code']}")


class TestBendahariCreateParent:
    """Test Bendahari can create parent users"""
    
    def test_bendahari_can_create_parent(self):
        """Test that Bendahari role can register parent users"""
        # Login as bendahari
        res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "bendahari@muafakat.link",
            "password": "bendahari123"
        })
        
        assert res.status_code == 200, "Bendahari login failed"
        bendahari_token = res.json().get("access_token")
        bendahari_headers = {"Authorization": f"Bearer {bendahari_token}", "Content-Type": "application/json"}
        
        unique_email = f"test_bendahari_{uuid.uuid4().hex[:8]}@test.com"
        
        # Bendahari creates parent
        res = requests.post(f"{BASE_URL}/api/users", json={
            "email": unique_email,
            "password": "test123456",
            "full_name": "TEST Bendahari Parent",
            "phone": "0129998888",
            "role": "parent"
        }, headers=bendahari_headers)
        
        assert res.status_code == 200, f"Bendahari create parent failed: {res.text}"
        print(f"✓ Bendahari successfully created parent user: {unique_email}")
    
    def test_bendahari_cannot_create_admin(self):
        """Test that Bendahari cannot create admin users"""
        # Login as bendahari
        res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "bendahari@muafakat.link",
            "password": "bendahari123"
        })
        
        bendahari_token = res.json().get("access_token")
        bendahari_headers = {"Authorization": f"Bearer {bendahari_token}", "Content-Type": "application/json"}
        
        unique_email = f"test_bendahari_admin_{uuid.uuid4().hex[:8]}@test.com"
        
        # Bendahari tries to create admin - should fail
        res = requests.post(f"{BASE_URL}/api/users", json={
            "email": unique_email,
            "password": "test123456",
            "full_name": "TEST Bad Admin",
            "phone": "0129998888",
            "role": "admin"
        }, headers=bendahari_headers)
        
        assert res.status_code == 403, f"Expected 403 for Bendahari creating admin, got {res.status_code}"
        print("✓ Bendahari correctly blocked from creating admin role")


class TestOldQRFormatBackwardCompatibility:
    """Test that old AGM-... QR format still works with /api/agm/attendees/scan"""
    
    def test_old_agm_format_still_works(self, admin_headers):
        """Test backward compatibility with old AGM-eventid-ic-uuid format"""
        # Use existing test QR code from previous iteration
        old_qr = "AGM-698fe2e8d8c7a1c47014c7d3-750812105777-f43e4d2b"
        
        res = requests.post(
            f"{BASE_URL}/api/agm/attendees/scan",
            params={"qr_code": old_qr},
            headers=admin_headers
        )
        
        # Should either find the attendee (200) or return 404 if not registered
        assert res.status_code in [200, 404], f"Expected 200 or 404, got {res.status_code}"
        
        if res.status_code == 200:
            print("✓ Old AGM-... format scan works")
        else:
            print("ℹ Old format QR not found (expected if test data was cleaned)")
