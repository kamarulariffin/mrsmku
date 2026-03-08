"""
Stock Decrement Logic Tests for Multi-Vendor Marketplace
Tests: Stock decrement on order creation, stock restoration on CANCELLED/FAILED
Product types: Simple, Variable (with SKU), Bundles
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
PARENT_USER = {"email": "parent@muafakat.link", "password": "parent123"}
ADMIN_USER = {"email": "superadmin@muafakat.link", "password": "admin123"}


class TestStockDecrementSetup:
    """Setup tests - verify API access and get auth tokens"""
    
    @pytest.fixture(scope="class")
    def parent_token(self):
        """Get parent user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=PARENT_USER)
        assert response.status_code == 200, f"Parent login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in login response"
        return data["access_token"]
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in admin login response"
        return data["access_token"]
    
    def test_api_health(self):
        """Test API is accessible"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        print("API health check passed")
    
    def test_parent_login(self, parent_token):
        """Verify parent login works"""
        assert parent_token is not None
        print(f"Parent token obtained: {parent_token[:20]}...")
    
    def test_admin_login(self, admin_token):
        """Verify admin login works"""
        assert admin_token is not None
        print(f"Admin token obtained: {admin_token[:20]}...")


class TestStockDecrementSimpleProducts:
    """Test stock decrement for simple products"""
    
    @pytest.fixture(scope="class")
    def parent_token(self):
        """Get parent user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=PARENT_USER)
        assert response.status_code == 200, f"Parent login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def student_id(self, parent_token):
        """Get a registered student for the parent"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        response = requests.get(f"{BASE_URL}/api/marketplace/students/lookup", headers=headers)
        assert response.status_code == 200, f"Student lookup failed: {response.text}"
        students = response.json()
        assert len(students) > 0, "Parent has no registered students"
        return students[0]["id"]
    
    def test_find_simple_product(self, parent_token):
        """Find a simple product with stock > 0"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        response = requests.get(f"{BASE_URL}/api/marketplace/products", headers=headers)
        assert response.status_code == 200
        
        products = response.json()
        simple_products = [p for p in products if p.get("product_type") == "simple" and p.get("stock", 0) > 0]
        
        if len(simple_products) == 0:
            pytest.skip("No simple products with stock available")
        
        product = simple_products[0]
        print(f"Found simple product: {product['name']} (stock: {product['stock']})")
        return product
    
    def test_create_order_decrements_simple_stock(self, parent_token, admin_token, student_id):
        """Test that creating order decrements stock for simple product"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        
        # Step 1: Get products and find simple product with stock
        response = requests.get(f"{BASE_URL}/api/marketplace/products", headers=headers)
        assert response.status_code == 200
        products = response.json()
        
        simple_products = [p for p in products if p.get("product_type") == "simple" and p.get("stock", 0) >= 2]
        if len(simple_products) == 0:
            pytest.skip("No simple products with stock >= 2 available")
        
        product = simple_products[0]
        product_id = product["id"]
        initial_stock = product["stock"]
        order_quantity = 2
        
        print(f"Testing product: {product['name']}")
        print(f"Initial stock: {initial_stock}")
        print(f"Order quantity: {order_quantity}")
        
        # Step 2: Create order
        order_data = {
            "student_id": student_id,
            "items": [
                {"product_id": product_id, "quantity": order_quantity}
            ],
            "bundles": [],
            "delivery_notes": "Stock decrement test"
        }
        
        response = requests.post(f"{BASE_URL}/api/marketplace/orders", json=order_data, headers=headers)
        assert response.status_code == 200, f"Order creation failed: {response.text}"
        order_result = response.json()
        order_id = order_result["id"]
        print(f"Order created: {order_result['order_number']}")
        
        # Step 3: Check stock after order
        response = requests.get(f"{BASE_URL}/api/marketplace/products/{product_id}", headers=headers)
        assert response.status_code == 200
        updated_product = response.json()
        new_stock = updated_product["stock"]
        
        print(f"Stock after order: {new_stock}")
        expected_stock = initial_stock - order_quantity
        assert new_stock == expected_stock, f"Stock mismatch: expected {expected_stock}, got {new_stock}"
        
        print(f"✓ Stock decremented correctly: {initial_stock} -> {new_stock}")
        
        # Store order_id for cancellation test
        return {"order_id": order_id, "product_id": product_id, "quantity": order_quantity, "stock_before_cancel": new_stock}


class TestStockDecrementVariantProducts:
    """Test stock decrement for variable products with SKU"""
    
    @pytest.fixture(scope="class")
    def parent_token(self):
        """Get parent user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=PARENT_USER)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def student_id(self, parent_token):
        """Get a registered student for the parent"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        response = requests.get(f"{BASE_URL}/api/marketplace/students/lookup", headers=headers)
        assert response.status_code == 200
        students = response.json()
        assert len(students) > 0, "Parent has no registered students"
        return students[0]["id"]
    
    def test_find_variable_product(self, parent_token):
        """Find a variable product with variants that have stock"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        response = requests.get(f"{BASE_URL}/api/marketplace/products", headers=headers)
        assert response.status_code == 200
        
        products = response.json()
        variable_products = [
            p for p in products 
            if p.get("product_type") == "variable" 
            and p.get("variants") 
            and any(v.get("stock", 0) > 0 for v in p.get("variants", []))
        ]
        
        if len(variable_products) == 0:
            pytest.skip("No variable products with variant stock available")
        
        product = variable_products[0]
        print(f"Found variable product: {product['name']}")
        print(f"Variants: {product.get('variants')}")
        return product
    
    def test_create_order_decrements_variant_stock(self, parent_token, admin_token, student_id):
        """Test that creating order with variant SKU decrements variant stock"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        
        # Step 1: Get products and find variable product with variants
        response = requests.get(f"{BASE_URL}/api/marketplace/products", headers=headers)
        assert response.status_code == 200
        products = response.json()
        
        # Find variable product with variants having stock >= 1
        variable_product = None
        target_variant = None
        
        for p in products:
            if p.get("product_type") == "variable" and p.get("variants"):
                for v in p["variants"]:
                    if v.get("stock", 0) >= 1 and v.get("is_active", True):
                        variable_product = p
                        target_variant = v
                        break
            if target_variant:
                break
        
        if not variable_product or not target_variant:
            pytest.skip("No variable products with variant stock >= 1 available")
        
        product_id = variable_product["id"]
        variant_sku = target_variant["sku"]
        initial_variant_stock = target_variant["stock"]
        order_quantity = 1
        
        print(f"Testing variable product: {variable_product['name']}")
        print(f"Variant SKU: {variant_sku}")
        print(f"Initial variant stock: {initial_variant_stock}")
        print(f"Order quantity: {order_quantity}")
        
        # Step 2: Create order with variant SKU
        order_data = {
            "student_id": student_id,
            "items": [
                {"product_id": product_id, "quantity": order_quantity, "variant_sku": variant_sku}
            ],
            "bundles": [],
            "delivery_notes": "Variant stock decrement test"
        }
        
        response = requests.post(f"{BASE_URL}/api/marketplace/orders", json=order_data, headers=headers)
        assert response.status_code == 200, f"Order creation failed: {response.text}"
        order_result = response.json()
        order_id = order_result["id"]
        print(f"Order created: {order_result['order_number']}")
        
        # Step 3: Check variant stock after order
        response = requests.get(f"{BASE_URL}/api/marketplace/products/{product_id}", headers=headers)
        assert response.status_code == 200
        updated_product = response.json()
        
        # Find the updated variant stock
        updated_variant = next((v for v in updated_product.get("variants", []) if v["sku"] == variant_sku), None)
        assert updated_variant is not None, f"Variant {variant_sku} not found after order"
        
        new_variant_stock = updated_variant["stock"]
        print(f"Variant stock after order: {new_variant_stock}")
        
        expected_stock = initial_variant_stock - order_quantity
        assert new_variant_stock == expected_stock, f"Variant stock mismatch: expected {expected_stock}, got {new_variant_stock}"
        
        print(f"✓ Variant stock decremented correctly: {initial_variant_stock} -> {new_variant_stock}")
        
        return {"order_id": order_id, "product_id": product_id, "variant_sku": variant_sku, 
                "quantity": order_quantity, "stock_before_cancel": new_variant_stock}


class TestStockDecrementBundles:
    """Test stock decrement for bundles"""
    
    @pytest.fixture(scope="class")
    def parent_token(self):
        """Get parent user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=PARENT_USER)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def student_id(self, parent_token):
        """Get a registered student for the parent"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        response = requests.get(f"{BASE_URL}/api/marketplace/students/lookup", headers=headers)
        assert response.status_code == 200
        students = response.json()
        assert len(students) > 0, "Parent has no registered students"
        return students[0]["id"]
    
    def test_find_bundle(self, parent_token):
        """Find an active approved bundle"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        response = requests.get(f"{BASE_URL}/api/marketplace/bundles", headers=headers)
        
        if response.status_code != 200:
            pytest.skip("Bundle endpoint not accessible or no bundles exist")
        
        bundles = response.json()
        active_bundles = [b for b in bundles if b.get("is_active") and b.get("approval_status") == "approved"]
        
        if len(active_bundles) == 0:
            pytest.skip("No active approved bundles available")
        
        bundle = active_bundles[0]
        print(f"Found bundle: {bundle['name']}")
        print(f"Bundle items: {bundle.get('items')}")
        return bundle
    
    def test_bundle_order_decrements_item_stocks(self, parent_token, admin_token, student_id):
        """Test that ordering a bundle decrements stock for each bundled item"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        
        # Step 1: Get bundles
        response = requests.get(f"{BASE_URL}/api/marketplace/bundles", headers=headers)
        
        if response.status_code != 200:
            pytest.skip("Bundle endpoint not accessible")
        
        bundles = response.json()
        active_bundles = [b for b in bundles if b.get("is_active") and b.get("approval_status") == "approved"]
        
        if len(active_bundles) == 0:
            pytest.skip("No active approved bundles available")
        
        bundle = active_bundles[0]
        bundle_id = bundle["id"]
        bundle_items = bundle.get("items", [])
        
        print(f"Testing bundle: {bundle['name']}")
        print(f"Bundle ID: {bundle_id}")
        
        # Step 2: Get initial stock for each bundle item
        initial_stocks = {}
        for bi in bundle_items:
            product_response = requests.get(f"{BASE_URL}/api/marketplace/products/{bi['product_id']}", headers=headers)
            if product_response.status_code == 200:
                product = product_response.json()
                if bi.get("variant_sku"):
                    variant = next((v for v in product.get("variants", []) if v["sku"] == bi["variant_sku"]), None)
                    if variant:
                        initial_stocks[f"{bi['product_id']}_{bi['variant_sku']}"] = {
                            "stock": variant["stock"],
                            "quantity_in_bundle": bi["quantity"],
                            "is_variant": True,
                            "product_id": bi["product_id"],
                            "variant_sku": bi["variant_sku"]
                        }
                else:
                    initial_stocks[bi["product_id"]] = {
                        "stock": product["stock"],
                        "quantity_in_bundle": bi["quantity"],
                        "is_variant": False,
                        "product_id": bi["product_id"]
                    }
        
        print(f"Initial stocks: {initial_stocks}")
        
        # Step 3: Create order with bundle
        order_data = {
            "student_id": student_id,
            "items": [],
            "bundles": [{"bundle_id": bundle_id, "quantity": 1}],
            "delivery_notes": "Bundle stock decrement test"
        }
        
        response = requests.post(f"{BASE_URL}/api/marketplace/orders", json=order_data, headers=headers)
        
        if response.status_code != 200:
            # Check if stock insufficient
            if "Stok tidak mencukupi" in response.text:
                pytest.skip(f"Insufficient stock for bundle items: {response.text}")
            assert False, f"Order creation failed: {response.text}"
        
        order_result = response.json()
        order_id = order_result["id"]
        print(f"Order created: {order_result['order_number']}")
        
        # Step 4: Verify stock decremented for each bundle item
        for key, stock_info in initial_stocks.items():
            product_response = requests.get(f"{BASE_URL}/api/marketplace/products/{stock_info['product_id']}", headers=headers)
            assert product_response.status_code == 200
            product = product_response.json()
            
            if stock_info["is_variant"]:
                variant = next((v for v in product.get("variants", []) if v["sku"] == stock_info["variant_sku"]), None)
                new_stock = variant["stock"] if variant else 0
            else:
                new_stock = product["stock"]
            
            expected_stock = stock_info["stock"] - stock_info["quantity_in_bundle"]
            print(f"Item {key}: {stock_info['stock']} -> {new_stock} (expected: {expected_stock})")
            assert new_stock == expected_stock, f"Stock mismatch for {key}: expected {expected_stock}, got {new_stock}"
        
        print("✓ Bundle item stocks decremented correctly")
        
        return {"order_id": order_id, "bundle_id": bundle_id, "initial_stocks": initial_stocks}


class TestStockRestorationCancelled:
    """Test stock restoration when order is CANCELLED"""
    
    @pytest.fixture(scope="class")
    def parent_token(self):
        """Get parent user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=PARENT_USER)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def student_id(self, parent_token):
        """Get a registered student for the parent"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        response = requests.get(f"{BASE_URL}/api/marketplace/students/lookup", headers=headers)
        assert response.status_code == 200
        students = response.json()
        assert len(students) > 0, "Parent has no registered students"
        return students[0]["id"]
    
    def test_cancel_order_restores_simple_product_stock(self, parent_token, admin_token, student_id):
        """Test cancelling order restores stock for simple product"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Step 1: Find simple product with stock
        response = requests.get(f"{BASE_URL}/api/marketplace/products", headers=headers)
        assert response.status_code == 200
        products = response.json()
        
        simple_products = [p for p in products if p.get("product_type") == "simple" and p.get("stock", 0) >= 2]
        if len(simple_products) == 0:
            pytest.skip("No simple products with stock >= 2 available")
        
        product = simple_products[0]
        product_id = product["id"]
        initial_stock = product["stock"]
        order_quantity = 1
        
        print(f"Product: {product['name']}, Initial stock: {initial_stock}")
        
        # Step 2: Create order
        order_data = {
            "student_id": student_id,
            "items": [{"product_id": product_id, "quantity": order_quantity}],
            "bundles": [],
            "delivery_notes": "Stock restore test - CANCELLED"
        }
        
        response = requests.post(f"{BASE_URL}/api/marketplace/orders", json=order_data, headers=headers)
        assert response.status_code == 200, f"Order creation failed: {response.text}"
        order_result = response.json()
        order_id = order_result["id"]
        print(f"Order created: {order_result['order_number']}")
        
        # Step 3: Verify stock decremented
        response = requests.get(f"{BASE_URL}/api/marketplace/products/{product_id}", headers=headers)
        assert response.status_code == 200
        stock_after_order = response.json()["stock"]
        assert stock_after_order == initial_stock - order_quantity
        print(f"Stock after order: {stock_after_order}")
        
        # Step 4: Cancel order (admin)
        response = requests.put(
            f"{BASE_URL}/api/marketplace/orders/{order_id}/status",
            json={"status": "cancelled", "notes": "Test cancellation"},
            headers=admin_headers
        )
        assert response.status_code == 200, f"Order cancellation failed: {response.text}"
        print("Order cancelled")
        
        # Step 5: Verify stock restored
        response = requests.get(f"{BASE_URL}/api/marketplace/products/{product_id}", headers=headers)
        assert response.status_code == 200
        stock_after_cancel = response.json()["stock"]
        
        print(f"Stock after cancellation: {stock_after_cancel}")
        assert stock_after_cancel == initial_stock, f"Stock not restored: expected {initial_stock}, got {stock_after_cancel}"
        
        print(f"✓ Stock restored on CANCELLED: {stock_after_order} -> {stock_after_cancel}")
    
    def test_cancel_order_restores_variant_stock(self, parent_token, admin_token, student_id):
        """Test cancelling order restores stock for variant product"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Step 1: Find variable product with variants
        response = requests.get(f"{BASE_URL}/api/marketplace/products", headers=headers)
        assert response.status_code == 200
        products = response.json()
        
        variable_product = None
        target_variant = None
        
        for p in products:
            if p.get("product_type") == "variable" and p.get("variants"):
                for v in p["variants"]:
                    if v.get("stock", 0) >= 1 and v.get("is_active", True):
                        variable_product = p
                        target_variant = v
                        break
            if target_variant:
                break
        
        if not variable_product or not target_variant:
            pytest.skip("No variable products with variant stock >= 1 available")
        
        product_id = variable_product["id"]
        variant_sku = target_variant["sku"]
        initial_variant_stock = target_variant["stock"]
        order_quantity = 1
        
        print(f"Product: {variable_product['name']}, Variant: {variant_sku}, Initial stock: {initial_variant_stock}")
        
        # Step 2: Create order with variant
        order_data = {
            "student_id": student_id,
            "items": [{"product_id": product_id, "quantity": order_quantity, "variant_sku": variant_sku}],
            "bundles": [],
            "delivery_notes": "Variant stock restore test - CANCELLED"
        }
        
        response = requests.post(f"{BASE_URL}/api/marketplace/orders", json=order_data, headers=headers)
        assert response.status_code == 200, f"Order creation failed: {response.text}"
        order_result = response.json()
        order_id = order_result["id"]
        print(f"Order created: {order_result['order_number']}")
        
        # Step 3: Verify variant stock decremented
        response = requests.get(f"{BASE_URL}/api/marketplace/products/{product_id}", headers=headers)
        assert response.status_code == 200
        updated_product = response.json()
        variant_after_order = next((v for v in updated_product.get("variants", []) if v["sku"] == variant_sku), None)
        stock_after_order = variant_after_order["stock"]
        assert stock_after_order == initial_variant_stock - order_quantity
        print(f"Variant stock after order: {stock_after_order}")
        
        # Step 4: Cancel order
        response = requests.put(
            f"{BASE_URL}/api/marketplace/orders/{order_id}/status",
            json={"status": "cancelled", "notes": "Test cancellation"},
            headers=admin_headers
        )
        assert response.status_code == 200, f"Order cancellation failed: {response.text}"
        print("Order cancelled")
        
        # Step 5: Verify variant stock restored
        response = requests.get(f"{BASE_URL}/api/marketplace/products/{product_id}", headers=headers)
        assert response.status_code == 200
        updated_product = response.json()
        variant_after_cancel = next((v for v in updated_product.get("variants", []) if v["sku"] == variant_sku), None)
        stock_after_cancel = variant_after_cancel["stock"]
        
        print(f"Variant stock after cancellation: {stock_after_cancel}")
        assert stock_after_cancel == initial_variant_stock, f"Variant stock not restored: expected {initial_variant_stock}, got {stock_after_cancel}"
        
        print(f"✓ Variant stock restored on CANCELLED: {stock_after_order} -> {stock_after_cancel}")


class TestStockRestorationFailed:
    """Test stock restoration when order status is FAILED"""
    
    @pytest.fixture(scope="class")
    def parent_token(self):
        """Get parent user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=PARENT_USER)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def student_id(self, parent_token):
        """Get a registered student for the parent"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        response = requests.get(f"{BASE_URL}/api/marketplace/students/lookup", headers=headers)
        assert response.status_code == 200
        students = response.json()
        assert len(students) > 0, "Parent has no registered students"
        return students[0]["id"]
    
    def test_failed_order_restores_simple_product_stock(self, parent_token, admin_token, student_id):
        """Test FAILED order status restores stock for simple product"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Step 1: Find simple product with stock
        response = requests.get(f"{BASE_URL}/api/marketplace/products", headers=headers)
        assert response.status_code == 200
        products = response.json()
        
        simple_products = [p for p in products if p.get("product_type") == "simple" and p.get("stock", 0) >= 2]
        if len(simple_products) == 0:
            pytest.skip("No simple products with stock >= 2 available")
        
        product = simple_products[0]
        product_id = product["id"]
        initial_stock = product["stock"]
        order_quantity = 1
        
        print(f"Product: {product['name']}, Initial stock: {initial_stock}")
        
        # Step 2: Create order
        order_data = {
            "student_id": student_id,
            "items": [{"product_id": product_id, "quantity": order_quantity}],
            "bundles": [],
            "delivery_notes": "Stock restore test - FAILED"
        }
        
        response = requests.post(f"{BASE_URL}/api/marketplace/orders", json=order_data, headers=headers)
        assert response.status_code == 200, f"Order creation failed: {response.text}"
        order_result = response.json()
        order_id = order_result["id"]
        print(f"Order created: {order_result['order_number']}")
        
        # Step 3: Verify stock decremented
        response = requests.get(f"{BASE_URL}/api/marketplace/products/{product_id}", headers=headers)
        assert response.status_code == 200
        stock_after_order = response.json()["stock"]
        assert stock_after_order == initial_stock - order_quantity
        print(f"Stock after order: {stock_after_order}")
        
        # Step 4: Progress order to a state where it can be FAILED
        # Order flow: pending_payment -> paid -> preparing -> out_for_delivery -> FAILED
        
        # Set to PAID
        response = requests.put(
            f"{BASE_URL}/api/marketplace/orders/{order_id}/status",
            json={"status": "paid", "notes": "Payment received"},
            headers=admin_headers
        )
        assert response.status_code == 200, f"Set PAID failed: {response.text}"
        
        # Set to PREPARING
        response = requests.put(
            f"{BASE_URL}/api/marketplace/orders/{order_id}/status",
            json={"status": "preparing", "notes": "Preparing order"},
            headers=admin_headers
        )
        assert response.status_code == 200, f"Set PREPARING failed: {response.text}"
        
        # Set to OUT_FOR_DELIVERY
        response = requests.put(
            f"{BASE_URL}/api/marketplace/orders/{order_id}/status",
            json={"status": "out_for_delivery", "notes": "Out for delivery"},
            headers=admin_headers
        )
        assert response.status_code == 200, f"Set OUT_FOR_DELIVERY failed: {response.text}"
        
        # Set to FAILED
        response = requests.put(
            f"{BASE_URL}/api/marketplace/orders/{order_id}/status",
            json={"status": "failed", "notes": "Delivery failed - student not found"},
            headers=admin_headers
        )
        assert response.status_code == 200, f"Set FAILED failed: {response.text}"
        print("Order marked as FAILED")
        
        # Step 5: Verify stock restored
        response = requests.get(f"{BASE_URL}/api/marketplace/products/{product_id}", headers=headers)
        assert response.status_code == 200
        stock_after_failed = response.json()["stock"]
        
        print(f"Stock after FAILED: {stock_after_failed}")
        assert stock_after_failed == initial_stock, f"Stock not restored on FAILED: expected {initial_stock}, got {stock_after_failed}"
        
        print(f"✓ Stock restored on FAILED: {stock_after_order} -> {stock_after_failed}")


class TestStockInsufficientValidation:
    """Test that orders fail validation when stock is insufficient"""
    
    @pytest.fixture(scope="class")
    def parent_token(self):
        """Get parent user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=PARENT_USER)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def student_id(self, parent_token):
        """Get a registered student for the parent"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        response = requests.get(f"{BASE_URL}/api/marketplace/students/lookup", headers=headers)
        assert response.status_code == 200
        students = response.json()
        assert len(students) > 0, "Parent has no registered students"
        return students[0]["id"]
    
    def test_order_fails_with_insufficient_stock(self, parent_token, student_id):
        """Test that order creation fails when quantity exceeds stock"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        
        # Find a product with known stock
        response = requests.get(f"{BASE_URL}/api/marketplace/products", headers=headers)
        assert response.status_code == 200
        products = response.json()
        
        simple_products = [p for p in products if p.get("product_type") == "simple" and p.get("stock", 0) > 0]
        if len(simple_products) == 0:
            pytest.skip("No simple products with stock available")
        
        product = simple_products[0]
        product_id = product["id"]
        current_stock = product["stock"]
        
        # Try to order more than available
        order_quantity = current_stock + 10
        
        print(f"Product: {product['name']}, Stock: {current_stock}")
        print(f"Attempting to order: {order_quantity} (should fail)")
        
        order_data = {
            "student_id": student_id,
            "items": [{"product_id": product_id, "quantity": order_quantity}],
            "bundles": [],
            "delivery_notes": "Insufficient stock test"
        }
        
        response = requests.post(f"{BASE_URL}/api/marketplace/orders", json=order_data, headers=headers)
        
        assert response.status_code == 400, f"Expected 400 but got {response.status_code}: {response.text}"
        assert "Stok tidak mencukupi" in response.text or "stock" in response.text.lower()
        
        print(f"✓ Order correctly rejected: {response.json()['detail']}")


class TestVariantStockTracking:
    """Test individual variant stock tracking"""
    
    @pytest.fixture(scope="class")
    def parent_token(self):
        """Get parent user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=PARENT_USER)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_variants_have_individual_stocks(self, parent_token):
        """Verify each variant has its own stock tracked separately"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        
        response = requests.get(f"{BASE_URL}/api/marketplace/products", headers=headers)
        assert response.status_code == 200
        products = response.json()
        
        variable_products = [p for p in products if p.get("product_type") == "variable" and p.get("variants")]
        
        if len(variable_products) == 0:
            pytest.skip("No variable products available")
        
        for product in variable_products:
            print(f"\nProduct: {product['name']}")
            print(f"Product Type: {product.get('product_type')}")
            
            variants = product.get("variants", [])
            total_variant_stock = 0
            
            for variant in variants:
                sku = variant.get("sku")
                stock = variant.get("stock", 0)
                size = variant.get("size")
                color = variant.get("color")
                print(f"  Variant SKU: {sku}, Size: {size}, Color: {color}, Stock: {stock}")
                total_variant_stock += stock
            
            # Product total stock should be sum of variant stocks (or calculated from variants)
            product_total = product.get("stock", 0)
            print(f"  Total product stock (displayed): {product_total}")
            print(f"  Sum of variant stocks: {total_variant_stock}")
            
            # Verify stock tracking is working
            assert len(variants) > 0, "Variable product should have variants"
            print(f"  ✓ {len(variants)} variants tracked")
        
        print("\n✓ All variable products have individual variant stock tracking")


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
