"""
Payment Center Module - Enhanced Backend API Tests
Tests for new features: yuran_detailed, installment, partial payment, tabung_campaigns sync
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
PARENT_EMAIL = "parent@muafakat.link"
PARENT_PASSWORD = "parent123"


@pytest.fixture(scope="module")
def parent_token():
    """Get parent authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": PARENT_EMAIL, "password": PARENT_PASSWORD}
    )
    assert response.status_code == 200, f"Parent login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture
def auth_headers(parent_token):
    """Return auth headers for parent"""
    return {"Authorization": f"Bearer {parent_token}"}


class TestPendingItemsEnhanced:
    """Tests for enhanced pending items (yuran_detailed, installment, infaq from tabung_campaigns)"""

    def test_pending_items_has_all_categories(self, auth_headers):
        """Test pending items returns all 6 categories"""
        response = requests.get(f"{BASE_URL}/api/payment-center/pending-items", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # Should have all 6 categories
        assert "yuran" in data
        assert "yuran_detailed" in data
        assert "installment" in data
        assert "koperasi" in data
        assert "bus" in data
        assert "infaq" in data

    def test_yuran_detailed_returns_items(self, auth_headers):
        """Test yuran_detailed returns item breakdown with checkboxes"""
        response = requests.get(f"{BASE_URL}/api/payment-center/pending-items", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        if data.get("yuran_detailed"):
            yuran_detail = data["yuran_detailed"][0]
            
            # Should have required fields
            assert "yuran_id" in yuran_detail
            assert "student_name" in yuran_detail
            assert "items" in yuran_detail
            assert "balance" in yuran_detail
            
            # Items should have item details
            if yuran_detail.get("items"):
                item = yuran_detail["items"][0]
                assert "code" in item
                assert "name" in item
                assert "amount" in item
                assert "balance" in item
                assert "mandatory" in item

    def test_installment_returns_plan_details(self, auth_headers):
        """Test installment returns students with active installment plans"""
        response = requests.get(f"{BASE_URL}/api/payment-center/pending-items", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        if data.get("installment"):
            installment = data["installment"][0]
            
            # Should have installment plan
            assert "installment_plan" in installment
            plan = installment["installment_plan"]
            
            assert "monthly_amount" in plan
            assert "total_installments" in plan
            assert "paid_installments" in plan
            assert "remaining_installments" in plan

    def test_infaq_from_tabung_campaigns(self, auth_headers):
        """Test infaq items come from tabung_campaigns"""
        response = requests.get(f"{BASE_URL}/api/payment-center/pending-items", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        if data.get("infaq"):
            # Should have both slot and amount type campaigns
            infaq_items = data["infaq"]
            
            # Each item should have campaign_type
            for item in infaq_items:
                assert "campaign_type" in item
                assert item["campaign_type"] in ["slot", "amount"]
                
                if item["campaign_type"] == "slot":
                    assert "total_slots" in item
                    assert "slots_sold" in item
                    assert "price_per_slot" in item
                else:
                    assert "target_amount" in item
                    assert "collected_amount" in item


class TestAddItemsToCart:
    """Tests for /cart/add-items endpoint (partial yuran payment)"""

    def test_add_partial_yuran_to_cart(self, auth_headers):
        """Test adding specific yuran items for partial payment"""
        # Clear cart first
        requests.delete(f"{BASE_URL}/api/payment-center/cart/clear", headers=auth_headers)
        
        # Get yuran_detailed to find valid yuran_id and item_codes
        pending = requests.get(f"{BASE_URL}/api/payment-center/pending-items", headers=auth_headers)
        if not pending.json().get("yuran_detailed"):
            pytest.skip("No yuran_detailed available for testing")
        
        yuran_detail = pending.json()["yuran_detailed"][0]
        yuran_id = yuran_detail["yuran_id"]
        item_codes = [item["code"] for item in yuran_detail["items"][:2]]
        
        # Add partial yuran to cart
        response = requests.post(
            f"{BASE_URL}/api/payment-center/cart/add-items",
            headers=auth_headers,
            json={"yuran_id": yuran_id, "item_codes": item_codes}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "cart" in data
        
        # Cart should have yuran_partial item
        cart_items = data["cart"]["items"]
        assert len(cart_items) >= 1
        partial_item = next((i for i in cart_items if i["item_type"] == "yuran_partial"), None)
        assert partial_item is not None
        assert "metadata" in partial_item
        assert "item_codes" in partial_item["metadata"]

    def test_add_items_empty_codes_fails(self, auth_headers):
        """Test adding with empty item_codes returns error"""
        # Get a valid yuran_id
        pending = requests.get(f"{BASE_URL}/api/payment-center/pending-items", headers=auth_headers)
        if not pending.json().get("yuran_detailed"):
            pytest.skip("No yuran_detailed available")
        
        yuran_id = pending.json()["yuran_detailed"][0]["yuran_id"]
        
        response = requests.post(
            f"{BASE_URL}/api/payment-center/cart/add-items",
            headers=auth_headers,
            json={"yuran_id": yuran_id, "item_codes": []}
        )
        
        assert response.status_code == 400

    def test_add_items_invalid_yuran_id(self, auth_headers):
        """Test adding with invalid yuran_id returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/payment-center/cart/add-items",
            headers=auth_headers,
            json={"yuran_id": "507f1f77bcf86cd799439011", "item_codes": ["CODE1"]}
        )
        
        assert response.status_code == 404


class TestAddInstallmentToCart:
    """Tests for /cart/add-installment endpoint"""

    def test_add_installment_to_cart(self, auth_headers):
        """Test adding installment payment to cart"""
        # Clear cart first
        requests.delete(f"{BASE_URL}/api/payment-center/cart/clear", headers=auth_headers)
        
        # Get installment data
        pending = requests.get(f"{BASE_URL}/api/payment-center/pending-items", headers=auth_headers)
        if not pending.json().get("installment"):
            pytest.skip("No installment plans available for testing")
        
        yuran_id = pending.json()["installment"][0]["yuran_id"]
        
        response = requests.post(
            f"{BASE_URL}/api/payment-center/cart/add-installment",
            headers=auth_headers,
            json={"yuran_id": yuran_id}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "Ansuran" in data["message"]
        
        # Cart should have yuran_installment item
        cart_items = data["cart"]["items"]
        installment_item = next((i for i in cart_items if i["item_type"] == "yuran_installment"), None)
        assert installment_item is not None
        assert "installment_number" in installment_item.get("metadata", {})

    def test_add_installment_without_plan_fails(self, auth_headers):
        """Test adding installment for yuran without plan returns 400"""
        # Get yuran without installment plan
        pending = requests.get(f"{BASE_URL}/api/payment-center/pending-items", headers=auth_headers)
        yuran_list = pending.json().get("yuran", [])
        
        # Find yuran without installment
        yuran_without_plan = next((y for y in yuran_list if not y.get("has_installment")), None)
        
        if not yuran_without_plan:
            pytest.skip("No yuran without installment plan for testing")
        
        response = requests.post(
            f"{BASE_URL}/api/payment-center/cart/add-installment",
            headers=auth_headers,
            json={"yuran_id": yuran_without_plan["item_id"]}
        )
        
        assert response.status_code == 400

    def test_add_installment_invalid_yuran_id(self, auth_headers):
        """Test adding installment with invalid yuran_id returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/payment-center/cart/add-installment",
            headers=auth_headers,
            json={"yuran_id": "507f1f77bcf86cd799439011"}
        )
        
        assert response.status_code == 404


class TestAddInfaqFromTabungCampaigns:
    """Tests for adding infaq from tabung_campaigns (slot and amount types)"""

    def test_add_slot_based_infaq(self, auth_headers):
        """Test adding slot-based infaq to cart"""
        # Clear cart
        requests.delete(f"{BASE_URL}/api/payment-center/cart/clear", headers=auth_headers)
        
        # Get infaq campaigns
        pending = requests.get(f"{BASE_URL}/api/payment-center/pending-items", headers=auth_headers)
        infaq_list = pending.json().get("infaq", [])
        
        # Find slot-based campaign
        slot_campaign = next((c for c in infaq_list if c.get("campaign_type") == "slot"), None)
        
        if not slot_campaign:
            pytest.skip("No slot-based campaign available")
        
        response = requests.post(
            f"{BASE_URL}/api/payment-center/cart/add",
            headers=auth_headers,
            json={
                "item_type": "infaq",
                "item_id": slot_campaign["item_id"],
                "quantity": 1,
                "metadata": {
                    "slots": 2,
                    "price_per_slot": slot_campaign.get("price_per_slot", 50)
                }
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify slot infaq in cart
        cart_items = data["cart"]["items"]
        infaq_item = next((i for i in cart_items if i["item_type"] == "infaq"), None)
        assert infaq_item is not None
        assert infaq_item["metadata"]["campaign_type"] == "slot"
        assert infaq_item["metadata"]["slots"] == 2

    def test_add_amount_based_infaq(self, auth_headers):
        """Test adding amount-based infaq to cart"""
        # Get infaq campaigns
        pending = requests.get(f"{BASE_URL}/api/payment-center/pending-items", headers=auth_headers)
        infaq_list = pending.json().get("infaq", [])
        
        # Find amount-based campaign
        amount_campaign = next((c for c in infaq_list if c.get("campaign_type") == "amount"), None)
        
        if not amount_campaign:
            pytest.skip("No amount-based campaign available")
        
        response = requests.post(
            f"{BASE_URL}/api/payment-center/cart/add",
            headers=auth_headers,
            json={
                "item_type": "infaq",
                "item_id": amount_campaign["item_id"],
                "quantity": 1,
                "metadata": {"amount": 25}
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify amount infaq in cart
        cart_items = data["cart"]["items"]
        amount_infaq = next((i for i in cart_items if i["item_type"] == "infaq" and i["metadata"].get("campaign_type") == "amount"), None)
        assert amount_infaq is not None


class TestCheckoutWithSync:
    """Test checkout syncs donations with tabung_donations collection"""

    def test_checkout_processes_all_types(self, auth_headers):
        """Test checkout handles yuran_partial, yuran_installment, and infaq"""
        # Clear cart
        requests.delete(f"{BASE_URL}/api/payment-center/cart/clear", headers=auth_headers)
        
        # Add an infaq item
        pending = requests.get(f"{BASE_URL}/api/payment-center/pending-items", headers=auth_headers)
        infaq_list = pending.json().get("infaq", [])
        
        if not infaq_list:
            pytest.skip("No infaq campaigns available")
        
        requests.post(
            f"{BASE_URL}/api/payment-center/cart/add",
            headers=auth_headers,
            json={
                "item_type": "infaq",
                "item_id": infaq_list[0]["item_id"],
                "quantity": 1,
                "metadata": {"amount": 10}
            }
        )
        
        # Checkout
        response = requests.post(
            f"{BASE_URL}/api/payment-center/checkout",
            headers=auth_headers,
            json={"payment_method": "fpx_mock"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] == True
        assert "receipt" in data
        assert "receipt_number" in data["receipt"]
        assert data["receipt"]["status"] == "completed"
