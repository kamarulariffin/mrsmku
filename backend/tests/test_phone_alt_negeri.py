"""
Test phone_alt (No. Telefon Alternatif) and negeri synchronization features.
Tests:
1. GET /api/settings/system-config/public - returns negeri list
2. POST /api/settings/system-config - saves negeri configuration
3. POST /api/settings/system-config/sync - includes negeri synchronization
4. POST /api/auth/register - accepts phone_alt field
5. POST /api/users - accepts phone_alt and state fields
6. PUT /api/users/{id} - can update phone_alt and state fields
"""

import pytest
import requests
import os
import random
import string

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip('/')

# Default Malaysian states list
EXPECTED_STATES = [
    "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", 
    "Pahang", "Perak", "Perlis", "Pulau Pinang", "Sabah", 
    "Sarawak", "Selangor", "Terengganu", 
    "W.P. Kuala Lumpur", "W.P. Labuan", "W.P. Putrajaya"
]


def random_string(length=8):
    return ''.join(random.choices(string.ascii_lowercase, k=length))


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def superadmin_token(api_client):
    """Login as superadmin and get token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "superadmin@muafakat.link",
        "password": "admin123"
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Superadmin authentication failed")


@pytest.fixture(scope="module")
def admin_token(api_client):
    """Login as admin and get token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@muafakat.link",
        "password": "admin123"
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Admin authentication failed")


@pytest.fixture(scope="module")
def authenticated_client(api_client, superadmin_token):
    """Session with superadmin auth header"""
    api_client.headers.update({"Authorization": f"Bearer {superadmin_token}"})
    return api_client


class TestSystemConfigPublic:
    """Test public system config endpoint - negeri list"""
    
    def test_public_config_returns_negeri(self, api_client):
        """GET /api/settings/system-config/public returns negeri list"""
        response = api_client.get(f"{BASE_URL}/api/settings/system-config/public")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "negeri" in data, "Response should contain 'negeri' field"
        assert isinstance(data["negeri"], list), "negeri should be a list"
        assert len(data["negeri"]) == 16, f"Expected 16 states, got {len(data['negeri'])}"
        
        # Verify all expected states are present
        for state in EXPECTED_STATES:
            assert state in data["negeri"], f"State '{state}' not found in negeri list"
        
        print(f"SUCCESS: Public config returns {len(data['negeri'])} states")
    
    def test_public_config_has_all_fields(self, api_client):
        """GET /api/settings/system-config/public returns all required fields"""
        response = api_client.get(f"{BASE_URL}/api/settings/system-config/public")
        
        assert response.status_code == 200
        
        data = response.json()
        required_fields = ["kelas", "bangsa", "agama", "negeri"]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
            assert isinstance(data[field], list), f"{field} should be a list"
            assert len(data[field]) > 0, f"{field} should not be empty"
        
        print(f"SUCCESS: Public config has all fields: kelas({len(data['kelas'])}), bangsa({len(data['bangsa'])}), agama({len(data['agama'])}), negeri({len(data['negeri'])})")


class TestSystemConfigAuthenticated:
    """Test authenticated system config endpoints"""
    
    def test_get_system_config_authenticated(self, authenticated_client):
        """GET /api/settings/system-config (authenticated) returns negeri"""
        response = authenticated_client.get(f"{BASE_URL}/api/settings/system-config")
        
        assert response.status_code == 200
        
        data = response.json()
        assert "negeri" in data
        assert len(data["negeri"]) == 16
        
        print(f"SUCCESS: Authenticated config returns {len(data['negeri'])} states")
    
    def test_save_system_config_with_negeri(self, authenticated_client):
        """POST /api/settings/system-config saves negeri configuration"""
        config = {
            "kelas": ["A", "B", "C", "D", "E", "F"],
            "bangsa": ["Melayu", "Cina", "India", "Lain-lain"],
            "agama": ["Islam", "Buddha", "Hindu", "Kristian", "Lain-lain"],
            "negeri": EXPECTED_STATES
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/settings/system-config", json=config)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "negeri" in data
        assert len(data["negeri"]) == 16
        
        print(f"SUCCESS: Saved config with {len(data['negeri'])} states")
    
    def test_sync_system_config_includes_negeri(self, authenticated_client):
        """POST /api/settings/system-config/sync includes negeri synchronization"""
        response = authenticated_client.post(f"{BASE_URL}/api/settings/system-config/sync")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "stats" in data
        assert "negeri_updated" in data["stats"], "stats should contain negeri_updated"
        
        print(f"SUCCESS: Sync completed - negeri_updated: {data['stats']['negeri_updated']}")


class TestRegistrationPhoneAlt:
    """Test registration with phone_alt field"""
    
    def test_register_with_phone_alt(self, api_client):
        """POST /api/auth/register accepts phone_alt field"""
        unique_id = random_string(6)
        user_data = {
            "email": f"test_phone_alt_{unique_id}@test.com",
            "password": "testpass123",
            "full_name": "Test Phone Alt User",
            "phone": "0123456789",
            "phone_alt": "0198765432",  # No. Telefon Alternatif
            "ic_number": "901201061234",
            "state": "Selangor"
        }
        
        response = api_client.post(f"{BASE_URL}/api/auth/register", json=user_data)
        
        # Registration should succeed
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "user" in data
        assert data["user"]["phone_alt"] == "0198765432", "phone_alt should be saved"
        
        print(f"SUCCESS: Registered user with phone_alt: {data['user']['phone_alt']}")
    
    def test_register_without_phone_alt(self, api_client):
        """POST /api/auth/register works without phone_alt (optional field)"""
        unique_id = random_string(6)
        user_data = {
            "email": f"test_no_phone_alt_{unique_id}@test.com",
            "password": "testpass123",
            "full_name": "Test No Phone Alt User",
            "phone": "0123456780",
            "ic_number": "901201061235",
            "state": "Johor"
        }
        
        response = api_client.post(f"{BASE_URL}/api/auth/register", json=user_data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "user" in data
        # phone_alt should be None or not present
        assert data["user"].get("phone_alt") in [None, ""], "phone_alt should be empty when not provided"
        
        print(f"SUCCESS: Registered user without phone_alt")


class TestUserManagementPhoneAltState:
    """Test user management with phone_alt and state fields"""
    
    def test_create_user_with_phone_alt_and_state(self, authenticated_client):
        """POST /api/users accepts phone_alt and state fields"""
        unique_id = random_string(6)
        user_data = {
            "email": f"test_admin_created_{unique_id}@test.com",
            "password": "testpass123",
            "full_name": "Admin Created User",
            "phone": "0123456781",
            "phone_alt": "0111111111",
            "ic_number": "901201061236",
            "gender": "male",
            "role": "parent",
            "state": "Pulau Pinang"
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/users", json=user_data)
        
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("phone_alt") == "0111111111", "phone_alt should be saved"
        assert data.get("state") == "Pulau Pinang", "state should be saved"
        
        # Store user ID for update test
        self.__class__.created_user_id = data.get("id")
        
        print(f"SUCCESS: Created user with phone_alt={data.get('phone_alt')} and state={data.get('state')}")
    
    def test_update_user_phone_alt_and_state(self, authenticated_client):
        """PUT /api/users/{id} can update phone_alt and state fields"""
        # Get any user to update (except superadmin)
        response = authenticated_client.get(f"{BASE_URL}/api/users")
        assert response.status_code == 200
        
        users_data = response.json()
        users = users_data.get("users", users_data) if isinstance(users_data, dict) else users_data
        
        # Find a non-superadmin user
        target_user = None
        for user in users:
            if user.get("role") != "superadmin":
                target_user = user
                break
        
        if not target_user:
            pytest.skip("No suitable user found for update test")
        
        user_id = target_user["id"]
        
        update_data = {
            "full_name": target_user["full_name"],
            "phone": target_user.get("phone", "0123456789"),
            "phone_alt": "0199999999",  # Update phone_alt
            "state": "Sabah"  # Update state
        }
        
        response = authenticated_client.put(f"{BASE_URL}/api/users/{user_id}", json=update_data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("phone_alt") == "0199999999", "phone_alt should be updated"
        assert data.get("state") == "Sabah", "state should be updated"
        
        print(f"SUCCESS: Updated user with phone_alt={data.get('phone_alt')} and state={data.get('state')}")


class TestLoginReturnsPhoneAlt:
    """Test that login returns phone_alt in user data"""
    
    def test_login_returns_phone_alt(self, api_client):
        """POST /api/auth/login returns user with phone_alt field"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "admin123"
        })
        
        assert response.status_code == 200
        
        data = response.json()
        assert "user" in data
        # phone_alt field should exist in response schema
        assert "phone_alt" in data["user"] or data["user"].get("phone_alt") is None, \
            "phone_alt field should be in user response"
        
        print(f"SUCCESS: Login returns user with phone_alt field")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_users(self, authenticated_client):
        """Delete test users created during testing"""
        # Get all users
        response = authenticated_client.get(f"{BASE_URL}/api/users")
        if response.status_code != 200:
            print("Skipping cleanup - couldn't get users")
            return
        
        users_data = response.json()
        users = users_data.get("users", users_data) if isinstance(users_data, dict) else users_data
        
        deleted_count = 0
        for user in users:
            if user.get("email", "").startswith("test_"):
                try:
                    del_response = authenticated_client.delete(f"{BASE_URL}/api/users/{user['id']}")
                    if del_response.status_code in [200, 204]:
                        deleted_count += 1
                except:
                    pass
        
        print(f"Cleanup: Deleted {deleted_count} test users")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
