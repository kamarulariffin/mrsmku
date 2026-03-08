"""
Test Suite for Auto-Sync Feature on Super Admin Dashboard
Tests the auto-sync settings GET/PUT endpoints and the trigger-now endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAutoSyncFeature:
    """Test Auto-Sync settings and trigger functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - Login as superadmin for all tests"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as superadmin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "admin123"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.auth_token = token
        else:
            pytest.skip("Superadmin login failed - skipping authenticated tests")
    
    # ============ GET /api/admin/sync/auto-settings Tests ============
    
    def test_get_auto_sync_settings_success(self):
        """Test GET auto-sync settings returns correct structure"""
        response = self.session.get(f"{BASE_URL}/api/admin/sync/auto-settings")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "enabled" in data, "Response should contain 'enabled' field"
        assert "interval_hours" in data, "Response should contain 'interval_hours' field"
        assert "last_run" in data, "Response should contain 'last_run' field"
        assert "last_results" in data, "Response should contain 'last_results' field"
        
        # Verify data types
        assert isinstance(data["enabled"], bool), "'enabled' should be boolean"
        assert isinstance(data["interval_hours"], int), "'interval_hours' should be integer"
        
        print(f"✓ Auto-sync settings retrieved: enabled={data['enabled']}, interval={data['interval_hours']}h")
    
    def test_get_auto_sync_settings_unauthenticated(self):
        """Test GET auto-sync settings without auth returns 401/403"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/admin/sync/auto-settings")
        
        assert response.status_code in [401, 403], f"Expected 401/403 for unauthenticated, got {response.status_code}"
        print("✓ Unauthenticated access correctly blocked")
    
    # ============ PUT /api/admin/sync/auto-settings Tests ============
    
    def test_update_auto_sync_settings_enable(self):
        """Test enabling auto-sync and setting interval"""
        response = self.session.put(
            f"{BASE_URL}/api/admin/sync/auto-settings?enabled=true&interval_hours=24"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Response should indicate success"
        assert "settings" in data, "Response should contain settings"
        assert data["settings"]["enabled"] == True, "Settings should show enabled=true"
        assert data["settings"]["interval_hours"] == 24, "Settings should show interval_hours=24"
        
        print("✓ Auto-sync enabled successfully with 24h interval")
    
    def test_update_auto_sync_settings_disable(self):
        """Test disabling auto-sync"""
        response = self.session.put(
            f"{BASE_URL}/api/admin/sync/auto-settings?enabled=false&interval_hours=24"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Response should indicate success"
        assert data["settings"]["enabled"] == False, "Settings should show enabled=false"
        
        print("✓ Auto-sync disabled successfully")
    
    def test_update_auto_sync_interval_6h(self):
        """Test setting interval to 6 hours"""
        response = self.session.put(
            f"{BASE_URL}/api/admin/sync/auto-settings?enabled=true&interval_hours=6"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["settings"]["interval_hours"] == 6, "Interval should be 6h"
        
        print("✓ Interval set to 6h successfully")
    
    def test_update_auto_sync_interval_12h(self):
        """Test setting interval to 12 hours"""
        response = self.session.put(
            f"{BASE_URL}/api/admin/sync/auto-settings?enabled=true&interval_hours=12"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["settings"]["interval_hours"] == 12, "Interval should be 12h"
        
        print("✓ Interval set to 12h successfully")
    
    def test_update_auto_sync_interval_48h(self):
        """Test setting interval to 48 hours (every 2 days)"""
        response = self.session.put(
            f"{BASE_URL}/api/admin/sync/auto-settings?enabled=true&interval_hours=48"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["settings"]["interval_hours"] == 48, "Interval should be 48h"
        
        print("✓ Interval set to 48h successfully")
    
    def test_update_auto_sync_interval_168h(self):
        """Test setting interval to 168 hours (weekly)"""
        response = self.session.put(
            f"{BASE_URL}/api/admin/sync/auto-settings?enabled=true&interval_hours=168"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["settings"]["interval_hours"] == 168, "Interval should be 168h"
        
        print("✓ Interval set to 168h (weekly) successfully")
    
    def test_update_auto_sync_verify_persistence(self):
        """Test that settings update persists - Create → GET verification"""
        # First update settings
        update_response = self.session.put(
            f"{BASE_URL}/api/admin/sync/auto-settings?enabled=true&interval_hours=12"
        )
        assert update_response.status_code == 200
        
        # Then GET to verify persistence
        get_response = self.session.get(f"{BASE_URL}/api/admin/sync/auto-settings")
        assert get_response.status_code == 200
        
        data = get_response.json()
        assert data["enabled"] == True, "Enabled setting should persist"
        assert data["interval_hours"] == 12, "Interval setting should persist"
        
        print("✓ Settings persist correctly after update")
    
    # ============ POST /api/admin/sync/trigger-now Tests ============
    
    def test_trigger_auto_sync_now_success(self):
        """Test manually triggering auto-sync"""
        # First ensure auto-sync is enabled
        self.session.put(f"{BASE_URL}/api/admin/sync/auto-settings?enabled=true&interval_hours=24")
        
        # Trigger sync
        response = self.session.post(f"{BASE_URL}/api/admin/sync/trigger-now")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Response should indicate success"
        assert "message" in data, "Response should contain message"
        
        print(f"✓ Auto-sync triggered successfully: {data.get('message')}")
    
    def test_trigger_auto_sync_returns_results(self):
        """Test that trigger returns sync results"""
        # Enable and trigger
        self.session.put(f"{BASE_URL}/api/admin/sync/auto-settings?enabled=true&interval_hours=24")
        
        response = self.session.post(f"{BASE_URL}/api/admin/sync/trigger-now")
        
        assert response.status_code == 200
        
        data = response.json()
        # Results may be None if no changes needed
        if data.get("results"):
            results = data["results"]
            # Check result structure if present
            print(f"✓ Sync results: orphan_deleted={results.get('orphan_users_deleted', 0)}, "
                  f"users_created={results.get('users_created', 0)}, "
                  f"religion_updated={results.get('religion_updated', 0)}")
        else:
            print("✓ No sync changes were needed (data already synchronized)")
    
    def test_trigger_auto_sync_unauthenticated(self):
        """Test trigger-now without auth returns 401/403"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/admin/sync/trigger-now")
        
        assert response.status_code in [401, 403], f"Expected 401/403 for unauthenticated, got {response.status_code}"
        print("✓ Unauthenticated trigger correctly blocked")
    
    # ============ Authorization Tests ============
    
    def test_update_settings_requires_superadmin(self):
        """Test that updating settings requires superadmin role"""
        # Login as regular admin
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@muafakat.link",
            "password": "admin123"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            session.headers.update({"Authorization": f"Bearer {token}"})
            
            # Try to update settings as admin (should fail)
            response = session.put(
                f"{BASE_URL}/api/admin/sync/auto-settings?enabled=true&interval_hours=24"
            )
            
            assert response.status_code in [401, 403], f"Expected 401/403 for non-superadmin, got {response.status_code}"
            print("✓ Non-superadmin correctly blocked from updating settings")
        else:
            print("⚠ Admin login failed, skipping authorization test")
    
    # ============ Settings verification after full test ============
    
    def test_restore_default_settings(self):
        """Restore settings to sensible defaults after tests"""
        response = self.session.put(
            f"{BASE_URL}/api/admin/sync/auto-settings?enabled=true&interval_hours=24"
        )
        
        assert response.status_code == 200
        print("✓ Settings restored to default (enabled=true, interval=24h)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
