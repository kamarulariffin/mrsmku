"""
Cleanup Regression Test - Test all refactored module routes after legacy code cleanup
Tests: users, dashboard, fees, payments, reports, hostel, sickbay routes
Verifies that cleanup of 1,130 lines of commented-out legacy code did not break functionality
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPERADMIN_EMAIL = "superadmin@muafakat.link"
SUPERADMIN_PASSWORD = "admin123"  # Based on review request
GURU_EMAIL = "guru@muafakat.link"
GURU_PASSWORD = "guru123"
PARENT_EMAIL = "parent@muafakat.link"
PARENT_PASSWORD = "parent123"
WARDEN_EMAIL = "warden@muafakat.link"
WARDEN_PASSWORD = "warden123"


class TestHealthCheck:
    """Test API health check endpoint"""
    
    def test_health_check(self):
        """Test /api/health returns 200"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200, f"Health check failed: {response.text}"
        data = response.json()
        assert "status" in data or "message" in data, "Response missing status/message"
        print(f"✓ Health check passed: {data}")


class TestAuthentication:
    """Test authentication endpoints"""
    
    def test_superadmin_login(self):
        """Test superadmin login with provided credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPERADMIN_EMAIL, "password": SUPERADMIN_PASSWORD},
            timeout=10
        )
        assert response.status_code == 200, f"Superadmin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "Missing access_token in response"
        assert data.get("user", {}).get("role") == "superadmin", "User role should be superadmin"
        print(f"✓ Superadmin login successful: {data.get('user', {}).get('email')}")
        return data["access_token"]
    
    def test_guru_login(self):
        """Test guru login"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": GURU_EMAIL, "password": GURU_PASSWORD},
            timeout=10
        )
        assert response.status_code == 200, f"Guru login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "Missing access_token"
        print(f"✓ Guru login successful: {data.get('user', {}).get('email')}")
        return data["access_token"]
    
    def test_parent_login(self):
        """Test parent login"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": PARENT_EMAIL, "password": PARENT_PASSWORD},
            timeout=10
        )
        assert response.status_code == 200, f"Parent login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "Missing access_token"
        print(f"✓ Parent login successful: {data.get('user', {}).get('email')}")
        return data["access_token"]
    
    def test_warden_login(self):
        """Test warden login"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": WARDEN_EMAIL, "password": WARDEN_PASSWORD},
            timeout=10
        )
        assert response.status_code == 200, f"Warden login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "Missing access_token"
        print(f"✓ Warden login successful: {data.get('user', {}).get('email')}")
        return data["access_token"]


class TestUsersModule:
    """Test /api/users routes from users.py"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPERADMIN_EMAIL, "password": SUPERADMIN_PASSWORD},
            timeout=10
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip(f"Login failed: {response.text}")
    
    def test_get_users_list(self, admin_token):
        """Test GET /api/users returns user list"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/users", headers=headers, timeout=10)
        assert response.status_code == 200, f"Get users failed: {response.text}"
        data = response.json()
        # Can be list or dict with 'users' key (paginated)
        if isinstance(data, list):
            assert len(data) >= 0, "Should return list of users"
            print(f"✓ GET /api/users returned {len(data)} users")
        else:
            assert "users" in data, "Should have 'users' key for paginated response"
            print(f"✓ GET /api/users returned paginated response with {len(data.get('users', []))} users")


class TestDashboardModule:
    """Test /api/dashboard routes from dashboard.py"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPERADMIN_EMAIL, "password": SUPERADMIN_PASSWORD},
            timeout=10
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Admin login failed")
    
    @pytest.fixture
    def parent_token(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": PARENT_EMAIL, "password": PARENT_PASSWORD},
            timeout=10
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Parent login failed")
    
    def test_admin_dashboard(self, admin_token):
        """Test GET /api/dashboard/admin returns admin dashboard data"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/admin", headers=headers, timeout=10)
        assert response.status_code == 200, f"Admin dashboard failed: {response.text}"
        data = response.json()
        assert "total_students" in data, "Missing total_students"
        assert "total_fees" in data, "Missing total_fees"
        assert "role_counts" in data, "Missing role_counts"
        print(f"✓ Admin dashboard: {data.get('total_students')} students, RM{data.get('total_fees', 0):.2f} fees")
    
    def test_parent_dashboard(self, parent_token):
        """Test GET /api/dashboard/parent returns parent dashboard data"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/parent", headers=headers, timeout=10)
        assert response.status_code == 200, f"Parent dashboard failed: {response.text}"
        data = response.json()
        assert "total_children" in data, "Missing total_children"
        assert "total_fees" in data, "Missing total_fees"
        print(f"✓ Parent dashboard: {data.get('total_children')} children, RM{data.get('outstanding', 0):.2f} outstanding")


class TestFeesModule:
    """Test /api/fees routes from fees.py"""
    
    def test_fee_structure_public(self):
        """Test GET /api/fees/structure - public endpoint, no auth required"""
        response = requests.get(f"{BASE_URL}/api/fees/structure?year=2026", timeout=10)
        assert response.status_code == 200, f"Fee structure failed: {response.text}"
        data = response.json()
        assert "year" in data, "Missing year in response"
        assert "packages" in data, "Missing packages in response"
        print(f"✓ Fee structure: Year {data.get('year')}, {len(data.get('packages', []))} packages")
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPERADMIN_EMAIL, "password": SUPERADMIN_PASSWORD},
            timeout=10
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Login failed")
    
    def test_get_fees_list(self, admin_token):
        """Test GET /api/fees returns fee list"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/fees", headers=headers, timeout=10)
        assert response.status_code == 200, f"Get fees failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Should return list of fees"
        print(f"✓ GET /api/fees returned {len(data)} fee records")


class TestReportsModule:
    """Test /api/reports routes from reports.py"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPERADMIN_EMAIL, "password": SUPERADMIN_PASSWORD},
            timeout=10
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Login failed")
    
    def test_fees_report(self, admin_token):
        """Test GET /api/reports/fees returns fee report"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/reports/fees", headers=headers, timeout=10)
        assert response.status_code == 200, f"Fees report failed: {response.text}"
        data = response.json()
        assert "by_category" in data, "Missing by_category"
        assert "by_status" in data, "Missing by_status"
        print(f"✓ Fees report: {data.get('total_fees', 0)} total fees, categories: {list(data.get('by_category', {}).keys())}")
    
    def test_collection_report(self, admin_token):
        """Test GET /api/reports/collection returns collection report"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/reports/collection", headers=headers, timeout=10)
        assert response.status_code == 200, f"Collection report failed: {response.text}"
        data = response.json()
        assert "monthly_collection" in data, "Missing monthly_collection"
        assert "total_collected" in data, "Missing total_collected"
        print(f"✓ Collection report: RM{data.get('total_collected', 0):.2f} total collected")


class TestHostelModule:
    """Test /api/hostel routes from hostel.py"""
    
    @pytest.fixture
    def warden_token(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": WARDEN_EMAIL, "password": WARDEN_PASSWORD},
            timeout=10
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Warden login failed")
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPERADMIN_EMAIL, "password": SUPERADMIN_PASSWORD},
            timeout=10
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Admin login failed")
    
    def test_hostel_stats(self, admin_token):
        """Test GET /api/hostel/stats returns hostel statistics"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/hostel/stats", headers=headers, timeout=10)
        assert response.status_code == 200, f"Hostel stats failed: {response.text}"
        data = response.json()
        assert "total_students" in data, "Missing total_students"
        assert "in_hostel" in data, "Missing in_hostel"
        print(f"✓ Hostel stats: {data.get('total_students')} total, {data.get('in_hostel')} in hostel")
    
    def test_hostel_records(self, admin_token):
        """Test GET /api/hostel/records returns hostel records"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/hostel/records", headers=headers, timeout=10)
        assert response.status_code == 200, f"Hostel records failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Should return list of records"
        print(f"✓ Hostel records: {len(data)} records found")
    
    def test_hostel_students(self, admin_token):
        """Test GET /api/hostel/students returns student list"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/hostel/students", headers=headers, timeout=10)
        assert response.status_code == 200, f"Hostel students failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Should return list of students"
        print(f"✓ Hostel students: {len(data)} students found")


class TestSickbayModule:
    """Test /api/sickbay routes from sickbay.py"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPERADMIN_EMAIL, "password": SUPERADMIN_PASSWORD},
            timeout=10
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Login failed")
    
    def test_sickbay_stats(self, admin_token):
        """Test GET /api/sickbay/stats returns sickbay statistics"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/sickbay/stats", headers=headers, timeout=10)
        assert response.status_code == 200, f"Sickbay stats failed: {response.text}"
        data = response.json()
        assert "in_sickbay" in data, "Missing in_sickbay"
        assert "today_visits" in data, "Missing today_visits"
        print(f"✓ Sickbay stats: {data.get('in_sickbay')} in sickbay, {data.get('today_visits')} today visits")
    
    def test_sickbay_records(self, admin_token):
        """Test GET /api/sickbay/records returns sickbay records"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/sickbay/records", headers=headers, timeout=10)
        assert response.status_code == 200, f"Sickbay records failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Should return list of records"
        print(f"✓ Sickbay records: {len(data)} records found")


class TestPaymentsModule:
    """Test /api/payments routes from payments.py"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPERADMIN_EMAIL, "password": SUPERADMIN_PASSWORD},
            timeout=10
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Login failed")
    
    def test_get_payments_list(self, admin_token):
        """Test GET /api/payments returns payment list"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/payments", headers=headers, timeout=10)
        assert response.status_code == 200, f"Get payments failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Should return list of payments"
        print(f"✓ GET /api/payments returned {len(data)} payment records")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
