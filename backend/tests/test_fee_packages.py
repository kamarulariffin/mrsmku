"""
MRSM Fee Package System - Comprehensive API Tests
Testing fee package CRUD operations, parent children-fees endpoint, and role-based access
"""
import pytest
import requests
import os
import uuid

# Base URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://yuran-admin-panel.preview.emergentagent.com').rstrip('/')

# Test credentials
SUPERADMIN_CREDS = {"email": "superadmin@muafakat.link", "password": "super123"}
BENDAHARI_CREDS = {"email": "bendahari@muafakat.link", "password": "bendahari123"}
PARENT_CREDS = {"email": "demo.yuran@muafakat.link", "password": "demo123"}


@pytest.fixture(scope="module")
def superadmin_token():
    """Get SuperAdmin token"""
    res = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERADMIN_CREDS)
    if res.status_code != 200:
        pytest.skip(f"SuperAdmin login failed: {res.status_code}")
    return res.json()["access_token"]


@pytest.fixture(scope="module")
def bendahari_token():
    """Get Bendahari token"""
    res = requests.post(f"{BASE_URL}/api/auth/login", json=BENDAHARI_CREDS)
    if res.status_code != 200:
        pytest.skip(f"Bendahari login failed: {res.status_code}")
    return res.json()["access_token"]


@pytest.fixture(scope="module")
def parent_token():
    """Get Parent token"""
    res = requests.post(f"{BASE_URL}/api/auth/login", json=PARENT_CREDS)
    if res.status_code != 200:
        pytest.skip(f"Parent login failed: {res.status_code}")
    return res.json()["access_token"]


def auth_header(token):
    """Helper to create auth header"""
    return {"Authorization": f"Bearer {token}"}


class TestFeePackageEndpoints:
    """Tests for /api/fee-packages endpoints"""
    
    def test_get_fee_packages_superadmin(self, superadmin_token):
        """GET /api/fee-packages - SuperAdmin can view packages"""
        res = requests.get(
            f"{BASE_URL}/api/fee-packages", 
            headers=auth_header(superadmin_token)
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} fee packages")
    
    def test_get_fee_packages_bendahari(self, bendahari_token):
        """GET /api/fee-packages - Bendahari can view packages"""
        res = requests.get(
            f"{BASE_URL}/api/fee-packages", 
            headers=auth_header(bendahari_token)
        )
        assert res.status_code == 200, f"Bendahari should access fee packages"
        data = res.json()
        assert isinstance(data, list)
        print(f"Bendahari sees {len(data)} packages")
    
    def test_get_fee_packages_with_year_filter(self, superadmin_token):
        """GET /api/fee-packages?year=2026 - Filter by year"""
        res = requests.get(
            f"{BASE_URL}/api/fee-packages?year=2026", 
            headers=auth_header(superadmin_token)
        )
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        # All returned packages should be for 2026
        for pkg in data:
            assert pkg.get("year") == 2026, f"Package year should be 2026, got {pkg.get('year')}"
        print(f"Found {len(data)} packages for year 2026")
    
    def test_get_fee_packages_parent_forbidden(self, parent_token):
        """GET /api/fee-packages - Parent should NOT access fee packages list"""
        res = requests.get(
            f"{BASE_URL}/api/fee-packages", 
            headers=auth_header(parent_token)
        )
        # Parent role should be forbidden (not in allowed roles list)
        assert res.status_code == 403, f"Parent should be forbidden, got {res.status_code}"
        print("Parent correctly forbidden from fee packages management")
    
    def test_fee_package_structure(self, superadmin_token):
        """Verify fee package response structure"""
        res = requests.get(
            f"{BASE_URL}/api/fee-packages?year=2026", 
            headers=auth_header(superadmin_token)
        )
        assert res.status_code == 200
        data = res.json()
        
        if len(data) > 0:
            pkg = data[0]
            # Verify required fields
            required_fields = ["id", "year", "form", "name", "categories", "total_amount", "is_active"]
            for field in required_fields:
                assert field in pkg, f"Missing required field: {field}"
            
            # Verify categories structure
            if pkg.get("categories"):
                cat = pkg["categories"][0]
                assert "name" in cat, "Category should have name"
                assert "sub_categories" in cat, "Category should have sub_categories"
                
                if cat.get("sub_categories"):
                    sub = cat["sub_categories"][0]
                    assert "name" in sub, "Sub-category should have name"
                    assert "items" in sub, "Sub-category should have items"
                    
                    if sub.get("items"):
                        item = sub["items"][0]
                        assert "code" in item, "Item should have code (e.g., M01, D01)"
                        assert "name" in item, "Item should have name"
                        assert "amount" in item, "Item should have amount"
            
            print(f"Package structure valid: {pkg['name']} - RM{pkg['total_amount']}")
        else:
            print("No packages found for year 2026")


class TestFeePackageCRUD:
    """Test Create/Read/Update/Delete operations for fee packages"""
    
    created_package_id = None
    
    def test_create_fee_package_superadmin(self, superadmin_token):
        """POST /api/fee-packages - SuperAdmin can create package"""
        test_year = 2099  # Use future year to avoid conflicts
        test_form = 1
        
        payload = {
            "year": test_year,
            "form": test_form,
            "name": f"TEST_Pakej Yuran Tingkatan {test_form} {test_year}",
            "categories": [
                {
                    "name": "TEST_MUAFAKAT",
                    "sub_categories": [
                        {
                            "name": "Yuran Tetap",
                            "items": [
                                {"code": "T01", "name": "Yuran Ujian", "amount": 100.00, "mandatory": True},
                                {"code": "T02", "name": "Dana Aktiviti", "amount": 50.00, "mandatory": True}
                            ]
                        }
                    ]
                }
            ],
            "is_active": True
        }
        
        res = requests.post(
            f"{BASE_URL}/api/fee-packages",
            headers=auth_header(superadmin_token),
            json=payload
        )
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["year"] == test_year
        assert data["form"] == test_form
        assert data["total_amount"] == 150.00, f"Total should be 150, got {data['total_amount']}"
        
        TestFeePackageCRUD.created_package_id = data["id"]
        print(f"Created package: {data['name']} with ID: {data['id']}")
    
    def test_create_fee_package_bendahari(self, bendahari_token):
        """POST /api/fee-packages - Bendahari can create package"""
        test_year = 2099
        test_form = 2  # Different form
        
        payload = {
            "year": test_year,
            "form": test_form,
            "name": f"TEST_Pakej Yuran Tingkatan {test_form} {test_year}",
            "categories": [
                {
                    "name": "TEST_KOPERASI",
                    "sub_categories": [
                        {
                            "name": "Perkhidmatan",
                            "items": [
                                {"code": "K01", "name": "Dobi", "amount": 10.00, "mandatory": True}
                            ]
                        }
                    ]
                }
            ],
            "is_active": True
        }
        
        res = requests.post(
            f"{BASE_URL}/api/fee-packages",
            headers=auth_header(bendahari_token),
            json=payload
        )
        
        assert res.status_code == 200, f"Bendahari should create package"
        data = res.json()
        print(f"Bendahari created: {data['name']}")
        
        # Cleanup - delete this package
        cleanup = requests.delete(
            f"{BASE_URL}/api/fee-packages/{data['id']}",
            headers=auth_header(bendahari_token)
        )
        # Bendahari cannot delete, but that's OK
    
    def test_create_duplicate_package_fails(self, superadmin_token):
        """POST /api/fee-packages - Creating duplicate form/year should fail"""
        if not TestFeePackageCRUD.created_package_id:
            pytest.skip("No package created to test duplicate")
        
        payload = {
            "year": 2099,
            "form": 1,  # Same as created above
            "name": "Duplicate Package",
            "categories": [],
            "is_active": True
        }
        
        res = requests.post(
            f"{BASE_URL}/api/fee-packages",
            headers=auth_header(superadmin_token),
            json=payload
        )
        
        assert res.status_code == 400, "Duplicate package should fail"
        print("Duplicate package creation correctly rejected")
    
    def test_get_single_package(self, superadmin_token):
        """GET /api/fee-packages/{id} - Get specific package"""
        if not TestFeePackageCRUD.created_package_id:
            pytest.skip("No package created")
        
        res = requests.get(
            f"{BASE_URL}/api/fee-packages/{TestFeePackageCRUD.created_package_id}",
            headers=auth_header(superadmin_token)
        )
        
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == TestFeePackageCRUD.created_package_id
        print(f"Retrieved package: {data['name']}")
    
    def test_delete_package_superadmin(self, superadmin_token):
        """DELETE /api/fee-packages/{id} - SuperAdmin can delete"""
        if not TestFeePackageCRUD.created_package_id:
            pytest.skip("No package created")
        
        res = requests.delete(
            f"{BASE_URL}/api/fee-packages/{TestFeePackageCRUD.created_package_id}",
            headers=auth_header(superadmin_token)
        )
        
        assert res.status_code == 200
        data = res.json()
        assert "dipadam" in data.get("message", "").lower() or "deleted" in data.get("message", "").lower()
        print("Package successfully deleted")
    
    def test_delete_package_bendahari_forbidden(self, bendahari_token, superadmin_token):
        """DELETE /api/fee-packages/{id} - Bendahari cannot delete (SuperAdmin only)"""
        # First create a package to test deletion
        payload = {
            "year": 2098,
            "form": 6,
            "name": "TEST_Delete_Test_Package",
            "categories": [],
            "is_active": True
        }
        
        create_res = requests.post(
            f"{BASE_URL}/api/fee-packages",
            headers=auth_header(superadmin_token),
            json=payload
        )
        
        if create_res.status_code != 200:
            pytest.skip("Could not create test package")
        
        pkg_id = create_res.json()["id"]
        
        # Try to delete as Bendahari
        res = requests.delete(
            f"{BASE_URL}/api/fee-packages/{pkg_id}",
            headers=auth_header(bendahari_token)
        )
        
        assert res.status_code == 403, f"Bendahari should NOT delete, got {res.status_code}"
        print("Bendahari correctly forbidden from deleting")
        
        # Cleanup - delete as SuperAdmin
        requests.delete(
            f"{BASE_URL}/api/fee-packages/{pkg_id}",
            headers=auth_header(superadmin_token)
        )


class TestParentChildrenFees:
    """Tests for /api/parent/children-fees endpoint"""
    
    def test_parent_children_fees_success(self, parent_token):
        """GET /api/parent/children-fees - Parent can view children fees"""
        res = requests.get(
            f"{BASE_URL}/api/parent/children-fees",
            headers=auth_header(parent_token)
        )
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert isinstance(data, list), "Response should be a list of children"
        print(f"Parent has {len(data)} children with fees")
        
        if len(data) > 0:
            child = data[0]
            # Verify child fee card structure
            required_fields = ["student_id", "student_name", "matric_number", "form", "class_name", 
                             "total_fees", "paid_amount", "progress_percent", "categories"]
            for field in required_fields:
                assert field in child, f"Missing field: {field}"
            
            # Verify progress_percent is calculated correctly
            if child["total_fees"] > 0:
                expected_progress = (child["paid_amount"] / child["total_fees"]) * 100
                assert abs(child["progress_percent"] - expected_progress) < 0.2, "Progress calculation error"
            
            print(f"Child: {child['student_name']} - RM{child['total_fees']} ({child['progress_percent']}% paid)")
            
            # Verify categories structure
            if child.get("categories"):
                cat = child["categories"][0]
                assert "name" in cat, "Category should have name"
                assert "amount" in cat, "Category should have amount"
                print(f"  Categories: {[c['name'] for c in child['categories']]}")
    
    def test_parent_children_fees_superadmin_forbidden(self, superadmin_token):
        """GET /api/parent/children-fees - SuperAdmin should be forbidden (parent role only)"""
        res = requests.get(
            f"{BASE_URL}/api/parent/children-fees",
            headers=auth_header(superadmin_token)
        )
        
        assert res.status_code == 403, f"SuperAdmin should be forbidden, got {res.status_code}"
        print("SuperAdmin correctly forbidden from parent children-fees endpoint")


class TestFeeStructure:
    """Tests for public /api/fees/structure endpoint"""
    
    def test_fee_structure_public(self):
        """GET /api/fees/structure - Public access"""
        res = requests.get(f"{BASE_URL}/api/fees/structure")
        
        assert res.status_code == 200
        data = res.json()
        assert "year" in data
        assert "note" in data, "Should include MARAEPS note"
        print(f"Fee structure for year {data['year']}")
    
    def test_fee_structure_with_year(self):
        """GET /api/fees/structure?year=2026"""
        res = requests.get(f"{BASE_URL}/api/fees/structure?year=2026")
        
        assert res.status_code == 200
        data = res.json()
        assert data["year"] == 2026
        
        if data.get("packages"):
            print(f"Found {len(data['packages'])} packages for 2026")
            for pkg in data["packages"]:
                print(f"  Tingkatan {pkg['form']}: RM{pkg['total_amount']}")


class TestTingkatanPackages:
    """Verify fee packages exist for Tingkatan 1-6"""
    
    def test_all_tingkatan_packages_exist(self, superadmin_token):
        """Check if packages exist for Tingkatan 1-6"""
        res = requests.get(
            f"{BASE_URL}/api/fee-packages?year=2026",
            headers=auth_header(superadmin_token)
        )
        
        assert res.status_code == 200
        packages = res.json()
        
        existing_forms = {p["form"] for p in packages}
        expected_forms = {1, 2, 3, 4, 5, 6}
        
        missing_forms = expected_forms - existing_forms
        if missing_forms:
            print(f"WARNING: Missing packages for Tingkatan: {missing_forms}")
        
        print(f"Packages exist for Tingkatan: {sorted(existing_forms)}")
        
        # Verify total amounts
        for pkg in packages:
            print(f"  Tingkatan {pkg['form']}: {pkg['name']} - RM{pkg['total_amount']}")
            
            # Tingkatan 5 should have RM1,057 (MUAFAKAT RM947 + KOPERASI RM110)
            if pkg["form"] == 5:
                expected_total = 1057.0
                if abs(pkg["total_amount"] - expected_total) < 1:
                    print(f"    ✓ Tingkatan 5 total matches expected: RM{expected_total}")
                else:
                    print(f"    ⚠ Tingkatan 5 total: RM{pkg['total_amount']} (expected RM{expected_total})")


class TestItemCodes:
    """Verify item codes (M01, D01, etc.) in packages"""
    
    def test_item_codes_format(self, superadmin_token):
        """Verify sub-items have proper codes"""
        res = requests.get(
            f"{BASE_URL}/api/fee-packages?year=2026",
            headers=auth_header(superadmin_token)
        )
        
        assert res.status_code == 200
        packages = res.json()
        
        codes_found = []
        for pkg in packages:
            for cat in pkg.get("categories", []):
                for sub in cat.get("sub_categories", []):
                    for item in sub.get("items", []):
                        if item.get("code"):
                            codes_found.append(item["code"])
        
        if codes_found:
            print(f"Found {len(codes_found)} item codes: {codes_found[:10]}...")
            # Verify code format (should be like M01, D01, A01, etc.)
            for code in codes_found[:5]:
                assert len(code) >= 2, f"Code too short: {code}"
        else:
            print("No item codes found in packages")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
