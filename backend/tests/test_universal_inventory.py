"""
Universal Inventory Management System - API Tests
Tests for central inventory, vendors, links, auto-sync, and movement history
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthentication:
    """Authentication tests for inventory module"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@muafakat.link",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def pum_token(self):
        """Get PUM admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "pum@muafakat.link",
            "password": "pum123"
        })
        assert response.status_code == 200, f"PUM admin login failed: {response.text}"
        return response.json()["access_token"]
    
    def test_admin_login_success(self):
        """Test admin can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@muafakat.link",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
    
    def test_pum_admin_login_success(self):
        """Test PUM admin can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "pum@muafakat.link",
            "password": "pum123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "pum_admin"


class TestInventoryStats:
    """P0: Test inventory statistics endpoint"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@muafakat.link",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_get_inventory_stats(self, admin_token):
        """Test GET /api/inventory/stats returns correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/inventory/stats",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify all stat fields exist
        assert "total_items" in data
        assert "active_items" in data
        assert "low_stock_items" in data
        assert "out_of_stock_items" in data
        assert "total_value" in data
        assert "by_category" in data
        assert "by_vendor" in data
        assert "by_module" in data
        
        # Verify types
        assert isinstance(data["total_items"], int)
        assert isinstance(data["total_value"], (int, float))
        assert isinstance(data["by_category"], list)


class TestInventoryItemsCRUD:
    """P0: Test inventory items CRUD operations"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@muafakat.link",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def created_item_id(self, admin_token):
        """Create a test item and return its ID"""
        response = requests.post(
            f"{BASE_URL}/api/inventory/items",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "TEST_Item Universal Inventory",
                "sku": "TEST-INV-001",
                "description": "Test item for inventory testing",
                "category": "aksesori",
                "base_price": 25.00,
                "stock": 100,
                "low_stock_threshold": 10,
                "vendor_type": "internal",
                "is_active": True,
                "sync_mode": "auto"
            }
        )
        assert response.status_code == 200
        return response.json()["id"]
    
    def test_get_inventory_items(self, admin_token):
        """Test GET /api/inventory/items returns list"""
        response = requests.get(
            f"{BASE_URL}/api/inventory/items",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Verify item structure if items exist
        if len(data) > 0:
            item = data[0]
            assert "id" in item
            assert "name" in item
            assert "category" in item
            assert "base_price" in item
            assert "stock" in item
    
    def test_create_inventory_item(self, admin_token):
        """Test POST /api/inventory/items creates new item"""
        response = requests.post(
            f"{BASE_URL}/api/inventory/items",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "TEST_New Inventory Item",
                "sku": "TEST-NEW-001",
                "description": "New test item",
                "category": "cenderamata",
                "base_price": 35.00,
                "stock": 50,
                "low_stock_threshold": 5,
                "vendor_type": "internal",
                "is_active": True,
                "sync_mode": "auto"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["message"] == "Item inventori berjaya dicipta"
        
        # Cleanup - delete created item
        item_id = data["id"]
        requests.delete(
            f"{BASE_URL}/api/inventory/items/{item_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    
    def test_get_single_inventory_item(self, admin_token, created_item_id):
        """Test GET /api/inventory/items/{id} returns item details"""
        response = requests.get(
            f"{BASE_URL}/api/inventory/items/{created_item_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["id"] == created_item_id
        assert data["name"] == "TEST_Item Universal Inventory"
        assert data["category"] == "aksesori"
        assert data["base_price"] == 25.00
        assert data["stock"] == 100
        assert "linked_products" in data
    
    def test_update_inventory_item(self, admin_token, created_item_id):
        """Test PUT /api/inventory/items/{id} updates item"""
        # Update item
        response = requests.put(
            f"{BASE_URL}/api/inventory/items/{created_item_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "TEST_Updated Item Name",
                "base_price": 30.00,
                "stock": 80
            }
        )
        assert response.status_code == 200
        assert response.json()["message"] == "Item berjaya dikemaskini"
        
        # Verify update with GET
        verify_response = requests.get(
            f"{BASE_URL}/api/inventory/items/{created_item_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert verify_response.status_code == 200
        data = verify_response.json()
        assert data["name"] == "TEST_Updated Item Name"
        assert data["base_price"] == 30.00
        assert data["stock"] == 80
    
    def test_delete_inventory_item(self, admin_token, created_item_id):
        """Test DELETE /api/inventory/items/{id} soft deletes item"""
        response = requests.delete(
            f"{BASE_URL}/api/inventory/items/{created_item_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        assert response.json()["message"] == "Item berjaya dipadam"
        
        # Verify soft delete - item should still exist but inactive
        verify_response = requests.get(
            f"{BASE_URL}/api/inventory/items?include_inactive=true",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert verify_response.status_code == 200


class TestVendorsCRUD:
    """P1: Test vendor CRUD operations"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@muafakat.link",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def created_vendor_id(self, admin_token):
        """Create a test vendor and return its ID"""
        response = requests.post(
            f"{BASE_URL}/api/inventory/vendors",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "TEST_Vendor Testing",
                "vendor_type": "external",
                "description": "Test vendor for testing",
                "contact_person": "Test Contact",
                "contact_phone": "0123456789",
                "commission_rate": 15.0,
                "is_active": True
            }
        )
        assert response.status_code == 200
        return response.json()["id"]
    
    def test_get_vendors(self, admin_token):
        """Test GET /api/inventory/vendors returns list"""
        response = requests.get(
            f"{BASE_URL}/api/inventory/vendors",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Should have at least Muafakat and PUM vendors
        assert len(data) >= 2
        
        # Verify vendor structure
        vendor = data[0]
        assert "id" in vendor
        assert "name" in vendor
        assert "vendor_type" in vendor
        assert "commission_rate" in vendor
    
    def test_create_vendor(self, admin_token):
        """Test POST /api/inventory/vendors creates new vendor"""
        response = requests.post(
            f"{BASE_URL}/api/inventory/vendors",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "TEST_New Vendor Create",
                "vendor_type": "pum",
                "description": "New test vendor",
                "contact_person": "New Contact",
                "commission_rate": 20.0,
                "is_active": True
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["message"] == "Vendor berjaya dicipta"
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/inventory/vendors/{data['id']}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    
    def test_update_vendor(self, admin_token, created_vendor_id):
        """Test PUT /api/inventory/vendors/{id} updates vendor"""
        response = requests.put(
            f"{BASE_URL}/api/inventory/vendors/{created_vendor_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "TEST_Updated Vendor Name",
                "commission_rate": 18.0
            }
        )
        assert response.status_code == 200
        assert response.json()["message"] == "Vendor berjaya dikemaskini"
    
    def test_delete_vendor(self, admin_token, created_vendor_id):
        """Test DELETE /api/inventory/vendors/{id} soft deletes vendor"""
        response = requests.delete(
            f"{BASE_URL}/api/inventory/vendors/{created_vendor_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        assert response.json()["message"] == "Vendor berjaya dipadam"


class TestInventoryLinks:
    """P1: Test inventory link operations"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@muafakat.link",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_existing_link_data(self, admin_token):
        """Test existing inventory link (from main agent context)"""
        # Get the existing central item with link
        response = requests.get(
            f"{BASE_URL}/api/inventory/items/6992168eb1239bcd803f307a",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify link exists
        assert "linked_products" in data
        assert len(data["linked_products"]) > 0
        
        # Verify link structure
        link = data["linked_products"][0]
        assert link["module"] == "merchandise"
        assert link["product_id"] == "69920ac9074e82a29bc04622"
        assert link["sync_enabled"] == True
    
    def test_delete_and_recreate_link(self, admin_token):
        """Test delete and recreate inventory link"""
        # Get existing link ID
        item_response = requests.get(
            f"{BASE_URL}/api/inventory/items/6992168eb1239bcd803f307a",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if item_response.status_code != 200:
            pytest.skip("Central inventory item not found")
        
        item_data = item_response.json()
        if not item_data.get("linked_products"):
            pytest.skip("No existing links to test")
        
        existing_link_id = item_data["linked_products"][0]["link_id"]
        
        # Delete the link
        delete_response = requests.delete(
            f"{BASE_URL}/api/inventory/links/{existing_link_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert delete_response.status_code == 200
        
        # Recreate the link
        create_response = requests.post(
            f"{BASE_URL}/api/inventory/links",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "inventory_item_id": "6992168eb1239bcd803f307a",
                "module": "merchandise",
                "product_id": "69920ac9074e82a29bc04622",
                "sync_enabled": True,
                "price_multiplier": 1.0
            }
        )
        assert create_response.status_code == 200
        assert create_response.json()["message"] == "Pautan inventori berjaya dicipta"
    
    def test_create_link_duplicate_fails(self, admin_token):
        """Test creating duplicate link fails"""
        response = requests.post(
            f"{BASE_URL}/api/inventory/links",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "inventory_item_id": "6992168eb1239bcd803f307a",
                "module": "merchandise",
                "product_id": "69920ac9074e82a29bc04622",
                "sync_enabled": True,
                "price_multiplier": 1.0
            }
        )
        assert response.status_code == 400
        assert "sudah wujud" in response.json()["detail"]


class TestAutoSync:
    """P0: Test auto-sync functionality between central and merchandise"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@muafakat.link",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_sync_central_to_merchandise(self, admin_token):
        """Test P0: Update central stock syncs to merchandise"""
        # Get current central stock
        central_response = requests.get(
            f"{BASE_URL}/api/inventory/items/6992168eb1239bcd803f307a",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert central_response.status_code == 200
        current_stock = central_response.json()["stock"]
        
        # Update central stock
        new_stock = current_stock + 10
        update_response = requests.put(
            f"{BASE_URL}/api/inventory/items/6992168eb1239bcd803f307a",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"stock": new_stock}
        )
        assert update_response.status_code == 200
        
        # Verify central stock updated
        verify_central = requests.get(
            f"{BASE_URL}/api/inventory/items/6992168eb1239bcd803f307a",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert verify_central.json()["stock"] == new_stock
        
        # Verify merchandise stock synced
        merch_response = requests.get(
            f"{BASE_URL}/api/merchandise/products/69920ac9074e82a29bc04622",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert merch_response.status_code == 200
        assert merch_response.json()["stock"] == new_stock
        
        # Restore original stock
        requests.put(
            f"{BASE_URL}/api/inventory/items/6992168eb1239bcd803f307a",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"stock": current_stock}
        )
    
    def test_sync_merchandise_to_central(self, admin_token):
        """Test P0: Adjust merchandise stock syncs to central"""
        # Get current merchandise stock
        merch_response = requests.get(
            f"{BASE_URL}/api/merchandise/products/69920ac9074e82a29bc04622",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert merch_response.status_code == 200
        current_stock = merch_response.json()["stock"]
        
        # Adjust merchandise stock via inventory adjustment
        new_stock = current_stock - 5
        adjust_response = requests.post(
            f"{BASE_URL}/api/merchandise/inventory/adjust",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "product_id": "69920ac9074e82a29bc04622",
                "new_stock": new_stock,
                "reason": "Test stock adjustment"
            }
        )
        assert adjust_response.status_code == 200
        
        # Verify merchandise stock adjusted
        verify_merch = requests.get(
            f"{BASE_URL}/api/merchandise/products/69920ac9074e82a29bc04622",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert verify_merch.json()["stock"] == new_stock
        
        # Verify central stock synced
        verify_central = requests.get(
            f"{BASE_URL}/api/inventory/items/6992168eb1239bcd803f307a",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert verify_central.json()["stock"] == new_stock
        
        # Restore original stock
        requests.post(
            f"{BASE_URL}/api/merchandise/inventory/adjust",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "product_id": "69920ac9074e82a29bc04622",
                "new_stock": current_stock,
                "reason": "Restore original stock"
            }
        )
    
    def test_manual_sync(self, admin_token):
        """Test manual sync trigger"""
        response = requests.post(
            f"{BASE_URL}/api/inventory/sync/manual",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "inventory_item_id": "6992168eb1239bcd803f307a",
                "target_modules": []
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Sync berjaya" in data["message"]


class TestMovementHistory:
    """P1: Test inventory movement history tracking"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@muafakat.link",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_get_all_movements(self, admin_token):
        """Test GET /api/inventory/movements returns movement history"""
        response = requests.get(
            f"{BASE_URL}/api/inventory/movements?limit=50",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Verify movement structure
        if len(data) > 0:
            movement = data[0]
            assert "id" in movement
            assert "inventory_item_id" in movement
            assert "item_name" in movement
            assert "movement_type" in movement
            assert "quantity" in movement
            assert "previous_stock" in movement
            assert "new_stock" in movement
            assert "source_module" in movement
    
    def test_get_movements_by_item(self, admin_token):
        """Test filter movements by inventory item ID"""
        response = requests.get(
            f"{BASE_URL}/api/inventory/movements?inventory_item_id=6992168eb1239bcd803f307a&limit=20",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # All movements should be for the specified item
        for movement in data:
            assert movement["inventory_item_id"] == "6992168eb1239bcd803f307a"
    
    def test_movement_created_on_stock_change(self, admin_token):
        """Test movement is recorded when stock changes"""
        # Get current stock
        item_response = requests.get(
            f"{BASE_URL}/api/inventory/items/6992168eb1239bcd803f307a",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        current_stock = item_response.json()["stock"]
        
        # Update stock
        new_stock = current_stock + 5
        requests.put(
            f"{BASE_URL}/api/inventory/items/6992168eb1239bcd803f307a",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"stock": new_stock}
        )
        
        # Check movement was recorded
        movements_response = requests.get(
            f"{BASE_URL}/api/inventory/movements?inventory_item_id=6992168eb1239bcd803f307a&limit=5",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        movements = movements_response.json()
        
        # Most recent movement should reflect the change
        assert len(movements) > 0
        latest = movements[0]
        assert latest["new_stock"] == new_stock
        
        # Restore original stock
        requests.put(
            f"{BASE_URL}/api/inventory/items/6992168eb1239bcd803f307a",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"stock": current_stock}
        )


class TestCategories:
    """Test shared categories endpoint"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@muafakat.link",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_get_categories(self, admin_token):
        """Test GET /api/inventory/categories returns category list"""
        response = requests.get(
            f"{BASE_URL}/api/inventory/categories",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Should have expected categories
        category_values = [c["value"] for c in data]
        assert "baju" in category_values
        assert "aksesori" in category_values
        assert "cenderamata" in category_values
        
        # Verify category structure
        for cat in data:
            assert "value" in cat
            assert "label" in cat
            assert "count" in cat


class TestRoleBasedAccess:
    """Test role-based access to inventory module"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@muafakat.link",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def pum_token(self):
        """Get PUM admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "pum@muafakat.link",
            "password": "pum123"
        })
        return response.json()["access_token"]
    
    def test_pum_admin_can_access_inventory_items(self, pum_token):
        """Test PUM admin can access inventory items"""
        response = requests.get(
            f"{BASE_URL}/api/inventory/items",
            headers={"Authorization": f"Bearer {pum_token}"}
        )
        assert response.status_code == 200
    
    def test_pum_admin_can_access_vendors(self, pum_token):
        """Test PUM admin can access vendors"""
        response = requests.get(
            f"{BASE_URL}/api/inventory/vendors",
            headers={"Authorization": f"Bearer {pum_token}"}
        )
        assert response.status_code == 200
    
    def test_pum_admin_can_access_stats(self, pum_token):
        """Test PUM admin can access inventory stats"""
        response = requests.get(
            f"{BASE_URL}/api/inventory/stats",
            headers={"Authorization": f"Bearer {pum_token}"}
        )
        assert response.status_code == 200
    
    def test_pum_admin_can_access_movements(self, pum_token):
        """Test PUM admin can access movement history"""
        response = requests.get(
            f"{BASE_URL}/api/inventory/movements",
            headers={"Authorization": f"Bearer {pum_token}"}
        )
        assert response.status_code == 200
    
    def test_no_token_rejected(self):
        """Test requests without token are rejected"""
        response = requests.get(f"{BASE_URL}/api/inventory/items")
        assert response.status_code == 401


class TestCommissionFeature:
    """P1: Test commission feature from previous session"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@muafakat.link",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_merchandise_settings_commission(self, admin_token):
        """Test merchandise settings includes commission rate"""
        response = requests.get(
            f"{BASE_URL}/api/merchandise/settings",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "pum_commission_rate" in data
        assert data["pum_commission_rate"] >= 0
        assert data["pum_commission_rate"] <= 100
    
    def test_merchandise_products_include_commission(self, admin_token):
        """Test merchandise products include commission info"""
        response = requests.get(
            f"{BASE_URL}/api/merchandise/products",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        if len(data) > 0:
            product = data[0]
            assert "pum_commission_rate" in product
            assert "pum_commission_amount" in product
