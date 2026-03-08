"""
Test Vendor Dashboard (FASA 2) - Tests for parent vendor functionality
Tests: Vendor Dashboard stats, My Products, My Vendor, Product CRUD, Orders management
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestVendorDashboard:
    """Test vendor dashboard endpoints for parent users"""
    
    @pytest.fixture(scope="class")
    def parent_token(self):
        """Get parent user token - parent@muafakat.link"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "parent@muafakat.link",
            "password": "parent123"
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip(f"Parent login failed: {response.status_code} - {response.text}")
    
    @pytest.fixture(scope="class")
    def superadmin_token(self):
        """Get superadmin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "admin123"
        })
        assert response.status_code == 200, f"SuperAdmin login failed: {response.text}"
        return response.json()["access_token"]
    
    # --- Test Dashboard Stats ---
    
    def test_dashboard_stats_returns_vendor_type(self, parent_token):
        """Dashboard stats should return type=vendor for approved vendor"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/dashboard/stats",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        assert response.status_code == 200, f"Dashboard stats failed: {response.text}"
        data = response.json()
        assert data.get("type") == "vendor", f"Expected type=vendor, got: {data.get('type')}"
    
    def test_dashboard_stats_has_vendor_fields(self, parent_token):
        """Dashboard stats should have vendor-specific fields"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/dashboard/stats",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        data = response.json()
        required_fields = ["my_products", "pending_products", "my_orders", 
                          "pending_orders", "total_sales", "total_earnings"]
        for field in required_fields:
            assert field in data, f"Missing vendor field: {field}"
    
    def test_dashboard_stats_vendor_status_is_approved(self, parent_token):
        """Dashboard stats should show vendor_status as approved"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/dashboard/stats",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        data = response.json()
        assert data.get("vendor_status") == "approved", f"Expected vendor_status=approved, got: {data.get('vendor_status')}"
    
    # --- Test My Vendor Profile ---
    
    def test_my_vendor_returns_vendor_data(self, parent_token):
        """GET /api/marketplace/vendors/my-vendor should return vendor profile"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/vendors/my-vendor",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        assert response.status_code == 200, f"My vendor failed: {response.text}"
        data = response.json()
        assert "vendor" in data, "Response should contain 'vendor' key"
    
    def test_my_vendor_has_required_fields(self, parent_token):
        """My vendor should return all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/vendors/my-vendor",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        data = response.json()
        vendor = data.get("vendor")
        assert vendor is not None, "Vendor should not be None"
        
        required_fields = ["id", "business_name", "status", "contact_phone", 
                          "bank_name", "bank_account_number", "bank_account_name"]
        for field in required_fields:
            assert field in vendor, f"Missing field in vendor: {field}"
    
    def test_my_vendor_business_name(self, parent_token):
        """My vendor should have correct business name"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/vendors/my-vendor",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        data = response.json()
        vendor = data.get("vendor")
        # Based on context, vendor is "Kedai Kak Siti"
        assert vendor.get("business_name") == "Kedai Kak Siti", f"Expected 'Kedai Kak Siti', got: {vendor.get('business_name')}"
    
    def test_my_vendor_status_is_approved(self, parent_token):
        """My vendor should have approved status"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/vendors/my-vendor",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        data = response.json()
        vendor = data.get("vendor")
        assert vendor.get("status") == "approved", f"Expected status='approved', got: {vendor.get('status')}"
    
    # --- Test My Products ---
    
    def test_my_products_returns_200(self, parent_token):
        """GET /api/marketplace/products/my-products should return 200"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/products/my-products",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        assert response.status_code == 200, f"My products failed: {response.text}"
    
    def test_my_products_returns_list(self, parent_token):
        """My products should return a list"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/products/my-products",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        data = response.json()
        assert isinstance(data, list), f"Expected list, got: {type(data)}"
    
    def test_my_products_with_status_filter(self, parent_token):
        """My products should support status filter"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/products/my-products?status=approved",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        assert response.status_code == 200, f"My products with filter failed: {response.text}"
    
    def test_my_products_has_correct_structure(self, parent_token):
        """My products should return products with correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/products/my-products",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        data = response.json()
        if len(data) > 0:
            product = data[0]
            expected_fields = ["id", "name", "price", "stock", "approval_status", "category"]
            for field in expected_fields:
                assert field in product, f"Missing field in product: {field}"


class TestProductCRUD:
    """Test product create, update, delete for vendors"""
    
    @pytest.fixture(scope="class")
    def parent_token(self):
        """Get parent user token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "parent@muafakat.link",
            "password": "parent123"
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip(f"Parent login failed: {response.status_code}")
    
    @pytest.fixture(scope="class")
    def created_product_id(self, parent_token):
        """Create a test product and return its ID for other tests"""
        response = requests.post(
            f"{BASE_URL}/api/marketplace/products",
            headers={"Authorization": f"Bearer {parent_token}"},
            json={
                "name": "TEST_Product_For_Testing",
                "description": "Test product for automated testing",
                "category": "general",
                "price": 10.00,
                "stock": 50,
                "images": []
            }
        )
        if response.status_code == 200:
            return response.json().get("id")
        return None
    
    def test_create_product_returns_201_or_200(self, parent_token):
        """Creating a product should succeed"""
        response = requests.post(
            f"{BASE_URL}/api/marketplace/products",
            headers={"Authorization": f"Bearer {parent_token}"},
            json={
                "name": "TEST_New_Product",
                "description": "A test product",
                "category": "food",
                "price": 15.50,
                "stock": 20,
                "images": []
            }
        )
        assert response.status_code in [200, 201], f"Create product failed: {response.text}"
        data = response.json()
        assert "id" in data, "Response should contain product id"
    
    def test_create_product_validation_name_required(self, parent_token):
        """Creating a product without name should fail"""
        response = requests.post(
            f"{BASE_URL}/api/marketplace/products",
            headers={"Authorization": f"Bearer {parent_token}"},
            json={
                "description": "A product without name",
                "category": "food",
                "price": 10.00,
                "stock": 10
            }
        )
        assert response.status_code in [400, 422], "Should reject product without name"
    
    def test_create_product_validation_price_required(self, parent_token):
        """Creating a product without price should fail"""
        response = requests.post(
            f"{BASE_URL}/api/marketplace/products",
            headers={"Authorization": f"Bearer {parent_token}"},
            json={
                "name": "TEST_No_Price_Product",
                "category": "food",
                "stock": 10
            }
        )
        assert response.status_code in [400, 422], "Should reject product without price"
    
    def test_get_single_product(self, parent_token, created_product_id):
        """GET single product by ID should work"""
        if not created_product_id:
            pytest.skip("No product was created")
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/products/{created_product_id}",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        assert response.status_code == 200, f"Get product failed: {response.text}"
        data = response.json()
        assert data.get("id") == created_product_id
    
    def test_update_product(self, parent_token, created_product_id):
        """Updating a product should work"""
        if not created_product_id:
            pytest.skip("No product was created")
        
        response = requests.put(
            f"{BASE_URL}/api/marketplace/products/{created_product_id}",
            headers={"Authorization": f"Bearer {parent_token}"},
            json={
                "stock": 100,
                "description": "Updated description"
            }
        )
        assert response.status_code == 200, f"Update product failed: {response.text}"
    
    def test_delete_product(self, parent_token, created_product_id):
        """Deleting a product should work (soft delete)"""
        if not created_product_id:
            pytest.skip("No product was created")
        
        response = requests.delete(
            f"{BASE_URL}/api/marketplace/products/{created_product_id}",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        assert response.status_code == 200, f"Delete product failed: {response.text}"


class TestVendorOrders:
    """Test vendor orders functionality"""
    
    @pytest.fixture(scope="class")
    def parent_token(self):
        """Get parent user token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "parent@muafakat.link",
            "password": "parent123"
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip(f"Parent login failed: {response.status_code}")
    
    @pytest.fixture(scope="class")
    def vendor_id(self, parent_token):
        """Get vendor ID for parent"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/vendors/my-vendor",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        if response.status_code == 200:
            vendor = response.json().get("vendor")
            if vendor:
                return vendor.get("id")
        return None
    
    def test_get_vendor_orders(self, parent_token, vendor_id):
        """GET orders for vendor should return 200"""
        if not vendor_id:
            pytest.skip("No vendor ID found")
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/orders?vendor_id={vendor_id}",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        assert response.status_code == 200, f"Get vendor orders failed: {response.text}"
    
    def test_vendor_orders_returns_list(self, parent_token, vendor_id):
        """Vendor orders should return a list"""
        if not vendor_id:
            pytest.skip("No vendor ID found")
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/orders?vendor_id={vendor_id}",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        data = response.json()
        assert isinstance(data, list), f"Expected list, got: {type(data)}"
    
    def test_vendor_orders_with_status_filter(self, parent_token, vendor_id):
        """Vendor orders should support status filter"""
        if not vendor_id:
            pytest.skip("No vendor ID found")
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/orders?vendor_id={vendor_id}&status=paid",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        assert response.status_code == 200, f"Get vendor orders with filter failed: {response.text}"


class TestVendorAccessControl:
    """Test access control for vendor endpoints"""
    
    def test_my_products_requires_vendor(self):
        """My products endpoint should require user to be a vendor"""
        # Login as superadmin (who is not a vendor)
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "admin123"
        })
        token = login_res.json()["access_token"]
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/products/my-products",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code in [403, 404], f"Should deny non-vendor: {response.text}"
    
    def test_create_product_requires_approved_vendor(self):
        """Creating product should require approved vendor status"""
        # Login as superadmin (who is not a vendor)
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "admin123"
        })
        token = login_res.json()["access_token"]
        
        response = requests.post(
            f"{BASE_URL}/api/marketplace/products",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "TEST_Unauthorized_Product",
                "price": 10.00,
                "stock": 10,
                "category": "general"
            }
        )
        assert response.status_code in [403, 400], f"Should deny non-vendor: {response.text}"


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(scope="class")
    def parent_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "parent@muafakat.link",
            "password": "parent123"
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        return None
    
    def test_cleanup_test_products(self, parent_token):
        """Cleanup: Delete all TEST_ prefixed products"""
        if not parent_token:
            pytest.skip("No parent token")
        
        # Get all my products
        response = requests.get(
            f"{BASE_URL}/api/marketplace/products/my-products",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        
        if response.status_code == 200:
            products = response.json()
            for product in products:
                if product.get("name", "").startswith("TEST_"):
                    # Delete test product
                    requests.delete(
                        f"{BASE_URL}/api/marketplace/products/{product['id']}",
                        headers={"Authorization": f"Bearer {parent_token}"}
                    )
        
        print("Cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
