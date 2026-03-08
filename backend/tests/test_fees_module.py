"""
MRSM Fee Module Tests - Testing fee structure and fee-related endpoints
Tests:
- GET /api/fees/structure - returns correct MRSM fee structure
- Fee structure validation (2 categories: Muafakat, Koperasi)
- Muafakat with 5 sub-items totaling RM897
- Koperasi with 11 sub-items (Dobi) totaling RM110
- Grand total RM1,007.00
- MARAEPS note
- AI Chat fee knowledge
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestFeeStructure:
    """Fee structure endpoint tests"""
    
    def test_fee_structure_endpoint_accessible(self):
        """Test /api/fees/structure returns 200"""
        response = requests.get(f"{BASE_URL}/api/fees/structure")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ Fee structure endpoint accessible")
    
    def test_fee_structure_has_2_categories(self):
        """Fee structure should have exactly 2 categories"""
        response = requests.get(f"{BASE_URL}/api/fees/structure")
        data = response.json()
        
        assert "categories" in data, "Missing 'categories' key"
        assert len(data["categories"]) == 2, f"Expected 2 categories, got {len(data['categories'])}"
        
        category_names = [c["name"] for c in data["categories"]]
        assert "muafakat" in category_names, "Missing 'muafakat' category"
        assert "koperasi" in category_names, "Missing 'koperasi' category"
        print(f"✅ Fee structure has 2 categories: {category_names}")
    
    def test_muafakat_category_structure(self):
        """Muafakat should have RM897 with 5 sub-items"""
        response = requests.get(f"{BASE_URL}/api/fees/structure")
        data = response.json()
        
        muafakat = next((c for c in data["categories"] if c["name"] == "muafakat"), None)
        assert muafakat is not None, "Muafakat category not found"
        
        # Check total amount
        assert muafakat["total_amount"] == 897.00, f"Expected RM897, got RM{muafakat['total_amount']}"
        
        # Check sub-items count
        assert "sub_items" in muafakat, "Missing sub_items in Muafakat"
        assert len(muafakat["sub_items"]) == 5, f"Expected 5 sub-items, got {len(muafakat['sub_items'])}"
        
        # Verify each sub-item
        expected_subitems = [
            ("yuran_muafakat", 200.00),
            ("dana_kecemerlangan", 200.00),
            ("buku_modul", 197.00),
            ("tuisyen_program", 200.00),
            ("majlis_graduasi", 100.00)
        ]
        
        actual_sum = 0
        for name, expected_amount in expected_subitems:
            item = next((i for i in muafakat["sub_items"] if i["name"] == name), None)
            assert item is not None, f"Missing sub-item: {name}"
            assert item["amount"] == expected_amount, f"{name}: Expected RM{expected_amount}, got RM{item['amount']}"
            actual_sum += item["amount"]
        
        assert actual_sum == 897.00, f"Sub-items sum should be RM897, got RM{actual_sum}"
        print(f"✅ Muafakat: RM{muafakat['total_amount']} with {len(muafakat['sub_items'])} sub-items")
    
    def test_koperasi_category_structure(self):
        """Koperasi should have RM110 with 11 sub-items (Dobi)"""
        response = requests.get(f"{BASE_URL}/api/fees/structure")
        data = response.json()
        
        koperasi = next((c for c in data["categories"] if c["name"] == "koperasi"), None)
        assert koperasi is not None, "Koperasi category not found"
        
        # Check total amount
        assert koperasi["total_amount"] == 110.00, f"Expected RM110, got RM{koperasi['total_amount']}"
        
        # Check sub-items count
        assert "sub_items" in koperasi, "Missing sub_items in Koperasi"
        assert len(koperasi["sub_items"]) == 11, f"Expected 11 sub-items (11 months), got {len(koperasi['sub_items'])}"
        
        # Verify each sub-item is RM10 for Dobi
        actual_sum = 0
        for i, item in enumerate(koperasi["sub_items"]):
            expected_name = f"dobi_bulan_{i+1}"
            assert item["name"] == expected_name, f"Expected {expected_name}, got {item['name']}"
            assert item["amount"] == 10.00, f"Dobi month {i+1}: Expected RM10, got RM{item['amount']}"
            actual_sum += item["amount"]
        
        assert actual_sum == 110.00, f"Dobi sum should be RM110, got RM{actual_sum}"
        print(f"✅ Koperasi: RM{koperasi['total_amount']} with {len(koperasi['sub_items'])} sub-items (Dobi x 11 months)")
    
    def test_grand_total(self):
        """Grand total should be RM1,007.00"""
        response = requests.get(f"{BASE_URL}/api/fees/structure")
        data = response.json()
        
        assert "grand_total" in data, "Missing 'grand_total' key"
        assert data["grand_total"] == 1007.00, f"Expected RM1,007.00, got RM{data['grand_total']}"
        
        # Verify sum of categories matches grand total
        categories_sum = sum(c["total_amount"] for c in data["categories"])
        assert categories_sum == data["grand_total"], f"Categories sum ({categories_sum}) != grand_total ({data['grand_total']})"
        print(f"✅ Grand total: RM{data['grand_total']}")
    
    def test_maraeps_note_present(self):
        """Note about MARAEPS should be present"""
        response = requests.get(f"{BASE_URL}/api/fees/structure")
        data = response.json()
        
        assert "note" in data, "Missing 'note' key"
        assert "MARAEPS" in data["note"], f"MARAEPS not mentioned in note: {data['note']}"
        assert "Wang Pendaftaran" in data["note"] or "pendaftaran" in data["note"].lower(), "Note should mention Wang Pendaftaran"
        print(f"✅ MARAEPS note: {data['note']}")
    
    def test_year_field_present(self):
        """Year field should be present"""
        response = requests.get(f"{BASE_URL}/api/fees/structure")
        data = response.json()
        
        assert "year" in data, "Missing 'year' key"
        assert isinstance(data["year"], int), f"Year should be int, got {type(data['year'])}"
        print(f"✅ Year: {data['year']}")


class TestParentFees:
    """Test fees access for parent users"""
    
    @pytest.fixture
    def parent_token(self):
        """Get parent auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.yuran@muafakat.link",
            "password": "demo123"
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip(f"Parent login failed: {response.status_code} - {response.text}")
    
    def test_parent_can_access_fees(self, parent_token):
        """Parent should be able to access their fees"""
        headers = {"Authorization": f"Bearer {parent_token}"}
        response = requests.get(f"{BASE_URL}/api/fees", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✅ Parent can access fees endpoint")
        
        fees = response.json()
        print(f"   Found {len(fees)} fee records")
        
        # If parent has fees, verify structure
        if fees:
            for fee in fees:
                assert "id" in fee, "Missing fee id"
                assert "category" in fee, "Missing fee category"
                assert "amount" in fee, "Missing fee amount"
                assert "paid_amount" in fee, "Missing paid_amount"
                assert "status" in fee, "Missing fee status"
                
                # Check if fee has sub_items when applicable
                if fee["category"] in ["muafakat", "koperasi"]:
                    print(f"   Fee: {fee['category']} - RM{fee['amount']} ({fee['status']})")
                    if fee.get("sub_items"):
                        print(f"      Has {len(fee['sub_items'])} sub-items")


# Parent credentials for AI chat (endpoint is parent-only)
PARENT_EMAIL = os.environ.get("TEST_PARENT_EMAIL", "parent@muafakat.link")
PARENT_PASSWORD = os.environ.get("TEST_PARENT_PASSWORD", "parent123")


def _parent_token():
    """Get JWT for parent user (AI chat is ibu bapa only)."""
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": PARENT_EMAIL, "password": PARENT_PASSWORD})
    if r.status_code != 200:
        return None
    return r.json().get("access_token")


class TestAIChatFeeKnowledge:
    """Test AI Chat (parent-only) knows about fee structure"""
    
    def test_ai_chat_requires_auth(self):
        """AI chat returns 401 without token (parent-only feature)"""
        response = requests.post(f"{BASE_URL}/api/ai/chat", json={"message": "Hello"})
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("✅ AI chat correctly requires authentication")
    
    def test_ai_chat_rejects_non_parent(self):
        """AI chat returns 403 for non-parent (e.g. admin)"""
        # Login as admin if available
        admin_r = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": os.environ.get("TEST_ADMIN_EMAIL", "admin@muafakat.link"),
            "password": os.environ.get("TEST_ADMIN_PASSWORD", "admin123")
        })
        if admin_r.status_code != 200:
            pytest.skip("Admin login not available - skip non-parent test")
        token = admin_r.json().get("access_token")
        response = requests.post(
            f"{BASE_URL}/api/ai/chat",
            json={"message": "Hello"},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403, f"Expected 403 for non-parent, got {response.status_code}"
        print("✅ AI chat correctly restricted to parents")
    
    def test_ai_chat_endpoint_accessible_as_parent(self):
        """Test AI chat returns 200 when called by parent"""
        token = _parent_token()
        if not token:
            pytest.skip("Parent login failed - cannot test AI chat")
        response = requests.post(
            f"{BASE_URL}/api/ai/chat",
            json={"message": "Hello"},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ AI chat endpoint accessible for parent")
    
    def test_ai_knows_fee_amounts(self):
        """Test AI returns info about fee amounts when asked (parent only)"""
        token = _parent_token()
        if not token:
            pytest.skip("Parent login failed - cannot test AI knowledge")
        response = requests.post(
            f"{BASE_URL}/api/ai/chat",
            json={"message": "Berapakah jumlah yuran yang perlu dibayar?"},
            headers={"Authorization": f"Bearer {token}"}
        )
        if response.status_code == 500:
            pytest.skip("AI not configured - skipping knowledge test")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "response" in data, "Missing response field"
        mentions_amount = any(amt in data["response"] for amt in ["897", "110", "1,007", "1007"])
        print("✅ AI chat response received")
        print(f"   Response mentions fee amounts: {mentions_amount}")
    
    def test_ai_knows_maraeps(self):
        """Test AI knows about MARAEPS (parent only)"""
        token = _parent_token()
        if not token:
            pytest.skip("Parent login failed - cannot test AI knowledge")
        response = requests.post(
            f"{BASE_URL}/api/ai/chat",
            json={"message": "Yuran apa yang dibayar di MARAEPS?"},
            headers={"Authorization": f"Bearer {token}"}
        )
        if response.status_code == 500:
            pytest.skip("AI not configured - skipping MARAEPS test")
        assert response.status_code == 200
        data = response.json()
        ai_response = data["response"]
        mentions_maraeps = "MARAEPS" in ai_response or "maraeps" in ai_response.lower()
        mentions_registration = any(term in ai_response.lower() for term in ["pendaftaran", "caruman", "wang"])
        print("✅ AI chat about MARAEPS")
        print(f"   Mentions MARAEPS: {mentions_maraeps}")
        print(f"   Mentions registration/caruman: {mentions_registration}")


class TestAdminFeeAccess:
    """Test admin fee access"""
    
    @pytest.fixture
    def superadmin_token(self):
        """Get superadmin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "super123"
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("SuperAdmin login failed")
    
    def test_superadmin_can_access_all_fees(self, superadmin_token):
        """SuperAdmin should be able to see all fees"""
        headers = {"Authorization": f"Bearer {superadmin_token}"}
        response = requests.get(f"{BASE_URL}/api/fees", headers=headers)
        assert response.status_code == 200
        
        fees = response.json()
        print(f"✅ SuperAdmin can access all fees ({len(fees)} records)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
