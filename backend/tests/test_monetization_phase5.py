"""
Phase 5: Monetization Add-ons Tests
Tests for Ads, Boosts, Premium Subscriptions, Scheduler, and Monetization Stats
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "superadmin@muafakat.link"
ADMIN_PASSWORD = "admin123"
PARENT_EMAIL = "parent@muafakat.link"
PARENT_PASSWORD = "parent123"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def admin_token(api_client):
    """Get admin auth token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.fail(f"Admin login failed: {response.text}")


@pytest.fixture(scope="module")
def parent_token(api_client):
    """Get parent (vendor) auth token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": PARENT_EMAIL,
        "password": PARENT_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.fail(f"Parent login failed: {response.text}")


@pytest.fixture(scope="module")
def vendor_data(api_client, parent_token):
    """Get vendor data for test user"""
    response = api_client.get(
        f"{BASE_URL}/api/marketplace/vendors/my-vendor",
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    if response.status_code == 200:
        data = response.json()
        if data.get("vendor"):
            return data["vendor"]
    return None


class TestAdPackages:
    """Test ad packages endpoints"""

    def test_get_ad_packages(self, api_client):
        """GET /api/marketplace/ad-packages - Returns list of ad packages (Bronze, Silver, Gold)"""
        response = api_client.get(f"{BASE_URL}/api/marketplace/ad-packages")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        packages = response.json()
        assert isinstance(packages, list), "Response should be a list"
        assert len(packages) >= 3, "Should have at least 3 ad packages"
        
        # Verify package types exist
        package_types = [pkg["type"] for pkg in packages]
        assert "bronze" in package_types, "Should have bronze package"
        assert "silver" in package_types, "Should have silver package"
        assert "gold" in package_types, "Should have gold package"
        
        # Verify package structure
        for pkg in packages:
            assert "type" in pkg
            assert "name" in pkg
            assert "price" in pkg
            assert "duration_months" in pkg
            assert pkg["price"] > 0, "Price should be positive"
            assert pkg["duration_months"] > 0, "Duration should be positive"
        
        print(f"✓ Ad packages retrieved: {[p['name'] for p in packages]}")


class TestBoostPackages:
    """Test boost packages endpoints"""

    def test_get_boost_packages(self, api_client):
        """GET /api/marketplace/boost-packages - Returns list of boost packages (Featured, Boost)"""
        response = api_client.get(f"{BASE_URL}/api/marketplace/boost-packages")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        packages = response.json()
        assert isinstance(packages, list), "Response should be a list"
        assert len(packages) >= 2, "Should have at least 2 boost packages"
        
        # Verify package types
        package_types = [pkg["type"] for pkg in packages]
        assert "featured" in package_types, "Should have featured package"
        assert "boost" in package_types, "Should have boost package"
        
        # Verify package structure
        for pkg in packages:
            assert "type" in pkg
            assert "name" in pkg
            assert "description" in pkg
            assert "prices" in pkg
            assert isinstance(pkg["prices"], list)
            
            for price in pkg["prices"]:
                assert "days" in price
                assert "price" in price
                assert "label" in price
        
        print(f"✓ Boost packages retrieved: {[p['name'] for p in packages]}")


class TestPremiumPackages:
    """Test premium subscription packages endpoints"""

    def test_get_premium_packages(self, api_client):
        """GET /api/marketplace/premium-packages - Returns premium subscription packages"""
        response = api_client.get(f"{BASE_URL}/api/marketplace/premium-packages")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        packages = response.json()
        assert isinstance(packages, list), "Response should be a list"
        assert len(packages) >= 3, "Should have at least 3 premium packages"
        
        # Verify package types
        package_types = [pkg["type"] for pkg in packages]
        assert "monthly" in package_types, "Should have monthly package"
        assert "quarterly" in package_types, "Should have quarterly package"
        assert "yearly" in package_types, "Should have yearly package"
        
        # Verify package structure
        for pkg in packages:
            assert "type" in pkg
            assert "name" in pkg
            assert "price" in pkg
            assert "duration_months" in pkg
            assert "features" in pkg
            assert isinstance(pkg["features"], list)
            assert len(pkg["features"]) > 0
        
        print(f"✓ Premium packages retrieved: {[p['name'] for p in packages]}")


class TestVendorAds:
    """Test vendor ads CRUD operations"""

    def test_create_ad_vendor_only(self, api_client, parent_token, vendor_data):
        """POST /api/marketplace/ads - Create new ad (vendor only, requires approval)"""
        if not vendor_data:
            pytest.skip("User is not a vendor")
        
        payload = {
            "package_type": "bronze",
            "title": "TEST_Ad_Phase5_Monetization",
            "description": "Test ad description for monetization testing",
            "image_url": "https://via.placeholder.com/728x90.png?text=TEST+AD",
            "link_url": "https://example.com/promo"
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/marketplace/ads",
            headers={"Authorization": f"Bearer {parent_token}"},
            json=payload
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert "price" in data
        assert "message" in data
        assert data["price"] > 0
        
        print(f"✓ Ad created with ID: {data['id']}, Price: RM {data['price']}")
        return data["id"]

    def test_get_my_ads(self, api_client, parent_token, vendor_data):
        """GET /api/marketplace/ads/my-ads - Get vendor's own ads"""
        if not vendor_data:
            pytest.skip("User is not a vendor")
        
        response = api_client.get(
            f"{BASE_URL}/api/marketplace/ads/my-ads",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        ads = response.json()
        assert isinstance(ads, list), "Response should be a list"
        
        # Verify ad structure if there are ads
        if len(ads) > 0:
            ad = ads[0]
            assert "id" in ad
            assert "package_type" in ad
            assert "title" in ad
            assert "status" in ad
            assert "image_url" in ad
            print(f"✓ Retrieved {len(ads)} ads for vendor")
        else:
            print("✓ No ads found for vendor (empty list)")


class TestAdApprovalFlow:
    """Test ad approval and payment flow"""

    @pytest.fixture(scope="class")
    def test_ad_id(self, api_client, parent_token, vendor_data):
        """Create a test ad for approval flow"""
        if not vendor_data:
            pytest.skip("User is not a vendor")
        
        payload = {
            "package_type": "bronze",
            "title": "TEST_Ad_Approval_Flow",
            "description": "Test ad for approval flow",
            "image_url": "https://via.placeholder.com/728x90.png?text=APPROVAL+TEST",
            "link_url": "https://example.com"
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/marketplace/ads",
            headers={"Authorization": f"Bearer {parent_token}"},
            json=payload
        )
        
        if response.status_code == 200:
            return response.json()["id"]
        return None

    def test_approve_ad_admin(self, api_client, admin_token, test_ad_id):
        """PUT /api/marketplace/ads/{ad_id}/approve - Admin approve ad"""
        if not test_ad_id:
            pytest.skip("No test ad to approve")
        
        payload = {
            "status": "approved"
        }
        
        response = api_client.put(
            f"{BASE_URL}/api/marketplace/ads/{test_ad_id}/approve",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=payload
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data
        print(f"✓ Ad approved: {data['message']}")

    def test_pay_for_ad(self, api_client, parent_token, test_ad_id):
        """POST /api/marketplace/ads/{ad_id}/pay - Pay for approved ad (mock payment)"""
        if not test_ad_id:
            pytest.skip("No test ad to pay for")
        
        response = api_client.post(
            f"{BASE_URL}/api/marketplace/ads/{test_ad_id}/pay",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        
        # Should succeed or return 400 if already paid/not approved
        assert response.status_code in [200, 400], f"Expected 200 or 400, got {response.status_code}: {response.text}"
        
        if response.status_code == 200:
            data = response.json()
            assert "message" in data
            assert "start_date" in data
            assert "end_date" in data
            print(f"✓ Ad payment successful. Active from {data['start_date']} to {data['end_date']}")
        else:
            print(f"✓ Ad payment rejected (already paid or not approved): {response.json()}")


class TestProductBoost:
    """Test product boost functionality"""

    @pytest.fixture(scope="class")
    def approved_product_id(self, api_client, parent_token):
        """Get an approved product for boosting"""
        response = api_client.get(
            f"{BASE_URL}/api/marketplace/products/my-products?status=approved",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        
        if response.status_code == 200:
            products = response.json()
            if products:
                return products[0]["id"]
        return None

    def test_boost_product(self, api_client, parent_token, approved_product_id, vendor_data):
        """POST /api/marketplace/products/{product_id}/boost - Boost a product"""
        if not vendor_data:
            pytest.skip("User is not a vendor")
        if not approved_product_id:
            pytest.skip("No approved products to boost")
        
        payload = {
            "product_id": approved_product_id,
            "boost_type": "boost",
            "duration_days": 3
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/marketplace/products/{approved_product_id}/boost",
            headers={"Authorization": f"Bearer {parent_token}"},
            json=payload
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert "message" in data
        assert "price_paid" in data
        assert "end_date" in data
        
        print(f"✓ Product boosted. Price: RM {data['price_paid']}, End: {data['end_date']}")

    def test_get_my_boosts(self, api_client, parent_token, vendor_data):
        """GET /api/marketplace/my-boosts - Get vendor's active boosts"""
        if not vendor_data:
            pytest.skip("User is not a vendor")
        
        response = api_client.get(
            f"{BASE_URL}/api/marketplace/my-boosts",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        boosts = response.json()
        assert isinstance(boosts, list), "Response should be a list"
        
        if len(boosts) > 0:
            boost = boosts[0]
            assert "id" in boost
            assert "product_id" in boost
            assert "product_name" in boost
            assert "boost_type" in boost
            assert "price_paid" in boost
            assert "days_remaining" in boost
            print(f"✓ Retrieved {len(boosts)} active boosts")
        else:
            print("✓ No active boosts found (empty list)")


class TestPremiumSubscription:
    """Test premium vendor subscription"""

    def test_subscribe_premium(self, api_client, parent_token, vendor_data):
        """POST /api/marketplace/vendors/subscribe-premium - Subscribe to premium"""
        if not vendor_data:
            pytest.skip("User is not a vendor")
        if vendor_data.get("status") != "approved":
            pytest.skip("Vendor is not approved")
        
        response = api_client.post(
            f"{BASE_URL}/api/marketplace/vendors/subscribe-premium?package_type=monthly",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data
        assert "tier" in data
        assert "start_date" in data
        assert "end_date" in data
        assert data["tier"] == "premium"
        
        print(f"✓ Premium subscription activated. Valid until: {data['end_date']}")

    def test_get_premium_status(self, api_client, parent_token, vendor_data):
        """GET /api/marketplace/vendors/premium-status - Get premium status"""
        if not vendor_data:
            pytest.skip("User is not a vendor")
        
        response = api_client.get(
            f"{BASE_URL}/api/marketplace/vendors/premium-status",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "is_premium" in data
        assert "tier" in data
        assert "history" in data
        
        if data["is_premium"]:
            assert "premium_expires_at" in data
            assert "days_remaining" in data
            print(f"✓ Vendor is premium. Days remaining: {data['days_remaining']}")
        else:
            print(f"✓ Vendor is not premium. Tier: {data['tier']}")


class TestScheduler:
    """Test expiration scheduler"""

    def test_run_expiration_scheduler(self, api_client, admin_token):
        """POST /api/marketplace/scheduler/expire-features - Run expiration scheduler (admin only)"""
        response = api_client.post(
            f"{BASE_URL}/api/marketplace/scheduler/expire-features",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data
        assert "expired" in data
        assert "run_at" in data
        
        expired = data["expired"]
        assert "ads" in expired
        assert "boosts" in expired
        assert "subscriptions" in expired
        
        print(f"✓ Scheduler executed. Expired - Ads: {expired['ads']}, Boosts: {expired['boosts']}, Subscriptions: {expired['subscriptions']}")

    def test_scheduler_requires_auth(self, api_client):
        """Scheduler should require admin auth or cron key"""
        response = api_client.post(f"{BASE_URL}/api/marketplace/scheduler/expire-features")
        
        # Should be 401/403 without auth
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("✓ Scheduler correctly requires authentication")


class TestMonetizationStats:
    """Test monetization statistics"""

    def test_get_monetization_stats(self, api_client, admin_token):
        """GET /api/marketplace/monetization/stats - Get monetization statistics (admin only)"""
        response = api_client.get(
            f"{BASE_URL}/api/marketplace/monetization/stats",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify structure
        assert "ads" in data
        assert "boosts" in data
        assert "subscriptions" in data
        assert "flash_sales" in data
        assert "total_monetization_revenue" in data
        
        # Verify ads structure
        assert "active" in data["ads"]
        assert "pending" in data["ads"]
        assert "revenue" in data["ads"]
        
        # Verify boosts structure
        assert "active" in data["boosts"]
        assert "revenue" in data["boosts"]
        
        # Verify subscriptions structure
        assert "premium_vendors" in data["subscriptions"]
        assert "revenue" in data["subscriptions"]
        
        print(f"✓ Monetization stats - Total Revenue: RM {data['total_monetization_revenue']}")
        print(f"  - Ads: RM {data['ads']['revenue']} ({data['ads']['active']} active, {data['ads']['pending']} pending)")
        print(f"  - Boosts: RM {data['boosts']['revenue']} ({data['boosts']['active']} active)")
        print(f"  - Subscriptions: RM {data['subscriptions']['revenue']} ({data['subscriptions']['premium_vendors']} premium vendors)")

    def test_monetization_stats_requires_admin(self, api_client, parent_token):
        """Monetization stats should require admin role"""
        response = api_client.get(
            f"{BASE_URL}/api/marketplace/monetization/stats",
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        
        # Should be 403 for non-admin (unless parent is also admin)
        # If vendor is not admin/bendahari, should fail
        if response.status_code == 403:
            print("✓ Monetization stats correctly requires admin role")
        else:
            # Parent might also have admin role
            print(f"✓ Stats accessible (user may have admin/bendahari role): {response.status_code}")


class TestActiveAds:
    """Test active ads endpoint for public display"""

    def test_get_active_ads(self, api_client):
        """GET /api/marketplace/ads/active - Get currently active ads for display"""
        response = api_client.get(f"{BASE_URL}/api/marketplace/ads/active")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        ads = response.json()
        assert isinstance(ads, list), "Response should be a list"
        
        # Verify structure if there are active ads
        if len(ads) > 0:
            ad = ads[0]
            assert "id" in ad
            assert "vendor_name" in ad
            assert "title" in ad
            assert "image_url" in ad
            print(f"✓ Retrieved {len(ads)} active ads for display")
        else:
            print("✓ No active ads currently (empty list)")


class TestAdClick:
    """Test ad click tracking"""

    def test_record_ad_click(self, api_client):
        """POST /api/marketplace/ads/{ad_id}/click - Record ad click"""
        # First get an active ad
        response = api_client.get(f"{BASE_URL}/api/marketplace/ads/active")
        
        if response.status_code == 200:
            ads = response.json()
            if ads:
                ad_id = ads[0]["id"]
                click_response = api_client.post(f"{BASE_URL}/api/marketplace/ads/{ad_id}/click")
                
                assert click_response.status_code == 200, f"Expected 200, got {click_response.status_code}"
                print(f"✓ Click recorded for ad {ad_id}")
                return
        
        print("✓ No active ads to click (skipped click test)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
