"""
Payment Center Module - Backend API Tests
Tests for cart, checkout, receipts, and pending items endpoints
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


@pytest.fixture(scope="module")
def parent_token():
    """Get parent authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": PARENT_EMAIL, "password": PARENT_PASSWORD}
    )
    assert response.status_code == 200, f"Parent login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": SUPERADMIN_EMAIL, "password": SUPERADMIN_PASSWORD}
    )
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture
def auth_headers(parent_token):
    """Return auth headers for parent"""
    return {"Authorization": f"Bearer {parent_token}"}


class TestPaymentCenterCart:
    """Cart functionality tests"""

    def test_get_empty_cart(self, auth_headers):
        """Test GET /api/payment-center/cart returns cart structure"""
        response = requests.get(f"{BASE_URL}/api/payment-center/cart", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total_amount" in data
        assert "item_count" in data
        assert isinstance(data["items"], list)
        assert isinstance(data["total_amount"], (int, float))
        assert isinstance(data["item_count"], int)

    def test_clear_cart(self, auth_headers):
        """Test DELETE /api/payment-center/cart/clear clears all items"""
        response = requests.delete(f"{BASE_URL}/api/payment-center/cart/clear", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Troli dikosongkan"
        assert data["cart"]["item_count"] == 0
        assert len(data["cart"]["items"]) == 0

    def test_add_to_cart_without_auth(self):
        """Test add to cart requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/payment-center/cart/add",
            json={"item_type": "infaq", "item_id": "test123"}
        )
        assert response.status_code == 401

    def test_add_invalid_item_type(self, auth_headers):
        """Test add item with invalid type returns 400"""
        response = requests.post(
            f"{BASE_URL}/api/payment-center/cart/add",
            headers=auth_headers,
            json={"item_type": "invalid_type", "item_id": "test123"}
        )
        assert response.status_code == 400


class TestPaymentCenterPendingItems:
    """Pending items tests"""

    def test_get_pending_items(self, auth_headers):
        """Test GET /api/payment-center/pending-items returns all categories"""
        response = requests.get(f"{BASE_URL}/api/payment-center/pending-items", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # Should have all 4 categories
        assert "yuran" in data
        assert "koperasi" in data
        assert "bus" in data
        assert "infaq" in data
        
        # Each should be a list
        assert isinstance(data["yuran"], list)
        assert isinstance(data["koperasi"], list)
        assert isinstance(data["bus"], list)
        assert isinstance(data["infaq"], list)

    def test_pending_items_requires_auth(self):
        """Test pending items requires authentication"""
        response = requests.get(f"{BASE_URL}/api/payment-center/pending-items")
        assert response.status_code == 401


class TestPaymentCenterReceipts:
    """Receipt functionality tests"""

    def test_get_receipts_list(self, auth_headers):
        """Test GET /api/payment-center/receipts returns receipts list"""
        response = requests.get(f"{BASE_URL}/api/payment-center/receipts", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        assert "receipts" in data
        assert "total" in data
        assert "limit" in data
        assert "skip" in data
        assert isinstance(data["receipts"], list)

    def test_get_receipts_with_pagination(self, auth_headers):
        """Test receipts with limit and skip parameters"""
        response = requests.get(
            f"{BASE_URL}/api/payment-center/receipts?limit=5&skip=0",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["limit"] == 5
        assert data["skip"] == 0

    def test_receipts_requires_auth(self):
        """Test receipts requires authentication"""
        response = requests.get(f"{BASE_URL}/api/payment-center/receipts")
        assert response.status_code == 401


class TestPaymentCenterFullFlow:
    """End-to-end flow test: Add to cart → Checkout → Get receipt"""

    def test_full_payment_flow(self, auth_headers):
        """Test complete payment flow: clear cart → add item → checkout → verify receipt"""
        
        # Step 1: Clear cart
        clear_response = requests.delete(
            f"{BASE_URL}/api/payment-center/cart/clear",
            headers=auth_headers
        )
        assert clear_response.status_code == 200
        
        # Step 2: Get pending infaq items to add
        pending_response = requests.get(
            f"{BASE_URL}/api/payment-center/pending-items",
            headers=auth_headers
        )
        assert pending_response.status_code == 200
        pending_data = pending_response.json()
        
        # Skip if no infaq campaigns available
        if not pending_data["infaq"]:
            pytest.skip("No infaq campaigns available for testing")
        
        infaq_item = pending_data["infaq"][0]
        infaq_id = infaq_item["item_id"]
        
        # Step 3: Add infaq to cart
        add_response = requests.post(
            f"{BASE_URL}/api/payment-center/cart/add",
            headers=auth_headers,
            json={
                "item_type": "infaq",
                "item_id": infaq_id,
                "quantity": 1,
                "metadata": {"amount": 10}
            }
        )
        assert add_response.status_code == 200
        add_data = add_response.json()
        assert add_data["message"] == "Item ditambah ke troli"
        assert add_data["cart"]["item_count"] == 1
        
        # Step 4: Verify cart
        cart_response = requests.get(
            f"{BASE_URL}/api/payment-center/cart",
            headers=auth_headers
        )
        assert cart_response.status_code == 200
        cart_data = cart_response.json()
        assert cart_data["item_count"] == 1
        assert cart_data["items"][0]["item_type"] == "infaq"
        
        # Get cart_item_id for later test
        cart_item_id = cart_data["items"][0]["cart_item_id"]
        
        # Step 5: Checkout
        checkout_response = requests.post(
            f"{BASE_URL}/api/payment-center/checkout",
            headers=auth_headers,
            json={"payment_method": "fpx_mock"}
        )
        assert checkout_response.status_code == 200
        checkout_data = checkout_response.json()
        
        assert checkout_data["success"] == True
        assert checkout_data["message"] == "Pembayaran berjaya!"
        assert "receipt" in checkout_data
        assert checkout_data["receipt"]["status"] == "completed"
        assert "receipt_number" in checkout_data["receipt"]
        
        receipt_id = checkout_data["receipt"]["receipt_id"]
        receipt_number = checkout_data["receipt"]["receipt_number"]
        
        # Step 6: Verify cart is empty after checkout
        empty_cart_response = requests.get(
            f"{BASE_URL}/api/payment-center/cart",
            headers=auth_headers
        )
        assert empty_cart_response.status_code == 200
        assert empty_cart_response.json()["item_count"] == 0
        
        # Step 7: Get receipt detail
        receipt_response = requests.get(
            f"{BASE_URL}/api/payment-center/receipts/{receipt_id}",
            headers=auth_headers
        )
        assert receipt_response.status_code == 200
        receipt_data = receipt_response.json()
        
        assert receipt_data["receipt_id"] == receipt_id
        assert receipt_data["receipt_number"] == receipt_number
        assert receipt_data["status"] == "completed"
        assert "items" in receipt_data
        assert "organization" in receipt_data
        
        # Step 8: Verify PDF download endpoint
        pdf_response = requests.get(
            f"{BASE_URL}/api/payment-center/receipts/{receipt_id}/pdf",
            headers=auth_headers
        )
        assert pdf_response.status_code == 200
        assert pdf_response.headers.get("content-type") == "application/pdf"
        assert f"filename=resit_{receipt_number}.pdf" in pdf_response.headers.get("content-disposition", "")


class TestPaymentCenterRemoveFromCart:
    """Test remove item from cart functionality"""

    def test_remove_item_from_cart(self, auth_headers):
        """Test removing an item from cart"""
        # Clear cart first
        requests.delete(f"{BASE_URL}/api/payment-center/cart/clear", headers=auth_headers)
        
        # Get an infaq item
        pending_response = requests.get(
            f"{BASE_URL}/api/payment-center/pending-items",
            headers=auth_headers
        )
        if pending_response.status_code != 200 or not pending_response.json().get("infaq"):
            pytest.skip("No infaq campaigns available")
        
        infaq_id = pending_response.json()["infaq"][0]["item_id"]
        
        # Add item to cart
        add_response = requests.post(
            f"{BASE_URL}/api/payment-center/cart/add",
            headers=auth_headers,
            json={"item_type": "infaq", "item_id": infaq_id, "metadata": {"amount": 15}}
        )
        assert add_response.status_code == 200
        cart_item_id = add_response.json()["cart"]["items"][0]["cart_item_id"]
        
        # Remove item from cart
        remove_response = requests.delete(
            f"{BASE_URL}/api/payment-center/cart/remove/{cart_item_id}",
            headers=auth_headers
        )
        assert remove_response.status_code == 200
        assert remove_response.json()["message"] == "Item dibuang dari troli"
        assert remove_response.json()["cart"]["item_count"] == 0

    def test_remove_nonexistent_item(self, auth_headers):
        """Test removing item that doesn't exist in cart"""
        fake_id = str(uuid.uuid4())
        remove_response = requests.delete(
            f"{BASE_URL}/api/payment-center/cart/remove/{fake_id}",
            headers=auth_headers
        )
        assert remove_response.status_code == 404


class TestPaymentCenterCheckoutEdgeCases:
    """Edge case tests for checkout"""

    def test_checkout_empty_cart(self, auth_headers):
        """Test checkout with empty cart returns 400"""
        # Clear cart
        requests.delete(f"{BASE_URL}/api/payment-center/cart/clear", headers=auth_headers)
        
        # Try to checkout
        response = requests.post(
            f"{BASE_URL}/api/payment-center/checkout",
            headers=auth_headers,
            json={"payment_method": "fpx_mock"}
        )
        assert response.status_code == 400
        assert "Troli kosong" in response.json().get("detail", "")

    def test_invalid_receipt_id(self, auth_headers):
        """Test get receipt with invalid ID returns 400"""
        response = requests.get(
            f"{BASE_URL}/api/payment-center/receipts/invalid_id",
            headers=auth_headers
        )
        assert response.status_code == 400

    def test_nonexistent_receipt_id(self, auth_headers):
        """Test get receipt with valid but nonexistent ObjectId returns 404"""
        fake_object_id = "507f1f77bcf86cd799439011"  # Valid MongoDB ObjectId format
        response = requests.get(
            f"{BASE_URL}/api/payment-center/receipts/{fake_object_id}",
            headers=auth_headers
        )
        assert response.status_code == 404
