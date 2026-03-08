"""
Test MyDigital ID Feature - Backend API Tests
Tests for MyDigital ID settings endpoints and mock login
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestMyDigitalIDSettings:
    """Test MyDigital ID settings endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def get_superadmin_token(self):
        """Get SuperAdmin auth token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "super123"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("SuperAdmin login failed")
    
    # ===== PUBLIC ENDPOINT TESTS =====
    
    def test_get_mydigitalid_settings_public(self):
        """Test GET /api/settings/mydigitalid - public endpoint"""
        response = self.session.get(f"{BASE_URL}/api/settings/mydigitalid")
        # Should return 200 even without auth (public endpoint for login page)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        # Should have 'enabled' field
        assert "enabled" in data, "Response should contain 'enabled' field"
        print(f"MyDigital ID settings: enabled={data.get('enabled')}")
    
    # ===== AUTHENTICATED ENDPOINT TESTS =====
    
    def test_save_mydigitalid_settings_requires_auth(self):
        """Test POST /api/settings/mydigitalid requires authentication"""
        response = self.session.post(f"{BASE_URL}/api/settings/mydigitalid", json={
            "action": "AUTH_INFO",
            "url": "wss://test.com/ws",
            "nonce": "test123"
        })
        # Should fail without auth
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("POST /api/settings/mydigitalid correctly requires authentication")
    
    def test_delete_mydigitalid_settings_requires_auth(self):
        """Test DELETE /api/settings/mydigitalid requires authentication"""
        response = self.session.delete(f"{BASE_URL}/api/settings/mydigitalid")
        # Should fail without auth
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("DELETE /api/settings/mydigitalid correctly requires authentication")
    
    def test_save_mydigitalid_settings_as_superadmin(self):
        """Test SuperAdmin can save MyDigital ID settings"""
        token = self.get_superadmin_token()
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        settings_payload = {
            "action": "AUTH_INFO_TEST",
            "url": "wss://sso.digital-id.my/wss/mydigitalid",
            "nonce": "testNonceValue123"
        }
        
        response = self.session.post(f"{BASE_URL}/api/settings/mydigitalid", json=settings_payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Response should indicate success"
        print(f"Settings saved successfully: {data}")
        
        # Verify settings were saved by GET
        get_response = self.session.get(f"{BASE_URL}/api/settings/mydigitalid")
        assert get_response.status_code == 200
        saved_data = get_response.json()
        assert saved_data.get("enabled") == True, "Settings should be enabled after save"
        assert saved_data.get("action") == settings_payload["action"], "Action should match"
        assert saved_data.get("url") == settings_payload["url"], "URL should match"
        assert saved_data.get("nonce") == settings_payload["nonce"], "Nonce should match"
        print(f"Settings verified: {saved_data}")
    
    def test_delete_mydigitalid_settings_as_superadmin(self):
        """Test SuperAdmin can delete MyDigital ID settings"""
        token = self.get_superadmin_token()
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # First save settings to ensure there's something to delete
        self.session.post(f"{BASE_URL}/api/settings/mydigitalid", json={
            "action": "DELETE_TEST",
            "url": "wss://test.com",
            "nonce": "delete123"
        })
        
        # Delete settings
        response = self.session.delete(f"{BASE_URL}/api/settings/mydigitalid")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Response should indicate success"
        print(f"Settings deleted: {data}")
        
        # Verify settings are disabled
        get_response = self.session.get(f"{BASE_URL}/api/settings/mydigitalid")
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data.get("enabled") == False, "Settings should be disabled after delete"
        print(f"Settings after delete: {get_data}")
    
    def test_non_superadmin_cannot_save_settings(self):
        """Test non-SuperAdmin users cannot save MyDigital ID settings"""
        # Login as regular admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@muafakat.link",
            "password": "admin123"
        })
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        
        token = response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Try to save settings
        save_response = self.session.post(f"{BASE_URL}/api/settings/mydigitalid", json={
            "action": "UNAUTHORIZED",
            "url": "wss://test.com",
            "nonce": "test"
        })
        # Should be forbidden for non-superadmin
        assert save_response.status_code == 403, f"Expected 403 for non-superadmin, got {save_response.status_code}"
        print("Non-SuperAdmin correctly blocked from saving settings")


class TestMyDigitalIDMockLogin:
    """Test MyDigital ID mock login endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_mock_login_returns_token(self):
        """Test /api/auth/mydigitalid/mock-login returns valid token"""
        response = self.session.post(f"{BASE_URL}/api/auth/mydigitalid/mock-login")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Should return same structure as regular login
        assert "access_token" in data, "Response should contain access_token"
        assert "token_type" in data, "Response should contain token_type"
        assert "user" in data, "Response should contain user data"
        
        user = data["user"]
        assert user.get("email") == "demo.mydigitalid@muafakat.link", "Should return demo MyDigital ID user"
        assert user.get("role") == "parent", "Demo user should have parent role"
        print(f"Mock login successful: {user.get('full_name')}")
    
    def test_mock_login_token_is_valid(self):
        """Test that token from mock login can access protected endpoints"""
        # Get token from mock login
        login_response = self.session.post(f"{BASE_URL}/api/auth/mydigitalid/mock-login")
        assert login_response.status_code == 200
        
        token = login_response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Try to access protected endpoint
        me_response = self.session.get(f"{BASE_URL}/api/auth/me")
        assert me_response.status_code == 200, f"Token should be valid, got {me_response.status_code}"
        
        user = me_response.json()
        assert user.get("email") == "demo.mydigitalid@muafakat.link"
        print(f"Token valid - user: {user.get('full_name')}")
    
    def test_mock_login_creates_demo_user(self):
        """Test that mock login creates demo user if not exists"""
        response = self.session.post(f"{BASE_URL}/api/auth/mydigitalid/mock-login")
        assert response.status_code == 200
        
        data = response.json()
        user = data.get("user", {})
        
        # Verify user properties
        assert user.get("full_name") == "Pengguna Demo MyDigital ID"
        assert user.get("role") == "parent"
        assert user.get("email") == "demo.mydigitalid@muafakat.link"
        print(f"Demo user created/retrieved: {user}")
    
    def test_mock_login_can_access_dashboard(self):
        """Test that mock login user can access parent dashboard"""
        # Get token from mock login
        login_response = self.session.post(f"{BASE_URL}/api/auth/mydigitalid/mock-login")
        assert login_response.status_code == 200
        
        token = login_response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Access parent dashboard
        dashboard_response = self.session.get(f"{BASE_URL}/api/dashboard/parent")
        assert dashboard_response.status_code == 200, f"Should access parent dashboard, got {dashboard_response.status_code}"
        
        data = dashboard_response.json()
        assert "total_children" in data, "Dashboard should return expected data"
        print(f"Dashboard accessible: {data}")


class TestMyDigitalIDIntegration:
    """Integration tests for MyDigital ID feature flow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_full_mydigitalid_flow(self):
        """Test complete MyDigital ID flow: configure -> enable -> login -> disable"""
        # 1. SuperAdmin configures MyDigital ID
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "super123"
        })
        assert login_response.status_code == 200
        superadmin_token = login_response.json().get("access_token")
        
        # Save settings
        self.session.headers.update({"Authorization": f"Bearer {superadmin_token}"})
        save_response = self.session.post(f"{BASE_URL}/api/settings/mydigitalid", json={
            "action": "INTEGRATION_TEST",
            "url": "wss://integration-test.com/ws",
            "nonce": "integrationNonce123"
        })
        assert save_response.status_code == 200
        print("Step 1: Settings configured by SuperAdmin")
        
        # 2. Check settings are enabled (public endpoint)
        self.session.headers.pop("Authorization", None)  # Remove auth for public check
        get_response = self.session.get(f"{BASE_URL}/api/settings/mydigitalid")
        assert get_response.status_code == 200
        assert get_response.json().get("enabled") == True
        print("Step 2: Settings are enabled (visible to login page)")
        
        # 3. User logs in via MyDigital ID
        mock_login_response = self.session.post(f"{BASE_URL}/api/auth/mydigitalid/mock-login")
        assert mock_login_response.status_code == 200
        user_token = mock_login_response.json().get("access_token")
        user = mock_login_response.json().get("user")
        assert user.get("role") == "parent"
        print(f"Step 3: User logged in via MyDigital ID: {user.get('full_name')}")
        
        # 4. User can access dashboard
        self.session.headers.update({"Authorization": f"Bearer {user_token}"})
        dashboard_response = self.session.get(f"{BASE_URL}/api/dashboard/parent")
        assert dashboard_response.status_code == 200
        print("Step 4: User can access parent dashboard")
        
        # 5. SuperAdmin disables MyDigital ID
        self.session.headers.update({"Authorization": f"Bearer {superadmin_token}"})
        delete_response = self.session.delete(f"{BASE_URL}/api/settings/mydigitalid")
        assert delete_response.status_code == 200
        print("Step 5: SuperAdmin disabled MyDigital ID")
        
        # 6. Verify settings are disabled
        self.session.headers.pop("Authorization", None)
        final_get = self.session.get(f"{BASE_URL}/api/settings/mydigitalid")
        assert final_get.json().get("enabled") == False
        print("Step 6: Settings confirmed disabled")
        
        print("\n=== Full MyDigital ID flow completed successfully ===")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
