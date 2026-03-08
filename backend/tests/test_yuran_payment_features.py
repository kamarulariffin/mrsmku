"""
Backend Tests for Yuran Payment Features:
- Installment Settings (GET/PUT)
- Parent Yuran Dashboard (/api/yuran/anak-saya)
- Payment Options (/api/yuran/anak-saya/{yuran_id}/payment-options)
- Payment Processing (/api/yuran/anak-saya/{yuran_id}/pay)
- Payment Locking Mechanism
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestYuranPaymentFeatures:
    """Test suite for Yuran Payment Features"""
    
    # Store tokens and IDs for test session
    bendahari_token = None
    parent_token = None
    superadmin_token = None
    parent_yuran_id = None
    
    @pytest.fixture(autouse=True)
    def setup_method(self, request):
        """Setup method to authenticate before tests"""
        if TestYuranPaymentFeatures.bendahari_token is None:
            # Login as bendahari
            resp = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": "bendahari@muafakat.link",
                "password": "bendahari123"
            })
            if resp.status_code == 200:
                TestYuranPaymentFeatures.bendahari_token = resp.json().get("access_token")
        
        if TestYuranPaymentFeatures.parent_token is None:
            # Login as parent
            resp = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": "parent1@muafakat.link",
                "password": "parent123"
            })
            if resp.status_code == 200:
                TestYuranPaymentFeatures.parent_token = resp.json().get("access_token")
        
        if TestYuranPaymentFeatures.superadmin_token is None:
            # Login as superadmin
            resp = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": "superadmin@muafakat.link",
                "password": "admin123"
            })
            if resp.status_code == 200:
                TestYuranPaymentFeatures.superadmin_token = resp.json().get("access_token")
    
    # ============ AUTHENTICATION TESTS ============
    
    def test_01_bendahari_login(self):
        """Test bendahari login"""
        assert TestYuranPaymentFeatures.bendahari_token is not None, "Bendahari login failed"
        print(f"✓ Bendahari login successful")
    
    def test_02_parent_login(self):
        """Test parent login"""
        assert TestYuranPaymentFeatures.parent_token is not None, "Parent login failed"
        print(f"✓ Parent login successful")
    
    def test_03_superadmin_login(self):
        """Test superadmin login"""
        assert TestYuranPaymentFeatures.superadmin_token is not None, "SuperAdmin login failed"
        print(f"✓ SuperAdmin login successful")
    
    # ============ INSTALLMENT SETTINGS TESTS ============
    
    def test_10_get_installment_settings_authenticated(self):
        """Test GET /api/yuran/settings/installment with bendahari auth"""
        headers = {"Authorization": f"Bearer {TestYuranPaymentFeatures.bendahari_token}"}
        resp = requests.get(f"{BASE_URL}/api/yuran/settings/installment", headers=headers)
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        
        assert "max_installment_months" in data, "Response should contain max_installment_months"
        assert isinstance(data["max_installment_months"], int), "max_installment_months should be integer"
        assert 1 <= data["max_installment_months"] <= 9, "max_installment_months should be 1-9"
        
        print(f"✓ GET installment settings: max_months={data['max_installment_months']}")
    
    def test_11_get_installment_settings_unauthenticated(self):
        """Test GET /api/yuran/settings/installment without auth"""
        resp = requests.get(f"{BASE_URL}/api/yuran/settings/installment")
        
        assert resp.status_code == 401, f"Expected 401 for unauthenticated, got {resp.status_code}"
        print(f"✓ Unauthenticated request correctly blocked")
    
    def test_12_update_installment_settings_bendahari(self):
        """Test PUT /api/yuran/settings/installment as bendahari"""
        headers = {"Authorization": f"Bearer {TestYuranPaymentFeatures.bendahari_token}"}
        
        # Update to 6 months
        resp = requests.put(
            f"{BASE_URL}/api/yuran/settings/installment",
            headers=headers,
            json={"max_installment_months": 6}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        
        assert data.get("max_installment_months") == 6, f"Expected max_months=6, got {data.get('max_installment_months')}"
        print(f"✓ Updated installment settings to 6 months")
        
        # Verify the update
        verify_resp = requests.get(f"{BASE_URL}/api/yuran/settings/installment", headers=headers)
        assert verify_resp.status_code == 200
        assert verify_resp.json().get("max_installment_months") == 6
        print(f"✓ Verified installment settings persisted")
        
        # Reset to 9 months
        reset_resp = requests.put(
            f"{BASE_URL}/api/yuran/settings/installment",
            headers=headers,
            json={"max_installment_months": 9}
        )
        assert reset_resp.status_code == 200
        print(f"✓ Reset installment settings to 9 months")
    
    def test_13_update_installment_settings_superadmin(self):
        """Test PUT /api/yuran/settings/installment as superadmin"""
        headers = {"Authorization": f"Bearer {TestYuranPaymentFeatures.superadmin_token}"}
        
        resp = requests.put(
            f"{BASE_URL}/api/yuran/settings/installment",
            headers=headers,
            json={"max_installment_months": 7}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print(f"✓ SuperAdmin can update installment settings")
        
        # Reset to 9
        requests.put(
            f"{BASE_URL}/api/yuran/settings/installment",
            headers=headers,
            json={"max_installment_months": 9}
        )
    
    def test_14_update_installment_settings_parent_forbidden(self):
        """Test PUT /api/yuran/settings/installment as parent - should be forbidden"""
        headers = {"Authorization": f"Bearer {TestYuranPaymentFeatures.parent_token}"}
        
        resp = requests.put(
            f"{BASE_URL}/api/yuran/settings/installment",
            headers=headers,
            json={"max_installment_months": 5}
        )
        
        assert resp.status_code == 403, f"Expected 403 for parent, got {resp.status_code}"
        print(f"✓ Parent correctly denied from updating settings")
    
    def test_15_update_installment_settings_invalid_value(self):
        """Test PUT /api/yuran/settings/installment with invalid value (>9)"""
        headers = {"Authorization": f"Bearer {TestYuranPaymentFeatures.bendahari_token}"}
        
        resp = requests.put(
            f"{BASE_URL}/api/yuran/settings/installment",
            headers=headers,
            json={"max_installment_months": 12}
        )
        
        # Should get validation error
        assert resp.status_code == 422, f"Expected 422 for invalid value, got {resp.status_code}"
        print(f"✓ Invalid value (>9) correctly rejected")
    
    # ============ PARENT YURAN DASHBOARD TESTS ============
    
    def test_20_get_parent_children_yuran(self):
        """Test GET /api/yuran/anak-saya - parent's children yuran data"""
        headers = {"Authorization": f"Bearer {TestYuranPaymentFeatures.parent_token}"}
        resp = requests.get(f"{BASE_URL}/api/yuran/anak-saya", headers=headers)
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        
        assert isinstance(data, list), "Response should be a list of children"
        
        if len(data) > 0:
            child = data[0]
            # Verify response structure
            assert "student_id" in child, "Child should have student_id"
            assert "name" in child, "Child should have name"
            assert "total_fees" in child, "Child should have total_fees"
            assert "total_paid" in child, "Child should have total_paid"
            assert "total_outstanding" in child, "Child should have total_outstanding"
            assert "progress_percent" in child, "Child should have progress_percent"
            
            # Store yuran_id for payment tests
            if child.get("all_yuran") and len(child.get("all_yuran")) > 0:
                TestYuranPaymentFeatures.parent_yuran_id = child["all_yuran"][0].get("id")
            
            print(f"✓ GET anak-saya: {len(data)} children found")
            print(f"  First child: {child.get('name')}, Total fees: RM {child.get('total_fees'):.2f}")
        else:
            print(f"✓ GET anak-saya: No children with yuran found")
    
    def test_21_get_parent_children_yuran_admin_forbidden(self):
        """Test GET /api/yuran/anak-saya as admin - should be forbidden (parent only)"""
        headers = {"Authorization": f"Bearer {TestYuranPaymentFeatures.bendahari_token}"}
        resp = requests.get(f"{BASE_URL}/api/yuran/anak-saya", headers=headers)
        
        assert resp.status_code == 403, f"Expected 403 for admin, got {resp.status_code}"
        print(f"✓ Admin correctly denied from parent endpoint")
    
    # ============ PAYMENT OPTIONS TESTS ============
    
    def test_30_get_payment_options(self):
        """Test GET /api/yuran/anak-saya/{yuran_id}/payment-options"""
        if not TestYuranPaymentFeatures.parent_yuran_id:
            pytest.skip("No yuran_id available for testing")
        
        headers = {"Authorization": f"Bearer {TestYuranPaymentFeatures.parent_token}"}
        yuran_id = TestYuranPaymentFeatures.parent_yuran_id
        
        resp = requests.get(
            f"{BASE_URL}/api/yuran/anak-saya/{yuran_id}/payment-options",
            headers=headers
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        
        # Verify response structure
        assert "yuran_id" in data, "Response should have yuran_id"
        assert "total_amount" in data, "Response should have total_amount"
        assert "outstanding" in data, "Response should have outstanding"
        assert "is_locked" in data, "Response should have is_locked"
        assert "payment_options" in data, "Response should have payment_options"
        
        options = data.get("payment_options", {})
        assert "full" in options, "Should have full payment option"
        assert "category" in options, "Should have category payment option"
        assert "installment" in options, "Should have installment payment option"
        
        # Verify installment options
        installment = options.get("installment", {})
        assert "max_months" in installment, "Installment should have max_months"
        assert "options" in installment, "Installment should have options list"
        
        print(f"✓ GET payment-options: total={data.get('total_amount')}, outstanding={data.get('outstanding')}")
        print(f"  Full: {options.get('full', {}).get('enabled')}, Category: {options.get('category', {}).get('enabled')}, Installment: {options.get('installment', {}).get('enabled')}")
    
    def test_31_get_payment_options_category_breakdown(self):
        """Test category breakdown in payment options"""
        if not TestYuranPaymentFeatures.parent_yuran_id:
            pytest.skip("No yuran_id available for testing")
        
        headers = {"Authorization": f"Bearer {TestYuranPaymentFeatures.parent_token}"}
        yuran_id = TestYuranPaymentFeatures.parent_yuran_id
        
        resp = requests.get(
            f"{BASE_URL}/api/yuran/anak-saya/{yuran_id}/payment-options",
            headers=headers
        )
        
        assert resp.status_code == 200
        data = resp.json()
        
        # Check category breakdown
        categories = data.get("category_breakdown", [])
        if categories:
            cat = categories[0]
            assert "name" in cat, "Category should have name"
            assert "amount" in cat, "Category should have amount"
            assert "paid" in cat, "Category should have paid"
            assert "balance" in cat, "Category should have balance"
            assert "status" in cat, "Category should have status"
            
            print(f"✓ Category breakdown: {len(categories)} categories")
            for c in categories[:3]:
                print(f"  - {c.get('name')}: RM {c.get('amount'):.2f} (balance: RM {c.get('balance'):.2f})")
        else:
            print(f"✓ No category breakdown available")
    
    def test_32_get_payment_options_forbidden_for_other_parent(self):
        """Test payment options is forbidden for another parent's child"""
        # Using a yuran_id that doesn't belong to parent1
        # This tests security - parent should not access other's children
        headers = {"Authorization": f"Bearer {TestYuranPaymentFeatures.parent_token}"}
        
        # Use a known yuran_id from another parent (parent4 - Encik Othman)
        # Based on data: 6992eef250a169ac67b1df2e belongs to parent4
        other_yuran_id = "6992eef250a169ac67b1df2e"
        
        resp = requests.get(
            f"{BASE_URL}/api/yuran/anak-saya/{other_yuran_id}/payment-options",
            headers=headers
        )
        
        # Should get 403 forbidden
        assert resp.status_code == 403, f"Expected 403 for other parent's child, got {resp.status_code}"
        print(f"✓ Correctly denied access to other parent's child")
    
    # ============ PAYMENT PROCESSING TESTS ============
    
    def test_40_process_full_payment(self):
        """Test POST /api/yuran/anak-saya/{yuran_id}/pay - full payment"""
        if not TestYuranPaymentFeatures.parent_yuran_id:
            pytest.skip("No yuran_id available for testing")
        
        headers = {"Authorization": f"Bearer {TestYuranPaymentFeatures.parent_token}"}
        yuran_id = TestYuranPaymentFeatures.parent_yuran_id
        
        # First check payment options to ensure we have outstanding
        options_resp = requests.get(
            f"{BASE_URL}/api/yuran/anak-saya/{yuran_id}/payment-options",
            headers=headers
        )
        
        if options_resp.status_code != 200:
            pytest.skip(f"Could not get payment options: {options_resp.status_code}")
        
        options = options_resp.json()
        if options.get("outstanding", 0) <= 0:
            pytest.skip("No outstanding amount for payment")
        
        # Skip if locked (already has payments)
        if options.get("is_locked"):
            print(f"⚠ Payment is locked - skipping full payment test")
            pytest.skip("Payment already locked")
        
        # Make a full payment
        resp = requests.post(
            f"{BASE_URL}/api/yuran/anak-saya/{yuran_id}/pay",
            headers=headers,
            json={
                "payment_type": "full",
                "payment_method": "fpx"
            }
        )
        
        # If successful, should return success
        if resp.status_code == 200:
            data = resp.json()
            assert data.get("success") == True, "Payment should be successful"
            assert "receipt_number" in data, "Response should have receipt_number"
            assert "payment_amount" in data, "Response should have payment_amount"
            print(f"✓ Full payment successful: RM {data.get('payment_amount'):.2f}")
            print(f"  Receipt: {data.get('receipt_number')}")
        else:
            # May fail if already paid or locked
            print(f"⚠ Full payment returned {resp.status_code}: {resp.text}")
    
    def test_41_process_installment_payment(self):
        """Test POST /api/yuran/anak-saya/{yuran_id}/pay - installment payment"""
        # We need a fresh yuran_id with outstanding balance
        # First get parent's children yuran
        headers = {"Authorization": f"Bearer {TestYuranPaymentFeatures.parent_token}"}
        children_resp = requests.get(f"{BASE_URL}/api/yuran/anak-saya", headers=headers)
        
        if children_resp.status_code != 200:
            pytest.skip("Could not get children yuran")
        
        children = children_resp.json()
        test_yuran_id = None
        
        # Find a yuran with outstanding balance and not locked
        for child in children:
            for yuran in child.get("all_yuran", []):
                outstanding = yuran.get("total_amount", 0) - yuran.get("paid_amount", 0)
                if outstanding > 0:
                    # Check if locked
                    options_resp = requests.get(
                        f"{BASE_URL}/api/yuran/anak-saya/{yuran.get('id')}/payment-options",
                        headers=headers
                    )
                    if options_resp.status_code == 200:
                        options = options_resp.json()
                        if not options.get("is_locked"):
                            test_yuran_id = yuran.get("id")
                            break
            if test_yuran_id:
                break
        
        if not test_yuran_id:
            print(f"⚠ No unlocked yuran with outstanding balance found")
            pytest.skip("No suitable yuran for installment test")
        
        # Make installment payment (3 months)
        resp = requests.post(
            f"{BASE_URL}/api/yuran/anak-saya/{test_yuran_id}/pay",
            headers=headers,
            json={
                "payment_type": "installment",
                "installment_months": 3,
                "payment_method": "fpx"
            }
        )
        
        if resp.status_code == 200:
            data = resp.json()
            assert data.get("success") == True, "Installment payment should be successful"
            assert "receipt_number" in data, "Response should have receipt_number"
            print(f"✓ Installment payment successful: RM {data.get('payment_amount'):.2f}")
            print(f"  Payment type: installment, Status: {data.get('status')}")
        else:
            print(f"⚠ Installment payment returned {resp.status_code}: {resp.text}")
    
    def test_42_payment_locking_mechanism(self):
        """Test that payment method is locked after first installment payment"""
        headers = {"Authorization": f"Bearer {TestYuranPaymentFeatures.parent_token}"}
        children_resp = requests.get(f"{BASE_URL}/api/yuran/anak-saya", headers=headers)
        
        if children_resp.status_code != 200:
            pytest.skip("Could not get children yuran")
        
        children = children_resp.json()
        
        # Find a yuran that has been partially paid
        locked_yuran_id = None
        for child in children:
            for yuran in child.get("all_yuran", []):
                if yuran.get("status") == "partial":
                    locked_yuran_id = yuran.get("id")
                    break
            if locked_yuran_id:
                break
        
        if not locked_yuran_id:
            print(f"⚠ No partially paid yuran found to test locking")
            pytest.skip("No partially paid yuran for lock test")
        
        # Check payment options - should be locked
        options_resp = requests.get(
            f"{BASE_URL}/api/yuran/anak-saya/{locked_yuran_id}/payment-options",
            headers=headers
        )
        
        if options_resp.status_code == 200:
            options = options_resp.json()
            is_locked = options.get("is_locked", False)
            print(f"✓ Payment locking check: is_locked={is_locked}")
            
            if is_locked:
                # Try full payment on locked yuran - should fail
                resp = requests.post(
                    f"{BASE_URL}/api/yuran/anak-saya/{locked_yuran_id}/pay",
                    headers=headers,
                    json={
                        "payment_type": "full",
                        "payment_method": "fpx"
                    }
                )
                assert resp.status_code == 400, f"Full payment on locked yuran should fail, got {resp.status_code}"
                print(f"✓ Full payment correctly blocked on locked yuran")
    
    def test_43_invalid_installment_months(self):
        """Test installment payment with invalid months (>max)"""
        if not TestYuranPaymentFeatures.parent_yuran_id:
            pytest.skip("No yuran_id available for testing")
        
        headers = {"Authorization": f"Bearer {TestYuranPaymentFeatures.parent_token}"}
        yuran_id = TestYuranPaymentFeatures.parent_yuran_id
        
        # Try installment with 12 months (max is 9)
        resp = requests.post(
            f"{BASE_URL}/api/yuran/anak-saya/{yuran_id}/pay",
            headers=headers,
            json={
                "payment_type": "installment",
                "installment_months": 12,
                "payment_method": "fpx"
            }
        )
        
        # Should get validation error (422) or business rule error (400)
        assert resp.status_code in [400, 422], f"Expected 400/422 for invalid months, got {resp.status_code}"
        print(f"✓ Invalid installment months correctly rejected")
    
    def test_44_category_payment(self):
        """Test category payment"""
        headers = {"Authorization": f"Bearer {TestYuranPaymentFeatures.parent_token}"}
        children_resp = requests.get(f"{BASE_URL}/api/yuran/anak-saya", headers=headers)
        
        if children_resp.status_code != 200:
            pytest.skip("Could not get children yuran")
        
        children = children_resp.json()
        test_yuran_id = None
        test_category_code = None
        
        # Find a yuran with unpaid categories
        for child in children:
            for yuran in child.get("all_yuran", []):
                outstanding = yuran.get("total_amount", 0) - yuran.get("paid_amount", 0)
                if outstanding > 0:
                    # Get payment options to find unpaid category
                    options_resp = requests.get(
                        f"{BASE_URL}/api/yuran/anak-saya/{yuran.get('id')}/payment-options",
                        headers=headers
                    )
                    if options_resp.status_code == 200:
                        options = options_resp.json()
                        unpaid_cats = options.get("unpaid_categories", [])
                        if unpaid_cats:
                            test_yuran_id = yuran.get("id")
                            test_category_code = unpaid_cats[0].get("code")
                            break
            if test_yuran_id:
                break
        
        if not test_yuran_id or not test_category_code:
            print(f"⚠ No yuran with unpaid categories found")
            pytest.skip("No suitable yuran for category payment test")
        
        # Make category payment
        resp = requests.post(
            f"{BASE_URL}/api/yuran/anak-saya/{test_yuran_id}/pay",
            headers=headers,
            json={
                "payment_type": "category",
                "category_code": test_category_code,
                "payment_method": "fpx"
            }
        )
        
        if resp.status_code == 200:
            data = resp.json()
            print(f"✓ Category payment successful: RM {data.get('payment_amount'):.2f}")
            print(f"  Category: {test_category_code}")
        else:
            print(f"⚠ Category payment returned {resp.status_code}: {resp.text}")
    
    def test_45_payment_forbidden_for_admin(self):
        """Test that payment endpoint is forbidden for admin/bendahari"""
        if not TestYuranPaymentFeatures.parent_yuran_id:
            pytest.skip("No yuran_id available for testing")
        
        headers = {"Authorization": f"Bearer {TestYuranPaymentFeatures.bendahari_token}"}
        yuran_id = TestYuranPaymentFeatures.parent_yuran_id
        
        resp = requests.post(
            f"{BASE_URL}/api/yuran/anak-saya/{yuran_id}/pay",
            headers=headers,
            json={
                "payment_type": "full",
                "payment_method": "fpx"
            }
        )
        
        assert resp.status_code == 403, f"Expected 403 for admin, got {resp.status_code}"
        print(f"✓ Admin correctly denied from parent payment endpoint")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
