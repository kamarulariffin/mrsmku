"""
RBAC Configuration API Tests
Testing Role-Based Access Control endpoints for SuperAdmin
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://yuran-admin-panel.preview.emergentagent.com').rstrip('/')

class TestRBACConfiguration:
    """Test RBAC configuration endpoints"""
    
    @pytest.fixture(scope="class")
    def superadmin_token(self):
        """Get SuperAdmin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "super123"
        })
        assert response.status_code == 200, f"SuperAdmin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        return data["access_token"]
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get Admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@muafakat.link",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        return data["access_token"]
    
    # ========== GET /api/rbac/modules Tests ==========
    
    def test_get_rbac_modules_as_superadmin(self, superadmin_token):
        """Test GET /api/rbac/modules returns all available modules and permissions"""
        response = requests.get(
            f"{BASE_URL}/api/rbac/modules",
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "modules" in data
        assert "roles" in data
        
        # Verify modules contain expected structure
        modules = data["modules"]
        assert isinstance(modules, dict)
        assert len(modules) > 0
        
        # Check some expected modules exist
        expected_modules = ["dashboard", "users", "students", "fees", "payments", "rbac"]
        for module in expected_modules:
            assert module in modules, f"Module {module} should exist"
            assert "name" in modules[module]
            assert "permissions" in modules[module]
            assert isinstance(modules[module]["permissions"], list)
        
        # Verify roles structure
        roles = data["roles"]
        assert isinstance(roles, dict)
        expected_roles = ["superadmin", "admin", "bendahari", "warden", "guard", "parent", "pelajar"]
        for role in expected_roles:
            assert role in roles, f"Role {role} should exist"
            assert "name" in roles[role]
            assert "level" in roles[role]
            assert "description" in roles[role]
        
        print(f"PASS: GET /api/rbac/modules returned {len(modules)} modules and {len(roles)} roles")
    
    def test_get_rbac_modules_as_admin_forbidden(self, admin_token):
        """Test GET /api/rbac/modules forbidden for non-superadmin"""
        response = requests.get(
            f"{BASE_URL}/api/rbac/modules",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 403
        print("PASS: Admin cannot access /api/rbac/modules (403 Forbidden)")
    
    def test_get_rbac_modules_unauthorized(self):
        """Test GET /api/rbac/modules without auth returns 401/403"""
        response = requests.get(f"{BASE_URL}/api/rbac/modules")
        assert response.status_code in [401, 403]
        print("PASS: Unauthenticated access to /api/rbac/modules denied")
    
    # ========== GET /api/rbac/config Tests ==========
    
    def test_get_rbac_config_as_superadmin(self, superadmin_token):
        """Test GET /api/rbac/config returns all roles with their permissions"""
        response = requests.get(
            f"{BASE_URL}/api/rbac/config",
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "config" in data
        assert "available_modules" in data
        
        config = data["config"]
        assert isinstance(config, dict)
        
        # Verify all roles are present in config
        expected_roles = ["admin", "bendahari", "warden", "guard", "parent", "pelajar"]
        for role in expected_roles:
            assert role in config, f"Role {role} should be in config"
            role_config = config[role]
            assert "permissions" in role_config
            assert "role_info" in role_config
            assert isinstance(role_config["permissions"], list)
        
        # Verify superadmin is included
        assert "superadmin" in config
        superadmin_config = config["superadmin"]
        assert superadmin_config["permissions"] == ["*"], "SuperAdmin should have wildcard permission"
        
        print(f"PASS: GET /api/rbac/config returned configuration for {len(config)} roles")
    
    def test_get_rbac_config_admin_permission_count(self, superadmin_token):
        """Test admin role has correct permission count"""
        response = requests.get(
            f"{BASE_URL}/api/rbac/config",
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        admin_permissions = data["config"]["admin"]["permissions"]
        assert len(admin_permissions) > 0, "Admin should have some permissions"
        print(f"PASS: Admin has {len(admin_permissions)} permissions configured")
    
    def test_get_rbac_config_as_admin_forbidden(self, admin_token):
        """Test GET /api/rbac/config forbidden for non-superadmin"""
        response = requests.get(
            f"{BASE_URL}/api/rbac/config",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 403
        print("PASS: Admin cannot access /api/rbac/config (403 Forbidden)")
    
    # ========== GET /api/rbac/config/{role} Tests ==========
    
    def test_get_role_rbac_config(self, superadmin_token):
        """Test GET /api/rbac/config/{role} returns specific role configuration"""
        test_roles = ["admin", "bendahari", "warden", "guard", "parent", "pelajar"]
        
        for role in test_roles:
            response = requests.get(
                f"{BASE_URL}/api/rbac/config/{role}",
                headers={"Authorization": f"Bearer {superadmin_token}"}
            )
            assert response.status_code == 200, f"Failed to get config for {role}"
            data = response.json()
            
            assert data["role"] == role
            assert "role_info" in data
            assert "permissions" in data
            assert "available_modules" in data
            assert isinstance(data["permissions"], list)
            
            print(f"PASS: GET /api/rbac/config/{role} returned {len(data['permissions'])} permissions")
    
    def test_get_role_rbac_config_invalid_role(self, superadmin_token):
        """Test GET /api/rbac/config/{role} with invalid role returns 404"""
        response = requests.get(
            f"{BASE_URL}/api/rbac/config/invalid_role_xyz",
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        assert response.status_code == 404
        print("PASS: Invalid role returns 404")
    
    # ========== PUT /api/rbac/config/{role} Tests ==========
    
    def test_update_role_permissions(self, superadmin_token):
        """Test PUT /api/rbac/config/{role} updates permissions for a role"""
        # First get current permissions for bendahari
        get_response = requests.get(
            f"{BASE_URL}/api/rbac/config/bendahari",
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        assert get_response.status_code == 200
        original_permissions = get_response.json()["permissions"]
        
        # Create new permissions list with one additional permission
        new_permissions = list(original_permissions)
        test_permission = "audit.view"
        if test_permission not in new_permissions:
            new_permissions.append(test_permission)
        
        # Update permissions
        update_response = requests.put(
            f"{BASE_URL}/api/rbac/config/bendahari",
            headers={"Authorization": f"Bearer {superadmin_token}"},
            json={"permissions": new_permissions}
        )
        assert update_response.status_code == 200
        update_data = update_response.json()
        
        assert "message" in update_data
        assert update_data["role"] == "bendahari"
        assert "permissions" in update_data
        assert "permissions_count" in update_data
        
        # Verify the update persisted
        verify_response = requests.get(
            f"{BASE_URL}/api/rbac/config/bendahari",
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        assert verify_response.status_code == 200
        updated_permissions = verify_response.json()["permissions"]
        assert test_permission in updated_permissions, "New permission should be added"
        
        print(f"PASS: Updated bendahari permissions, now has {len(updated_permissions)} permissions")
        
        # Restore original permissions
        requests.put(
            f"{BASE_URL}/api/rbac/config/bendahari",
            headers={"Authorization": f"Bearer {superadmin_token}"},
            json={"permissions": original_permissions}
        )
    
    def test_update_superadmin_permissions_forbidden(self, superadmin_token):
        """Test PUT /api/rbac/config/superadmin is forbidden"""
        response = requests.put(
            f"{BASE_URL}/api/rbac/config/superadmin",
            headers={"Authorization": f"Bearer {superadmin_token}"},
            json={"permissions": ["dashboard.admin"]}
        )
        assert response.status_code == 400
        print("PASS: Cannot modify superadmin permissions (400 Bad Request)")
    
    def test_update_role_permissions_invalid_role(self, superadmin_token):
        """Test PUT /api/rbac/config/{role} with invalid role returns 404"""
        response = requests.put(
            f"{BASE_URL}/api/rbac/config/invalid_role_xyz",
            headers={"Authorization": f"Bearer {superadmin_token}"},
            json={"permissions": ["dashboard.admin"]}
        )
        assert response.status_code == 404
        print("PASS: Invalid role update returns 404")
    
    def test_update_permissions_filters_invalid(self, superadmin_token):
        """Test PUT /api/rbac/config/{role} filters out invalid permissions"""
        response = requests.put(
            f"{BASE_URL}/api/rbac/config/guard",
            headers={"Authorization": f"Bearer {superadmin_token}"},
            json={"permissions": ["valid.permission.does.not.exist", "dashboard.guard"]}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Only valid permissions should be kept
        assert "dashboard.guard" in data["permissions"]
        assert "valid.permission.does.not.exist" not in data["permissions"]
        
        print("PASS: Invalid permissions are filtered out during update")
    
    def test_update_permissions_as_admin_forbidden(self, admin_token):
        """Test PUT /api/rbac/config/{role} forbidden for non-superadmin"""
        response = requests.put(
            f"{BASE_URL}/api/rbac/config/guard",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"permissions": ["dashboard.guard"]}
        )
        assert response.status_code == 403
        print("PASS: Admin cannot update RBAC config (403 Forbidden)")
    
    # ========== POST /api/rbac/reset/{role} Tests ==========
    
    def test_reset_role_permissions(self, superadmin_token):
        """Test POST /api/rbac/reset/{role} resets permissions to default"""
        # First modify warden permissions
        modify_response = requests.put(
            f"{BASE_URL}/api/rbac/config/warden",
            headers={"Authorization": f"Bearer {superadmin_token}"},
            json={"permissions": ["dashboard.warden"]}  # Minimal permissions
        )
        assert modify_response.status_code == 200
        
        # Verify it was modified
        verify_response = requests.get(
            f"{BASE_URL}/api/rbac/config/warden",
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        assert len(verify_response.json()["permissions"]) == 1
        
        # Reset to default
        reset_response = requests.post(
            f"{BASE_URL}/api/rbac/reset/warden",
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        assert reset_response.status_code == 200
        reset_data = reset_response.json()
        
        assert "message" in reset_data
        assert reset_data["role"] == "warden"
        assert "permissions" in reset_data
        assert len(reset_data["permissions"]) > 1, "Reset should restore default permissions"
        
        # Verify reset was applied
        final_response = requests.get(
            f"{BASE_URL}/api/rbac/config/warden",
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        assert len(final_response.json()["permissions"]) > 1
        
        print(f"PASS: Reset warden to default, now has {len(reset_data['permissions'])} permissions")
    
    def test_reset_superadmin_permissions_forbidden(self, superadmin_token):
        """Test POST /api/rbac/reset/superadmin is forbidden"""
        response = requests.post(
            f"{BASE_URL}/api/rbac/reset/superadmin",
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        assert response.status_code == 400
        print("PASS: Cannot reset superadmin permissions (400 Bad Request)")
    
    def test_reset_invalid_role(self, superadmin_token):
        """Test POST /api/rbac/reset/{role} with invalid role returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/rbac/reset/invalid_role_xyz",
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        assert response.status_code == 404
        print("PASS: Reset invalid role returns 404")
    
    def test_reset_as_admin_forbidden(self, admin_token):
        """Test POST /api/rbac/reset/{role} forbidden for non-superadmin"""
        response = requests.post(
            f"{BASE_URL}/api/rbac/reset/guard",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 403
        print("PASS: Admin cannot reset RBAC config (403 Forbidden)")


class TestRBACPermissionValidation:
    """Test RBAC permission validation and module structure"""
    
    @pytest.fixture(scope="class")
    def superadmin_token(self):
        """Get SuperAdmin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "super123"
        })
        return response.json()["access_token"]
    
    def test_module_permissions_structure(self, superadmin_token):
        """Test that all modules have proper permission structure"""
        response = requests.get(
            f"{BASE_URL}/api/rbac/modules",
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        assert response.status_code == 200
        modules = response.json()["modules"]
        
        for module_key, module in modules.items():
            assert "name" in module, f"Module {module_key} missing 'name'"
            assert "permissions" in module, f"Module {module_key} missing 'permissions'"
            
            for perm in module["permissions"]:
                assert "code" in perm, f"Permission in {module_key} missing 'code'"
                assert "name" in perm, f"Permission in {module_key} missing 'name'"
                assert "description" in perm, f"Permission in {module_key} missing 'description'"
                
                # Verify permission code follows format: module.action
                assert "." in perm["code"], f"Permission code {perm['code']} should contain '.'"
        
        print(f"PASS: All {len(modules)} modules have proper permission structure")
    
    def test_role_permission_counts(self, superadmin_token):
        """Test each role has expected permission count"""
        response = requests.get(
            f"{BASE_URL}/api/rbac/config",
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        assert response.status_code == 200
        config = response.json()["config"]
        
        # Verify roles have reasonable permission counts
        for role, role_config in config.items():
            perm_count = len(role_config["permissions"])
            if role == "superadmin":
                assert role_config["permissions"] == ["*"], "SuperAdmin should have wildcard"
            else:
                assert perm_count > 0, f"Role {role} should have at least one permission"
            
            print(f"  {role}: {perm_count} permissions")
        
        print("PASS: All roles have proper permission counts")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
