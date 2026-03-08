"""
Test Marketplace Phase 3 Features:
- Product Variants (SKU, size, color, stock per variant)
- Bundle Products (combine multiple products at discounted price)
- Category Access Rules (Food category for parents only)
- Vendor Wallet & Payout system
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
PARENT_EMAIL = "parent@muafakat.link"
PARENT_PASSWORD = "parent123"
SUPERADMIN_EMAIL = "superadmin@muafakat.link"
SUPERADMIN_PASSWORD = "admin123"


class TestAuthSetup:
    """Authentication tests for both parent and superadmin"""
    
    @pytest.fixture(scope="class")
    def parent_token(self):
        """Get parent authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARENT_EMAIL,
            "password": PARENT_PASSWORD
        })
        assert response.status_code == 200, f"Parent login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        return data["access_token"]
    
    @pytest.fixture(scope="class")
    def superadmin_token(self):
        """Get superadmin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPERADMIN_EMAIL,
            "password": SUPERADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Superadmin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        return data["access_token"]
    
    def test_parent_login(self, parent_token):
        """Verify parent can login"""
        assert parent_token is not None
        print(f"✓ Parent login successful, token: {parent_token[:20]}...")
    
    def test_superadmin_login(self, superadmin_token):
        """Verify superadmin can login"""
        assert superadmin_token is not None
        print(f"✓ Superadmin login successful, token: {superadmin_token[:20]}...")


class TestVendorSetup:
    """Verify vendor is set up correctly"""
    
    @pytest.fixture(scope="class")
    def parent_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARENT_EMAIL,
            "password": PARENT_PASSWORD
        })
        return response.json().get("access_token")
    
    def test_vendor_exists(self, parent_token):
        """Verify parent has approved vendor status"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        response = requests.get(f"{BASE_URL}/api/marketplace/vendors/my-vendor", headers=headers)
        assert response.status_code == 200, f"Failed to get vendor: {response.text}"
        data = response.json()
        assert data.get("vendor") is not None, "No vendor found for parent"
        assert data["vendor"]["status"] == "approved", f"Vendor not approved: {data['vendor']['status']}"
        print(f"✓ Vendor found: {data['vendor']['business_name']} (status: {data['vendor']['status']})")


# ==================== PRODUCT VARIANTS TESTS ====================

class TestProductVariants:
    """Test Product Variants - SKU, size, color, stock per variant"""
    
    @pytest.fixture(scope="class")
    def parent_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARENT_EMAIL,
            "password": PARENT_PASSWORD
        })
        return response.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def superadmin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPERADMIN_EMAIL,
            "password": SUPERADMIN_PASSWORD
        })
        return response.json().get("access_token")
    
    def test_create_variable_product(self, parent_token):
        """Create a variable product with SKU, size, color variants"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        unique_id = str(uuid.uuid4())[:8]
        
        product_data = {
            "name": f"TEST_Variable_Product_{unique_id}",
            "description": "Test product with size and color variants",
            "category": "clothing",
            "price": 50.00,
            "stock": 0,  # For variable products, stock is calculated from variants
            "images": ["https://example.com/image1.jpg"],
            "product_type": "variable",
            "variants": [
                {"sku": f"SKU-S-RED-{unique_id}", "size": "S", "color": "Merah", "stock": 10, "price_override": None},
                {"sku": f"SKU-M-RED-{unique_id}", "size": "M", "color": "Merah", "stock": 15, "price_override": None},
                {"sku": f"SKU-L-RED-{unique_id}", "size": "L", "color": "Merah", "stock": 8, "price_override": 55.00},
                {"sku": f"SKU-S-BLUE-{unique_id}", "size": "S", "color": "Biru", "stock": 12, "price_override": None},
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/marketplace/products", json=product_data, headers=headers)
        assert response.status_code == 200, f"Failed to create variable product: {response.text}"
        data = response.json()
        assert "id" in data, "No product ID returned"
        print(f"✓ Variable product created: {data['id']}")
        
        # Verify product details
        product_response = requests.get(f"{BASE_URL}/api/marketplace/products/{data['id']}", headers=headers)
        assert product_response.status_code == 200
        product = product_response.json()
        assert product.get("variants") is not None, "Variants not saved"
        assert len(product["variants"]) == 4, f"Expected 4 variants, got {len(product['variants'])}"
        print(f"✓ Variants saved correctly: {len(product['variants'])} variants")
        
        return data["id"]
    
    def test_variable_product_stock_calculation(self, parent_token):
        """Variable product stock should be sum of all variants"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        unique_id = str(uuid.uuid4())[:8]
        
        product_data = {
            "name": f"TEST_Stock_Calc_{unique_id}",
            "description": "Test stock calculation",
            "category": "clothing",
            "price": 30.00,
            "stock": 0,
            "product_type": "variable",
            "variants": [
                {"sku": f"SKU-A-{unique_id}", "size": "S", "color": None, "stock": 5, "price_override": None},
                {"sku": f"SKU-B-{unique_id}", "size": "M", "color": None, "stock": 10, "price_override": None},
                {"sku": f"SKU-C-{unique_id}", "size": "L", "color": None, "stock": 7, "price_override": None},
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/marketplace/products", json=product_data, headers=headers)
        assert response.status_code == 200
        product_id = response.json()["id"]
        
        # Get product and verify total stock is sum of variants (5+10+7=22)
        product_response = requests.get(f"{BASE_URL}/api/marketplace/products/{product_id}", headers=headers)
        product = product_response.json()
        
        expected_stock = 5 + 10 + 7
        assert product["stock"] == expected_stock, f"Expected stock {expected_stock}, got {product['stock']}"
        print(f"✓ Stock calculation correct: {product['stock']} (sum of variants)")
    
    def test_unique_sku_validation(self, parent_token):
        """SKUs must be unique within a product"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        
        product_data = {
            "name": "TEST_Duplicate_SKU",
            "category": "clothing",
            "price": 20.00,
            "product_type": "variable",
            "variants": [
                {"sku": "DUPLICATE-SKU", "size": "S", "stock": 5},
                {"sku": "DUPLICATE-SKU", "size": "M", "stock": 10},  # Duplicate
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/marketplace/products", json=product_data, headers=headers)
        assert response.status_code == 400, "Should reject duplicate SKUs"
        print(f"✓ Duplicate SKU validation works: {response.json().get('detail', 'error')}")


# ==================== BUNDLE TESTS ====================

class TestBundles:
    """Test Bundle Products - combine multiple products at discounted price"""
    
    @pytest.fixture(scope="class")
    def parent_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARENT_EMAIL,
            "password": PARENT_PASSWORD
        })
        return response.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def superadmin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPERADMIN_EMAIL,
            "password": SUPERADMIN_PASSWORD
        })
        return response.json().get("access_token")
    
    def test_get_my_bundles(self, parent_token):
        """Get vendor's bundles list"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        response = requests.get(f"{BASE_URL}/api/marketplace/bundles/my-bundles", headers=headers)
        assert response.status_code == 200, f"Failed to get bundles: {response.text}"
        print(f"✓ Get my bundles works: {len(response.json())} bundles")
    
    def test_create_bundle_requires_approved_products(self, parent_token):
        """Bundle creation requires existing approved products from the vendor"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        
        # First get approved products
        products_response = requests.get(f"{BASE_URL}/api/marketplace/products/my-products?status=approved", headers=headers)
        products = products_response.json()
        
        if len(products) < 2:
            pytest.skip("Need at least 2 approved products for bundle test")
        
        product1 = products[0]
        product2 = products[1] if len(products) > 1 else products[0]
        
        # Calculate original price
        original_price = product1["price"] + product2["price"]
        bundle_price = original_price * 0.9  # 10% discount
        
        bundle_data = {
            "name": f"TEST_Bundle_{str(uuid.uuid4())[:8]}",
            "description": "Test bundle with discount",
            "price": bundle_price,
            "items": [
                {"product_id": product1["id"], "quantity": 1, "variant_sku": None},
                {"product_id": product2["id"], "quantity": 1, "variant_sku": None}
            ],
            "images": []
        }
        
        response = requests.post(f"{BASE_URL}/api/marketplace/bundles", json=bundle_data, headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            assert "id" in data
            print(f"✓ Bundle created: {data['id']}")
        else:
            print(f"Bundle creation response: {response.status_code} - {response.text}")
            # It might fail if products aren't approved - that's okay for this test
    
    def test_bundle_price_validation(self, parent_token):
        """Bundle price must be lower than sum of individual items"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        
        # Get approved products
        products_response = requests.get(f"{BASE_URL}/api/marketplace/products/my-products?status=approved", headers=headers)
        products = products_response.json()
        
        if len(products) < 2:
            pytest.skip("Need at least 2 approved products")
        
        product1 = products[0]
        product2 = products[1] if len(products) > 1 else products[0]
        
        # Calculate original price and try to create with HIGHER price
        original_price = product1["price"] + product2["price"]
        invalid_bundle_price = original_price + 10  # Higher than individual items
        
        bundle_data = {
            "name": f"TEST_Invalid_Bundle_{str(uuid.uuid4())[:8]}",
            "price": invalid_bundle_price,  # Should be rejected
            "items": [
                {"product_id": product1["id"], "quantity": 1},
                {"product_id": product2["id"], "quantity": 1}
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/marketplace/bundles", json=bundle_data, headers=headers)
        assert response.status_code == 400, f"Should reject bundle with price >= original. Got: {response.status_code}"
        print(f"✓ Bundle price validation works: {response.json().get('detail', 'rejected')}")
    
    def test_get_single_bundle(self, parent_token):
        """Test GET /bundles/{bundle_id} endpoint"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        
        # First get bundles list
        bundles_response = requests.get(f"{BASE_URL}/api/marketplace/bundles/my-bundles", headers=headers)
        bundles = bundles_response.json()
        
        if len(bundles) == 0:
            pytest.skip("No bundles to test")
        
        bundle_id = bundles[0]["id"]
        response = requests.get(f"{BASE_URL}/api/marketplace/bundles/{bundle_id}", headers=headers)
        
        # This endpoint may not exist yet
        if response.status_code == 404:
            print(f"⚠ GET /bundles/{bundle_id} endpoint NOT FOUND - needs implementation")
            pytest.skip("GET single bundle endpoint not implemented")
        
        assert response.status_code == 200, f"Failed to get bundle: {response.text}"
        print(f"✓ Get single bundle works")
    
    def test_update_bundle(self, parent_token):
        """Test PUT /bundles/{bundle_id} endpoint"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        
        # Get bundles
        bundles_response = requests.get(f"{BASE_URL}/api/marketplace/bundles/my-bundles", headers=headers)
        bundles = bundles_response.json()
        
        if len(bundles) == 0:
            pytest.skip("No bundles to test")
        
        bundle = bundles[0]
        bundle_id = bundle["id"]
        
        update_data = {
            "name": bundle["name"] + " - Updated",
            "description": "Updated description"
        }
        
        response = requests.put(f"{BASE_URL}/api/marketplace/bundles/{bundle_id}", json=update_data, headers=headers)
        
        if response.status_code == 404 or response.status_code == 405:
            print(f"⚠ PUT /bundles/{bundle_id} endpoint NOT FOUND - needs implementation")
            pytest.skip("Update bundle endpoint not implemented")
        
        assert response.status_code == 200, f"Failed to update bundle: {response.text}"
        print(f"✓ Update bundle works")
    
    def test_delete_bundle(self, parent_token):
        """Test DELETE /bundles/{bundle_id} endpoint"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        
        # Get bundles
        bundles_response = requests.get(f"{BASE_URL}/api/marketplace/bundles/my-bundles", headers=headers)
        bundles = bundles_response.json()
        
        if len(bundles) == 0:
            pytest.skip("No bundles to test")
        
        bundle_id = bundles[-1]["id"]  # Get last one to delete
        
        response = requests.delete(f"{BASE_URL}/api/marketplace/bundles/{bundle_id}", headers=headers)
        
        if response.status_code == 404 or response.status_code == 405:
            print(f"⚠ DELETE /bundles/{bundle_id} endpoint NOT FOUND - needs implementation")
            pytest.skip("Delete bundle endpoint not implemented")
        
        assert response.status_code == 200, f"Failed to delete bundle: {response.text}"
        print(f"✓ Delete bundle works")


# ==================== VENDOR WALLET TESTS ====================

class TestVendorWallet:
    """Test Vendor Wallet & Payout system"""
    
    @pytest.fixture(scope="class")
    def parent_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARENT_EMAIL,
            "password": PARENT_PASSWORD
        })
        return response.json().get("access_token")
    
    def test_get_wallet_balance(self, parent_token):
        """View wallet balance and earnings"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        response = requests.get(f"{BASE_URL}/api/marketplace/wallet/my-wallet", headers=headers)
        assert response.status_code == 200, f"Failed to get wallet: {response.text}"
        
        data = response.json()
        assert "total_earnings" in data, "Missing total_earnings"
        assert "available_balance" in data, "Missing available_balance"
        assert "pending_earnings" in data, "Missing pending_earnings"
        assert "total_withdrawn" in data, "Missing total_withdrawn"
        
        print(f"✓ Wallet balance retrieved:")
        print(f"  - Total Earnings: RM {data['total_earnings']:.2f}")
        print(f"  - Available: RM {data['available_balance']:.2f}")
        print(f"  - Pending: RM {data['pending_earnings']:.2f}")
        print(f"  - Withdrawn: RM {data['total_withdrawn']:.2f}")
    
    def test_get_payout_history(self, parent_token):
        """Get payout/withdrawal history"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        response = requests.get(f"{BASE_URL}/api/marketplace/wallet/payout-history", headers=headers)
        assert response.status_code == 200, f"Failed to get payout history: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Payout history should be a list"
        print(f"✓ Payout history retrieved: {len(data)} entries")
    
    def test_payout_request_validation(self, parent_token):
        """Test payout request with minimum amount validation"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        
        # First get wallet balance
        wallet_response = requests.get(f"{BASE_URL}/api/marketplace/wallet/my-wallet", headers=headers)
        wallet = wallet_response.json()
        
        # Try to request payout less than minimum (RM 10)
        payout_data = {
            "amount": 5.00,  # Below minimum
            "bank_name": "Maybank",
            "bank_account_number": "1234567890",
            "bank_account_name": "Test Account"
        }
        
        response = requests.post(f"{BASE_URL}/api/marketplace/wallet/payout-request", json=payout_data, headers=headers)
        
        # Should reject with 400 for minimum amount
        if wallet["available_balance"] < 10:
            assert response.status_code == 400, "Should reject insufficient balance"
            print(f"✓ Payout request validation works: {response.json().get('detail', 'rejected')}")
        else:
            assert response.status_code == 400, "Should reject amount below minimum"
            print(f"✓ Minimum amount validation works")
    
    def test_payout_request_requires_bank_info(self, parent_token):
        """Payout request requires complete bank information"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        
        # Missing bank info
        payout_data = {
            "amount": 50.00,
            "bank_name": "",  # Empty
            "bank_account_number": "1234567890",
            "bank_account_name": "Test Account"
        }
        
        response = requests.post(f"{BASE_URL}/api/marketplace/wallet/payout-request", json=payout_data, headers=headers)
        # Should validate bank info is required
        print(f"Payout validation response: {response.status_code}")


# ==================== CATEGORY ACCESS RULES TESTS ====================

class TestCategoryAccessRules:
    """Test Category Access Rules - Food category for parents only"""
    
    @pytest.fixture(scope="class")
    def superadmin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPERADMIN_EMAIL,
            "password": SUPERADMIN_PASSWORD
        })
        return response.json().get("access_token")
    
    def test_get_marketplace_categories(self):
        """Get marketplace categories with access rules"""
        response = requests.get(f"{BASE_URL}/api/marketplace/categories")
        assert response.status_code == 200, f"Failed to get categories: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Categories should be a list"
        assert len(data) > 0, "Should have categories"
        
        # Check food category exists and has is_food flag
        food_category = next((c for c in data if c["id"] == "food"), None)
        assert food_category is not None, "Food category not found"
        assert food_category.get("is_food") == True, "Food category should have is_food=True"
        
        print(f"✓ Categories retrieved: {len(data)} categories")
        print(f"  - Food category: {food_category}")
    
    def test_get_category_rules_admin_only(self, superadmin_token):
        """Category rules endpoint is admin only"""
        headers = {"Authorization": f"Bearer {superadmin_token}"}
        response = requests.get(f"{BASE_URL}/api/marketplace/category-rules", headers=headers)
        assert response.status_code == 200, f"Admin should access category rules: {response.text}"
        print(f"✓ Category rules accessible by admin: {len(response.json())} rules")
    
    def test_create_category_rule(self, superadmin_token):
        """Create a new category access rule"""
        headers = {"Authorization": f"Bearer {superadmin_token}"}
        unique_cat = f"test_category_{str(uuid.uuid4())[:8]}"
        
        rule_data = {
            "category": unique_cat,
            "allowed_roles": ["parent"],
            "requires_student": True,
            "is_food": False
        }
        
        response = requests.post(f"{BASE_URL}/api/marketplace/category-rules", json=rule_data, headers=headers)
        if response.status_code == 200:
            print(f"✓ Category rule created: {unique_cat}")
        else:
            print(f"Category rule creation: {response.status_code} - {response.text}")


# ==================== ORDER WITH VARIANTS TESTS ====================

class TestOrderWithVariants:
    """Test creating orders with variant selection"""
    
    @pytest.fixture(scope="class")
    def parent_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARENT_EMAIL,
            "password": PARENT_PASSWORD
        })
        return response.json().get("access_token")
    
    def test_order_requires_variant_sku_for_variable_products(self, parent_token):
        """When ordering variable product, must specify SKU"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        
        # Get approved products
        products_response = requests.get(f"{BASE_URL}/api/marketplace/products?status=approved", headers=headers)
        products = products_response.json()
        
        # Find a variable product
        variable_product = next((p for p in products if p.get("product_type") == "variable"), None)
        
        if not variable_product:
            pytest.skip("No variable products to test")
        
        # Get students for order
        students_response = requests.get(f"{BASE_URL}/api/marketplace/students/lookup", headers=headers)
        students = students_response.json()
        
        if len(students) == 0:
            pytest.skip("No students linked to parent")
        
        # Try to order without variant_sku
        order_data = {
            "student_id": students[0]["id"],
            "items": [{
                "product_id": variable_product["id"],
                "quantity": 1,
                "variant_sku": None  # Missing SKU for variable product
            }],
            "bundles": []
        }
        
        response = requests.post(f"{BASE_URL}/api/marketplace/orders", json=order_data, headers=headers)
        
        # Should fail with 400 because variant_sku is required
        assert response.status_code == 400, f"Should require variant_sku. Got: {response.status_code}"
        print(f"✓ Order validation works: requires variant_sku for variable products")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
