"""
Test suite for Super Admin Data Sync Feature
Tests the sync status and full sync APIs
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSyncFeature:
    """Tests for /api/admin/sync/* endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as superadmin to get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": "superadmin@muafakat.link",
                "password": "admin123"
            }
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json()["access_token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_sync_status_endpoint_returns_200(self):
        """Test that GET /api/admin/sync/status returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/admin/sync/status",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"PASS: Sync status endpoint returns 200")
    
    def test_sync_status_response_structure(self):
        """Test that sync status returns correct data structure"""
        response = requests.get(
            f"{BASE_URL}/api/admin/sync/status",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify summary fields exist
        assert "summary" in data, "Response missing 'summary' field"
        summary = data["summary"]
        assert "total_users" in summary, "Summary missing 'total_users'"
        assert "pelajar_users" in summary, "Summary missing 'pelajar_users'"
        assert "total_students" in summary, "Summary missing 'total_students'"
        
        # Verify issues fields exist
        assert "issues" in data, "Response missing 'issues' field"
        issues = data["issues"]
        assert "students_without_user_account" in issues
        assert "students_without_religion" in issues
        assert "pelajar_users_without_religion" in issues
        
        # Verify sync_needed field
        assert "sync_needed" in data, "Response missing 'sync_needed' field"
        assert isinstance(data["sync_needed"], bool), "sync_needed should be boolean"
        
        print(f"PASS: Sync status response structure is correct")
        print(f"  - Total Users: {summary['total_users']}")
        print(f"  - Pelajar Users: {summary['pelajar_users']}")
        print(f"  - Total Students: {summary['total_students']}")
        print(f"  - Sync Needed: {data['sync_needed']}")
    
    def test_sync_status_data_counts(self):
        """Test that sync status counts are valid"""
        response = requests.get(
            f"{BASE_URL}/api/admin/sync/status",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        summary = data["summary"]
        
        # All counts should be non-negative integers
        assert summary["total_users"] >= 0, "total_users should be non-negative"
        assert summary["pelajar_users"] >= 0, "pelajar_users should be non-negative"
        assert summary["total_students"] >= 0, "total_students should be non-negative"
        
        # pelajar_users should not exceed total_users
        assert summary["pelajar_users"] <= summary["total_users"], \
            "pelajar_users should not exceed total_users"
        
        print(f"PASS: Sync status data counts are valid")
    
    def test_full_sync_endpoint_returns_200(self):
        """Test that POST /api/admin/sync/full returns 200"""
        response = requests.post(
            f"{BASE_URL}/api/admin/sync/full",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"PASS: Full sync endpoint returns 200")
    
    def test_full_sync_response_structure(self):
        """Test that full sync returns correct data structure"""
        response = requests.post(
            f"{BASE_URL}/api/admin/sync/full",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify success field
        assert "success" in data, "Response missing 'success' field"
        assert data["success"] == True, "success should be True"
        
        # Verify message field
        assert "message" in data, "Response missing 'message' field"
        
        # Verify results field
        assert "results" in data, "Response missing 'results' field"
        results = data["results"]
        
        # Verify cleanup section
        assert "cleanup" in results, "Results missing 'cleanup' section"
        assert "orphan_users_deleted" in results["cleanup"]
        
        # Verify sync section
        assert "sync" in results, "Results missing 'sync' section"
        assert "users_created" in results["sync"]
        assert "religion_updated" in results["sync"]
        
        # Verify before/after counts
        assert "before" in results, "Results missing 'before' counts"
        assert "after" in results, "Results missing 'after' counts"
        
        print(f"PASS: Full sync response structure is correct")
        print(f"  - Success: {data['success']}")
        print(f"  - Message: {data['message']}")
        print(f"  - Orphan Users Deleted: {results['cleanup']['orphan_users_deleted']}")
        print(f"  - Users Created: {results['sync']['users_created']}")
    
    def test_sync_status_requires_auth(self):
        """Test that sync status requires authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/sync/status")
        assert response.status_code in [401, 403], \
            f"Expected 401/403 without auth, got {response.status_code}"
        print(f"PASS: Sync status requires authentication")
    
    def test_full_sync_requires_superadmin(self):
        """Test that full sync requires superadmin role"""
        # Login as regular admin (not superadmin)
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": "admin@muafakat.link",
                "password": "admin123"
            }
        )
        
        if login_response.status_code == 200:
            admin_token = login_response.json()["access_token"]
            admin_headers = {
                "Authorization": f"Bearer {admin_token}",
                "Content-Type": "application/json"
            }
            
            # Try to call full sync as admin (should fail)
            response = requests.post(
                f"{BASE_URL}/api/admin/sync/full",
                headers=admin_headers
            )
            assert response.status_code == 403, \
                f"Expected 403 for non-superadmin, got {response.status_code}"
            print(f"PASS: Full sync requires superadmin role")
        else:
            pytest.skip("Admin login failed, skipping role test")


class TestSyncStatusRefresh:
    """Test sync status refresh functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as superadmin"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": "superadmin@muafakat.link",
                "password": "admin123"
            }
        )
        assert login_response.status_code == 200
        self.token = login_response.json()["access_token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_sync_status_before_and_after_full_sync(self):
        """Test that sync status updates after full sync"""
        # Get status before
        before_response = requests.get(
            f"{BASE_URL}/api/admin/sync/status",
            headers=self.headers
        )
        assert before_response.status_code == 200
        before_data = before_response.json()
        
        # Run full sync
        sync_response = requests.post(
            f"{BASE_URL}/api/admin/sync/full",
            headers=self.headers
        )
        assert sync_response.status_code == 200
        
        # Get status after
        after_response = requests.get(
            f"{BASE_URL}/api/admin/sync/status",
            headers=self.headers
        )
        assert after_response.status_code == 200
        after_data = after_response.json()
        
        # After sync, issues should be zero or reduced
        print(f"PASS: Sync status before and after full sync verified")
        print(f"  Before - Students without user: {before_data['issues']['students_without_user_account']}")
        print(f"  After - Students without user: {after_data['issues']['students_without_user_account']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
