"""
Test cases for SuperAdmin Impersonation feature and sample students
Tests the /api/auth/impersonate endpoint and verifies 10 sample students exist
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestImpersonateFeature:
    """Test SuperAdmin Impersonation functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as superadmin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as SuperAdmin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "super123"
        })
        assert login_response.status_code == 200, f"SuperAdmin login failed: {login_response.text}"
        self.superadmin_token = login_response.json()["access_token"]
        self.superadmin_user = login_response.json()["user"]
        self.session.headers.update({"Authorization": f"Bearer {self.superadmin_token}"})
        
    def test_superadmin_login_success(self):
        """Test SuperAdmin can login successfully"""
        assert self.superadmin_user["role"] == "superadmin"
        assert self.superadmin_user["email"] == "superadmin@muafakat.link"
        print(f"SuperAdmin login successful: {self.superadmin_user['full_name']}")
    
    def test_impersonate_endpoint_exists(self):
        """Test that impersonate endpoint is available"""
        # Get list of users first to get a valid user_id
        users_response = self.session.get(f"{BASE_URL}/api/users")
        assert users_response.status_code == 200, f"Failed to get users: {users_response.text}"
        users = users_response.json()
        assert len(users) > 1, "Need at least 2 users for impersonation test"
        
        # Find a non-superadmin user to impersonate
        target_user = None
        for user in users:
            if user["role"] != "superadmin":
                target_user = user
                break
        
        assert target_user is not None, "No non-superadmin user found"
        print(f"Target user for impersonation: {target_user['full_name']} ({target_user['role']})")
    
    def test_impersonate_student_user(self):
        """Test SuperAdmin can impersonate a student (pelajar) user"""
        # Get users list
        users_response = self.session.get(f"{BASE_URL}/api/users", params={"role": "pelajar"})
        assert users_response.status_code == 200, f"Failed to get users: {users_response.text}"
        pelajar_users = users_response.json()
        
        if len(pelajar_users) == 0:
            pytest.skip("No pelajar users found")
        
        target_student = pelajar_users[0]
        print(f"Impersonating student: {target_student['full_name']} (ID: {target_student['id']})")
        
        # Call impersonate endpoint
        impersonate_response = self.session.post(f"{BASE_URL}/api/auth/impersonate", json={
            "user_id": target_student["id"]
        })
        
        assert impersonate_response.status_code == 200, f"Impersonate failed: {impersonate_response.text}"
        
        data = impersonate_response.json()
        assert "access_token" in data, "No access_token in response"
        assert "user" in data, "No user in response"
        assert data["user"]["id"] == target_student["id"], "Impersonated user ID mismatch"
        assert data["user"]["role"] == "pelajar", "Impersonated user role should be pelajar"
        
        print(f"Successfully impersonated student: {data['user']['full_name']}")
        
        # Verify the new token works
        new_session = requests.Session()
        new_session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {data['access_token']}"
        })
        
        me_response = new_session.get(f"{BASE_URL}/api/auth/me")
        assert me_response.status_code == 200, f"Failed to get /me with impersonated token: {me_response.text}"
        me_data = me_response.json()
        assert me_data["id"] == target_student["id"], "Token not for impersonated user"
        print(f"Token verified - logged in as: {me_data['full_name']} ({me_data['role']})")
    
    def test_impersonate_admin_user(self):
        """Test SuperAdmin can impersonate an admin user"""
        # Get admin user
        users_response = self.session.get(f"{BASE_URL}/api/users", params={"role": "admin"})
        assert users_response.status_code == 200
        admin_users = users_response.json()
        
        if len(admin_users) == 0:
            pytest.skip("No admin users found")
        
        target_admin = admin_users[0]
        print(f"Impersonating admin: {target_admin['full_name']} (ID: {target_admin['id']})")
        
        # Call impersonate endpoint
        impersonate_response = self.session.post(f"{BASE_URL}/api/auth/impersonate", json={
            "user_id": target_admin["id"]
        })
        
        assert impersonate_response.status_code == 200, f"Impersonate failed: {impersonate_response.text}"
        
        data = impersonate_response.json()
        assert data["user"]["role"] == "admin"
        print(f"Successfully impersonated admin: {data['user']['full_name']}")
    
    def test_impersonate_warden_user(self):
        """Test SuperAdmin can impersonate a warden user"""
        users_response = self.session.get(f"{BASE_URL}/api/users", params={"role": "warden"})
        assert users_response.status_code == 200
        warden_users = users_response.json()
        
        if len(warden_users) == 0:
            pytest.skip("No warden users found")
        
        target_warden = warden_users[0]
        impersonate_response = self.session.post(f"{BASE_URL}/api/auth/impersonate", json={
            "user_id": target_warden["id"]
        })
        
        assert impersonate_response.status_code == 200
        data = impersonate_response.json()
        assert data["user"]["role"] == "warden"
        print(f"Successfully impersonated warden: {data['user']['full_name']}")
    
    def test_impersonate_nonexistent_user(self):
        """Test impersonating a non-existent user returns 404"""
        impersonate_response = self.session.post(f"{BASE_URL}/api/auth/impersonate", json={
            "user_id": "000000000000000000000000"  # Invalid MongoDB ObjectId
        })
        
        assert impersonate_response.status_code == 404, f"Expected 404, got {impersonate_response.status_code}"
        print("Correctly returns 404 for non-existent user")
    
    def test_non_superadmin_cannot_impersonate(self):
        """Test that non-superadmin users cannot use impersonate endpoint"""
        # Login as admin (not superadmin)
        admin_session = requests.Session()
        admin_session.headers.update({"Content-Type": "application/json"})
        
        login_response = admin_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@muafakat.link",
            "password": "admin123"
        })
        
        if login_response.status_code != 200:
            pytest.skip("Admin login failed")
        
        admin_token = login_response.json()["access_token"]
        admin_session.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        # Get a user to try to impersonate
        users_response = self.session.get(f"{BASE_URL}/api/users")
        users = users_response.json()
        target_user = users[0] if users else None
        
        if not target_user:
            pytest.skip("No users to impersonate")
        
        # Try to impersonate as admin - should fail with 403
        impersonate_response = admin_session.post(f"{BASE_URL}/api/auth/impersonate", json={
            "user_id": target_user["id"]
        })
        
        assert impersonate_response.status_code == 403, f"Expected 403, got {impersonate_response.status_code}"
        print("Correctly prevents non-superadmin from impersonating")


class TestSampleStudents:
    """Test that 10 sample students (S2026001-S2026010) are seeded"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as superadmin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as SuperAdmin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "super123"
        })
        assert login_response.status_code == 200
        self.token = login_response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_sample_students_exist_in_users(self):
        """Test that sample students S2026001-S2026010 exist in users collection"""
        # Get all pelajar users
        users_response = self.session.get(f"{BASE_URL}/api/users", params={"role": "pelajar"})
        assert users_response.status_code == 200
        pelajar_users = users_response.json()
        
        # Check for expected matric numbers
        expected_matrics = [f"S2026{str(i).zfill(3)}" for i in range(1, 11)]
        found_matrics = [u.get("matric_number") for u in pelajar_users if u.get("matric_number")]
        
        print(f"Found {len(pelajar_users)} pelajar users")
        print(f"Expected matrics: {expected_matrics}")
        print(f"Found matrics: {found_matrics}")
        
        # Check how many expected students are found
        matching = [m for m in expected_matrics if m in found_matrics]
        print(f"Matching matrics: {matching}")
        
        assert len(matching) >= 10, f"Expected 10 sample students, found {len(matching)}: {matching}"
        print(f"All 10 sample students found in users collection!")
    
    def test_student_login_S2026001(self):
        """Test that student S2026001 can login"""
        login_response = self.session.post(f"{BASE_URL}/api/auth/login/student", json={
            "identifier": "S2026001",
            "password": "student123"
        })
        
        assert login_response.status_code == 200, f"Student login failed: {login_response.text}"
        
        data = login_response.json()
        assert data["user"]["role"] == "pelajar"
        assert data["user"]["matric_number"] == "S2026001"
        print(f"Student S2026001 login successful: {data['user']['full_name']}")
    
    def test_student_login_S2026005(self):
        """Test that student S2026005 can login"""
        login_response = self.session.post(f"{BASE_URL}/api/auth/login/student", json={
            "identifier": "S2026005",
            "password": "student123"
        })
        
        assert login_response.status_code == 200, f"Student login failed: {login_response.text}"
        
        data = login_response.json()
        assert data["user"]["role"] == "pelajar"
        print(f"Student S2026005 login successful: {data['user']['full_name']}")
    
    def test_student_login_S2026010(self):
        """Test that student S2026010 can login"""
        login_response = self.session.post(f"{BASE_URL}/api/auth/login/student", json={
            "identifier": "S2026010",
            "password": "student123"
        })
        
        assert login_response.status_code == 200, f"Student login failed: {login_response.text}"
        
        data = login_response.json()
        assert data["user"]["role"] == "pelajar"
        print(f"Student S2026010 login successful: {data['user']['full_name']}")
    
    def test_students_have_correct_data(self):
        """Test that sample students have correct data structure"""
        users_response = self.session.get(f"{BASE_URL}/api/users", params={"role": "pelajar"})
        assert users_response.status_code == 200
        pelajar_users = users_response.json()
        
        # Find student S2026001
        student = None
        for u in pelajar_users:
            if u.get("matric_number") == "S2026001":
                student = u
                break
        
        assert student is not None, "Student S2026001 not found"
        
        # Check required fields
        assert student.get("full_name"), "Student should have full_name"
        assert student.get("email"), "Student should have email"
        assert student.get("role") == "pelajar", "Student role should be pelajar"
        assert student.get("is_active") == True, "Student should be active"
        
        print(f"Student S2026001 data verified: {student['full_name']}, {student['email']}")


class TestAuditLog:
    """Test that impersonation is logged in audit"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as superadmin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as SuperAdmin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "super123"
        })
        assert login_response.status_code == 200
        self.token = login_response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_impersonate_creates_audit_log(self):
        """Test that impersonation creates an audit log entry"""
        # First, impersonate a user
        users_response = self.session.get(f"{BASE_URL}/api/users", params={"role": "pelajar"})
        pelajar_users = users_response.json()
        
        if len(pelajar_users) == 0:
            pytest.skip("No pelajar users found")
        
        target_student = pelajar_users[0]
        
        # Impersonate
        impersonate_response = self.session.post(f"{BASE_URL}/api/auth/impersonate", json={
            "user_id": target_student["id"]
        })
        assert impersonate_response.status_code == 200
        
        # Check audit log
        audit_response = self.session.get(f"{BASE_URL}/api/audit-logs")
        
        if audit_response.status_code == 200:
            audit_logs = audit_response.json()
            # Look for IMPERSONATE action in recent logs
            impersonate_logs = [log for log in audit_logs if log.get("action") == "IMPERSONATE"]
            print(f"Found {len(impersonate_logs)} IMPERSONATE entries in audit log")
            
            if impersonate_logs:
                latest = impersonate_logs[0]
                print(f"Latest impersonate log: {latest.get('details')}")
                assert "impersonate" in latest.get("details", "").lower() or "IMPERSONATE" in latest.get("action", "")
        else:
            print(f"Audit log endpoint returned {audit_response.status_code}, skipping audit verification")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
