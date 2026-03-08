"""
Test Module On/Off Settings Feature
- GET /api/settings/modules (authenticated)
- GET /api/settings/modules/public (no auth)
- POST /api/settings/modules (SuperAdmin only)
- Verify non-superadmin cannot change settings
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPERADMIN_EMAIL = "superadmin@muafakat.link"
SUPERADMIN_PASS = "admin123"

BENDAHARI_EMAIL = "bendahari@muafakat.link"
BENDAHARI_PASS = "bendahari123"

# All 9 modules that should be configurable
EXPECTED_MODULES = [
    "tiket_bas", "hostel", "koperasi", "marketplace",
    "sickbay", "vehicle", "inventory", "complaints", "agm"
]


@pytest.fixture
def superadmin_token():
    """Get superadmin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": SUPERADMIN_EMAIL,
        "password": SUPERADMIN_PASS
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("SuperAdmin login failed")


@pytest.fixture
def bendahari_token():
    """Get bendahari authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": BENDAHARI_EMAIL,
        "password": BENDAHARI_PASS
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Bendahari login failed")


class TestModuleSettingsAPI:
    """Module On/Off Settings API Tests"""
    
    def test_get_modules_public_no_auth(self):
        """GET /api/settings/modules/public returns module settings without auth"""
        response = requests.get(f"{BASE_URL}/api/settings/modules/public")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "modules" in data, "Response should contain 'modules' key"
        
        modules = data["modules"]
        
        # Verify all 9 expected modules are present
        for module_key in EXPECTED_MODULES:
            assert module_key in modules, f"Module '{module_key}' should be in response"
            assert "enabled" in modules[module_key], f"Module '{module_key}' should have 'enabled' field"
            assert "name" in modules[module_key], f"Module '{module_key}' should have 'name' field"
            assert "description" in modules[module_key], f"Module '{module_key}' should have 'description' field"
        
        print(f"✓ Public modules endpoint returns {len(modules)} modules")
        for key, val in modules.items():
            print(f"  - {key}: enabled={val.get('enabled')}, name={val.get('name')}")
    
    def test_get_modules_authenticated(self, superadmin_token):
        """GET /api/settings/modules returns module settings with auth"""
        headers = {"Authorization": f"Bearer {superadmin_token}"}
        response = requests.get(f"{BASE_URL}/api/settings/modules", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "modules" in data, "Response should contain 'modules' key"
        
        modules = data["modules"]
        
        # Verify all 9 expected modules are present
        for module_key in EXPECTED_MODULES:
            assert module_key in modules, f"Module '{module_key}' should be in response"
        
        print(f"✓ Authenticated modules endpoint returns {len(modules)} modules")
    
    def test_save_modules_superadmin_can_disable(self, superadmin_token):
        """POST /api/settings/modules - SuperAdmin can disable modules"""
        headers = {"Authorization": f"Bearer {superadmin_token}"}
        
        # First, get current settings
        get_response = requests.get(f"{BASE_URL}/api/settings/modules", headers=headers)
        current_modules = get_response.json().get("modules", {})
        
        # Disable tiket_bas and marketplace for testing
        test_modules = {}
        for key, val in current_modules.items():
            test_modules[key] = {"enabled": val.get("enabled", True)}
        
        test_modules["tiket_bas"]["enabled"] = False
        test_modules["marketplace"]["enabled"] = False
        
        # Save the settings
        response = requests.post(
            f"{BASE_URL}/api/settings/modules",
            headers=headers,
            json={"modules": test_modules}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain success message"
        assert "modules" in data, "Response should return updated modules"
        
        # Verify the modules were disabled
        assert data["modules"]["tiket_bas"]["enabled"] == False, "tiket_bas should be disabled"
        assert data["modules"]["marketplace"]["enabled"] == False, "marketplace should be disabled"
        
        print("✓ SuperAdmin can disable modules (tiket_bas and marketplace disabled)")
    
    def test_verify_disabled_modules_in_public(self, superadmin_token):
        """Verify disabled modules appear as disabled in public endpoint"""
        # Get public module settings
        response = requests.get(f"{BASE_URL}/api/settings/modules/public")
        
        assert response.status_code == 200
        
        modules = response.json().get("modules", {})
        
        # These should be disabled from previous test
        assert modules["tiket_bas"]["enabled"] == False, "tiket_bas should still be disabled"
        assert modules["marketplace"]["enabled"] == False, "marketplace should still be disabled"
        
        # Others should be enabled
        assert modules["hostel"]["enabled"] == True, "hostel should be enabled"
        assert modules["koperasi"]["enabled"] == True, "koperasi should be enabled"
        
        print("✓ Disabled modules (tiket_bas, marketplace) verified in public endpoint")
    
    def test_non_superadmin_cannot_save_modules(self, bendahari_token):
        """POST /api/settings/modules - Non-SuperAdmin cannot change settings"""
        headers = {"Authorization": f"Bearer {bendahari_token}"}
        
        # Try to enable all modules
        test_modules = {key: {"enabled": True} for key in EXPECTED_MODULES}
        
        response = requests.post(
            f"{BASE_URL}/api/settings/modules",
            headers=headers,
            json={"modules": test_modules}
        )
        
        assert response.status_code == 403, f"Expected 403 Forbidden, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data, "Response should contain error detail"
        
        print(f"✓ Non-SuperAdmin (bendahari) correctly denied access: {data.get('detail')}")
    
    def test_re_enable_all_modules(self, superadmin_token):
        """POST /api/settings/modules - Re-enable all modules after testing"""
        headers = {"Authorization": f"Bearer {superadmin_token}"}
        
        # Enable all modules
        test_modules = {}
        for key in EXPECTED_MODULES:
            test_modules[key] = {"enabled": True}
        
        response = requests.post(
            f"{BASE_URL}/api/settings/modules",
            headers=headers,
            json={"modules": test_modules}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify all modules are now enabled
        for key in EXPECTED_MODULES:
            assert data["modules"][key]["enabled"] == True, f"{key} should be enabled"
        
        print("✓ All 9 modules re-enabled successfully")
        
    def test_verify_all_modules_enabled(self):
        """Verify all modules are enabled after cleanup"""
        response = requests.get(f"{BASE_URL}/api/settings/modules/public")
        
        assert response.status_code == 200
        
        modules = response.json().get("modules", {})
        
        # All should be enabled
        for key in EXPECTED_MODULES:
            assert modules[key]["enabled"] == True, f"{key} should be enabled after cleanup"
        
        print("✓ All modules verified as enabled (cleanup complete)")


class TestModuleMetadata:
    """Test module metadata is correct"""
    
    def test_module_names_and_descriptions(self):
        """Verify all modules have proper names and descriptions"""
        response = requests.get(f"{BASE_URL}/api/settings/modules/public")
        
        assert response.status_code == 200
        
        modules = response.json().get("modules", {})
        
        expected_names = {
            "tiket_bas": "Tiket Bas",
            "hostel": "Hostel",
            "koperasi": "Koperasi",
            "marketplace": "Marketplace",
            "sickbay": "Bilik Sakit",
            "vehicle": "Kenderaan",
            "inventory": "Inventori",
            "complaints": "Aduan",
            "agm": "Mesyuarat AGM"
        }
        
        for key, expected_name in expected_names.items():
            assert key in modules, f"Module '{key}' should exist"
            assert modules[key]["name"] == expected_name, f"Module '{key}' should have name '{expected_name}'"
            assert len(modules[key]["description"]) > 5, f"Module '{key}' should have a description"
        
        print("✓ All module names and descriptions verified")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
