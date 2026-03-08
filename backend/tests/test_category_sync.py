"""
Category Synchronization Tests
Testing /api/categories endpoints for category management and synchronization
across Koperasi, Inventory, and other modules.
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPERADMIN_EMAIL = "superadmin@muafakat.link"
SUPERADMIN_PASSWORD = "admin123"


class TestCategorySync:
    """Test category synchronization across modules"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as superadmin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPERADMIN_EMAIL,
            "password": SUPERADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    # ==================== KOPERASI CATEGORIES TESTS ====================
    
    def test_get_koperasi_categories_flat(self):
        """Test GET /api/categories/koperasi/flat - flat list for dropdowns"""
        response = self.session.get(f"{BASE_URL}/api/categories/koperasi/flat")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Should return a list
        assert isinstance(data, list), "Response should be a list"
        
        # Check structure of items
        if len(data) > 0:
            item = data[0]
            assert "id" in item, "Item should have 'id'"
            assert "code" in item, "Item should have 'code'"
            assert "name" in item, "Item should have 'name'"
            assert "full_name" in item, "Item should have 'full_name'"
            print(f"✓ Koperasi categories flat API working, {len(data)} categories found")
            print(f"  Sample: {item.get('name')} ({item.get('code')})")
        else:
            print("✓ Koperasi categories flat API working, 0 categories (may need seeding)")
    
    def test_get_koperasi_categories_hierarchical(self):
        """Test GET /api/categories/koperasi - hierarchical with children"""
        response = self.session.get(f"{BASE_URL}/api/categories/koperasi")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            item = data[0]
            assert "id" in item, "Item should have 'id'"
            assert "code" in item, "Item should have 'code'"
            assert "name" in item, "Item should have 'name'"
            assert "children" in item, "Item should have 'children' for hierarchy"
            print(f"✓ Koperasi categories hierarchical API working, {len(data)} root categories")
        else:
            print("✓ Koperasi categories hierarchical API working, 0 categories")
    
    def test_seed_koperasi_categories(self):
        """Test POST /api/categories/koperasi/seed - seed default categories"""
        response = self.session.post(f"{BASE_URL}/api/categories/koperasi/seed")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "message" in data, "Response should have 'message'"
        assert "created" in data, "Response should have 'created' count"
        assert "skipped" in data, "Response should have 'skipped' count"
        
        print(f"✓ Seed Koperasi categories: created={data['created']}, skipped={data['skipped']}")
    
    def test_verify_merchandise_category_exists(self):
        """Verify 'Barangan Rasmi (Merchandise)' category exists after seeding"""
        response = self.session.get(f"{BASE_URL}/api/categories/koperasi/flat")
        
        assert response.status_code == 200
        data = response.json()
        
        # Check for merchandise category
        merchandise_cat = None
        for cat in data:
            if cat.get('code') == 'merchandise' or 'Barangan Rasmi' in cat.get('name', ''):
                merchandise_cat = cat
                break
        
        assert merchandise_cat is not None, "Merchandise category should exist"
        print(f"✓ Found merchandise category: {merchandise_cat.get('name')} (commission_eligible: {merchandise_cat.get('commission_eligible')})")
    
    # ==================== ADMIN CATEGORIES TESTS ====================
    
    def test_get_all_categories_admin(self):
        """Test GET /api/categories - admin view with usage counts"""
        response = self.session.get(f"{BASE_URL}/api/categories")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            item = data[0]
            # Check for admin-specific fields
            assert "id" in item, "Should have id"
            assert "name" in item, "Should have name"
            assert "scope" in item, "Should have scope"
            assert "scope_display" in item, "Should have scope_display"
            assert "koperasi_count" in item, "Should have koperasi_count"
            assert "merchandise_count" in item, "Should have merchandise_count"
            assert "pum_count" in item, "Should have pum_count"
            assert "total_count" in item, "Should have total_count"
            print(f"✓ Admin categories API working, {len(data)} categories")
            print(f"  Sample: {item.get('name')} - Scope: {item.get('scope_display')}")
    
    def test_get_category_tree(self):
        """Test GET /api/categories/tree - tree structure"""
        response = self.session.get(f"{BASE_URL}/api/categories/tree")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            item = data[0]
            assert "id" in item, "Should have id"
            assert "name" in item, "Should have name"
            assert "children" in item, "Should have children array"
            print(f"✓ Category tree API working, {len(data)} root categories")
    
    # ==================== INVENTORY CATEGORIES TESTS ====================
    
    def test_get_inventory_categories(self):
        """Test GET /api/categories/inventory - for inventory module"""
        response = self.session.get(f"{BASE_URL}/api/categories/inventory")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            item = data[0]
            # Inventory format uses value/label
            assert "value" in item, "Should have 'value' field"
            assert "label" in item, "Should have 'label' field"
            print(f"✓ Inventory categories API working, {len(data)} categories")
            print(f"  Sample: {item.get('label')} (value: {item.get('value')})")
        else:
            print("✓ Inventory categories API working, 0 categories")
    
    # ==================== SUB-CATEGORY TESTS ====================
    
    def test_create_subcategory(self):
        """Test POST /api/categories/{parent_id}/subcategory - create sub-category"""
        # First get a parent category
        response = self.session.get(f"{BASE_URL}/api/categories/koperasi/flat")
        assert response.status_code == 200
        
        categories = response.json()
        if len(categories) == 0:
            pytest.skip("No categories to test sub-category creation")
        
        parent = categories[0]
        parent_id = parent['id']
        
        # Create a test subcategory
        test_subcat = {
            "name": "Test Sub-Category",
            "code": "test_subcat_" + parent_id[:8],
            "description": "Test subcategory for testing",
            "scope": parent.get('scope', 'shared')
        }
        
        response = self.session.post(f"{BASE_URL}/api/categories/{parent_id}/subcategory", json=test_subcat)
        
        # May return 400 if code already exists, that's okay
        if response.status_code == 400:
            print(f"✓ Subcategory creation endpoint working (code already exists)")
        else:
            assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
            data = response.json()
            assert "id" in data or "message" in data
            print(f"✓ Subcategory created successfully")
    
    def test_move_category_endpoint_exists(self):
        """Test PUT /api/categories/{category_id}/move endpoint exists"""
        # First get a category
        response = self.session.get(f"{BASE_URL}/api/categories/koperasi/flat")
        assert response.status_code == 200
        
        categories = response.json()
        if len(categories) < 2:
            pytest.skip("Need at least 2 categories to test move")
        
        category_to_move = categories[0]
        
        # Try to move to root (no parent)
        response = self.session.put(f"{BASE_URL}/api/categories/{category_to_move['id']}/move")
        
        # Should return 200 or some response (not 404)
        assert response.status_code != 404, "Move endpoint should exist"
        print(f"✓ Move category endpoint exists, status: {response.status_code}")
    
    # ==================== PUBLIC CATEGORIES TESTS ====================
    
    def test_get_public_categories(self):
        """Test GET /api/categories/public - public access"""
        # Test without auth header
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/categories/public")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Public categories API working, {len(data)} categories accessible")
    
    def test_get_public_categories_by_module(self):
        """Test GET /api/categories/public?module=koperasi - filter by module"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/categories/public?module=koperasi")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Public categories by module working, {len(data)} koperasi categories")
    
    # ==================== COMMISSION ELIGIBLE TESTS ====================
    
    def test_commission_eligible_field(self):
        """Test that commission_eligible field is present in category data"""
        response = self.session.get(f"{BASE_URL}/api/categories/koperasi/flat")
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data) > 0:
            # Check commission_eligible field exists
            item = data[0]
            assert "commission_eligible" in item, "Should have commission_eligible field"
            
            # Find categories with commission_eligible = True
            eligible_cats = [c for c in data if c.get('commission_eligible', False)]
            print(f"✓ Commission eligible field present, {len(eligible_cats)} categories are commission eligible")
            for cat in eligible_cats:
                print(f"  - {cat.get('name')} ({cat.get('code')})")
    
    # ==================== SCOPE FILTER TESTS ====================
    
    def test_filter_by_scope(self):
        """Test filtering categories by scope"""
        # Test shared scope
        response = self.session.get(f"{BASE_URL}/api/categories?scope=shared")
        assert response.status_code == 200
        shared_data = response.json()
        
        # Test koperasi_only scope
        response = self.session.get(f"{BASE_URL}/api/categories?scope=koperasi_only")
        assert response.status_code == 200
        koperasi_data = response.json()
        
        print(f"✓ Scope filtering working - shared: {len(shared_data)}, koperasi_only: {len(koperasi_data)}")


class TestCategoryCRUD:
    """Test category CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as superadmin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPERADMIN_EMAIL,
            "password": SUPERADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def test_create_update_category(self):
        """Test create and update category"""
        import time
        unique_code = f"test_crud_{int(time.time())}"
        
        # Create
        create_data = {
            "name": "Test CRUD Category",
            "code": unique_code,
            "description": "Test category for CRUD operations",
            "scope": "shared",
            "icon": "Package",
            "color": "blue",
            "sort_order": 99,
            "commission_eligible": False
        }
        
        response = self.session.post(f"{BASE_URL}/api/categories", json=create_data)
        assert response.status_code == 200, f"Create failed: {response.status_code} - {response.text}"
        
        result = response.json()
        category_id = result.get("id")
        assert category_id, "Should return category id"
        print(f"✓ Created category: {category_id}")
        
        # Update
        update_data = {
            "name": "Updated Test Category",
            "description": "Updated description",
            "commission_eligible": True
        }
        
        response = self.session.put(f"{BASE_URL}/api/categories/{category_id}", json=update_data)
        assert response.status_code == 200, f"Update failed: {response.status_code}"
        print(f"✓ Updated category successfully")
        
        # Verify update - check in koperasi/flat endpoint which includes commission_eligible
        response = self.session.get(f"{BASE_URL}/api/categories/koperasi/flat")
        data = response.json()
        updated_cat = next((c for c in data if c['id'] == category_id), None)
        
        if updated_cat:
            assert updated_cat['name'] == "Updated Test Category"
            # commission_eligible should be present in koperasi/flat response
            assert updated_cat.get('commission_eligible') == True, f"Expected commission_eligible=True, got {updated_cat.get('commission_eligible')}"
            print(f"✓ Verified category update: name={updated_cat['name']}, commission_eligible={updated_cat['commission_eligible']}")
        
        # Delete (soft delete)
        response = self.session.delete(f"{BASE_URL}/api/categories/{category_id}")
        assert response.status_code == 200, f"Delete failed: {response.status_code}"
        print(f"✓ Deleted category successfully")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
