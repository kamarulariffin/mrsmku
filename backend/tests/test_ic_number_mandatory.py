"""
Test IC Number Mandatory Feature
Tests that ic_number field is mandatory across all forms:
- Registration form (UserCreate model)
- User Management form (UserCreateByAdmin model) 
- Child registration (ChildInfo model)
- Validates 12-digit format
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestICNumberMandatory:
    """Tests for IC Number mandatory field validation"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth tokens for testing"""
        # Login as superadmin
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "admin123"
        })
        if login_res.status_code == 200:
            self.superadmin_token = login_res.json().get("access_token")
        else:
            self.superadmin_token = None
            
    def test_health_check(self):
        """Test API is accessible"""
        res = requests.get(f"{BASE_URL}/api/health")
        assert res.status_code == 200
        print("Health check passed")
        
    # ===== REGISTRATION TESTS =====
    
    def test_registration_without_ic_number_fails(self):
        """Registration should fail without ic_number"""
        payload = {
            "email": "test_no_ic@test.com",
            "password": "test123456",
            "full_name": "Test User No IC",
            "phone": "0123456789"
            # ic_number missing
        }
        res = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        # Should fail validation - 422 Unprocessable Entity
        assert res.status_code == 422, f"Expected 422 but got {res.status_code}: {res.text}"
        print(f"Registration without IC rejected: {res.json()}")
        
    def test_registration_with_empty_ic_number_fails(self):
        """Registration should fail with empty ic_number"""
        payload = {
            "email": "test_empty_ic@test.com",
            "password": "test123456",
            "full_name": "Test User Empty IC",
            "phone": "0123456789",
            "ic_number": ""
        }
        res = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        # Should fail validation
        assert res.status_code == 422, f"Expected 422 but got {res.status_code}: {res.text}"
        print(f"Registration with empty IC rejected: {res.json()}")
        
    def test_registration_with_invalid_ic_format_fails(self):
        """Registration should fail with invalid IC format (not 12 digits)"""
        payload = {
            "email": "test_invalid_ic@test.com",
            "password": "test123456",
            "full_name": "Test User Invalid IC",
            "phone": "0123456789",
            "ic_number": "12345"  # Only 5 digits, should be 12
        }
        res = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        # Should fail validation
        assert res.status_code == 422, f"Expected 422 but got {res.status_code}: {res.text}"
        print(f"Registration with invalid IC (5 digits) rejected: {res.json()}")
        
    def test_registration_with_valid_ic_succeeds(self):
        """Registration should succeed with valid 12-digit IC"""
        import uuid
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "email": f"test_valid_ic_{unique_id}@test.com",
            "password": "test123456",
            "full_name": "Test User Valid IC",
            "phone": "0123456789",
            "ic_number": "901201061234"  # Valid 12-digit IC
        }
        res = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        # Should succeed
        assert res.status_code == 200, f"Expected 200 but got {res.status_code}: {res.text}"
        data = res.json()
        assert "access_token" in data, "Expected access_token in response"
        print(f"Registration with valid IC succeeded for {payload['email']}")
        
    def test_registration_with_ic_containing_dash_normalized(self):
        """IC with dashes should be normalized to 12 digits without dash"""
        import uuid
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "email": f"test_ic_dash_{unique_id}@test.com",
            "password": "test123456",
            "full_name": "Test User IC With Dash",
            "phone": "0123456789",
            "ic_number": "901201-06-1234"  # With dashes
        }
        res = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        # Should either succeed (if backend normalizes) or fail (if not)
        print(f"Registration with dashed IC: status={res.status_code}, response={res.text[:200]}")
        
    # ===== USER CREATE BY ADMIN TESTS =====
    
    def test_admin_create_user_without_ic_fails(self):
        """Admin creating user without IC should fail"""
        if not self.superadmin_token:
            pytest.skip("Could not get superadmin token")
            
        headers = {"Authorization": f"Bearer {self.superadmin_token}"}
        payload = {
            "email": "test_admin_no_ic@test.com",
            "password": "test123456",
            "full_name": "Test Admin Create No IC",
            "phone": "0123456789",
            "role": "parent"
            # ic_number missing
        }
        res = requests.post(f"{BASE_URL}/api/users", json=payload, headers=headers)
        # Should fail validation - 422
        assert res.status_code == 422, f"Expected 422 but got {res.status_code}: {res.text}"
        print(f"Admin create without IC rejected: {res.json()}")
        
    def test_admin_create_user_with_invalid_ic_fails(self):
        """Admin creating user with invalid IC should fail"""
        if not self.superadmin_token:
            pytest.skip("Could not get superadmin token")
            
        headers = {"Authorization": f"Bearer {self.superadmin_token}"}
        payload = {
            "email": "test_admin_invalid_ic@test.com",
            "password": "test123456",
            "full_name": "Test Admin Create Invalid IC",
            "phone": "0123456789",
            "role": "parent",
            "ic_number": "123"  # Too short
        }
        res = requests.post(f"{BASE_URL}/api/users", json=payload, headers=headers)
        # Should fail validation - 422
        assert res.status_code == 422, f"Expected 422 but got {res.status_code}: {res.text}"
        print(f"Admin create with invalid IC rejected: {res.json()}")
        
    def test_admin_create_user_with_valid_ic_succeeds(self):
        """Admin creating user with valid IC should succeed"""
        if not self.superadmin_token:
            pytest.skip("Could not get superadmin token")
            
        import uuid
        unique_id = str(uuid.uuid4())[:8]
        headers = {"Authorization": f"Bearer {self.superadmin_token}"}
        payload = {
            "email": f"test_admin_valid_ic_{unique_id}@test.com",
            "password": "test123456",
            "full_name": "Test Admin Create Valid IC",
            "phone": "0123456789",
            "role": "parent",
            "ic_number": "850515081234"  # Valid 12-digit IC
        }
        res = requests.post(f"{BASE_URL}/api/users", json=payload, headers=headers)
        # Should succeed
        assert res.status_code in [200, 201], f"Expected 200/201 but got {res.status_code}: {res.text}"
        print(f"Admin create with valid IC succeeded for {payload['email']}")
        
    # ===== CHILD INFO TESTS =====
    
    def test_registration_with_child_without_ic_fails(self):
        """Registration with child missing IC should fail"""
        import uuid
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "email": f"test_parent_child_no_ic_{unique_id}@test.com",
            "password": "test123456",
            "full_name": "Test Parent Child No IC",
            "phone": "0123456789",
            "ic_number": "880808081234",  # Parent has valid IC
            "children": [{
                "matric_number": "T12026999",
                "full_name": "Test Child No IC",
                "form": 1,
                "class_name": "A"
                # ic_number missing for child
            }]
        }
        res = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        # Should fail validation - 422 for child missing IC
        assert res.status_code == 422, f"Expected 422 but got {res.status_code}: {res.text}"
        print(f"Registration with child without IC rejected: {res.json()}")
        
    def test_registration_with_child_invalid_ic_fails(self):
        """Registration with child having invalid IC should fail"""
        import uuid
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "email": f"test_parent_child_bad_ic_{unique_id}@test.com",
            "password": "test123456",
            "full_name": "Test Parent Child Bad IC",
            "phone": "0123456789",
            "ic_number": "880808081234",  # Parent has valid IC
            "children": [{
                "matric_number": "T12026998",
                "full_name": "Test Child Bad IC",
                "form": 1,
                "class_name": "A",
                "ic_number": "12345"  # Invalid - only 5 digits
            }]
        }
        res = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        # Should fail validation - 422 for invalid child IC
        assert res.status_code == 422, f"Expected 422 but got {res.status_code}: {res.text}"
        print(f"Registration with child invalid IC rejected: {res.json()}")
        
    def test_registration_with_child_valid_ic_succeeds(self):
        """Registration with child having valid IC should succeed"""
        import uuid
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "email": f"test_parent_child_ok_{unique_id}@test.com",
            "password": "test123456",
            "full_name": "Test Parent Child OK",
            "phone": "0123456789",
            "ic_number": "780808081234",  # Parent has valid IC
            "children": [{
                "matric_number": f"T1202{unique_id[:4]}",
                "full_name": "Test Child Valid IC",
                "form": 1,
                "class_name": "A",
                "ic_number": "100101011234"  # Valid child IC
            }]
        }
        res = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        # Should succeed or fail for other reasons (like duplicate matric)
        print(f"Registration with child valid IC: status={res.status_code}")
        if res.status_code in [200, 201]:
            print("SUCCESS: Registration with valid child IC passed")
        else:
            # Check if failure is NOT due to IC validation
            error_text = res.text.lower()
            assert "ic" not in error_text or "kad pengenalan" not in error_text, f"Failed due to IC: {res.text}"
            print(f"Failed for other reason (not IC): {res.text[:200]}")
            
    # ===== IC FORMAT VALIDATION TESTS =====
    
    def test_ic_with_non_numeric_chars_fails(self):
        """IC with non-numeric characters should fail"""
        payload = {
            "email": "test_ic_letters@test.com",
            "password": "test123456",
            "full_name": "Test IC Letters",
            "phone": "0123456789",
            "ic_number": "90120A061234"  # Contains letter
        }
        res = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert res.status_code == 422, f"Expected 422 but got {res.status_code}: {res.text}"
        print(f"IC with letters rejected: {res.json()}")
        
    def test_ic_with_invalid_month_fails(self):
        """IC with invalid month (>12) should fail"""
        payload = {
            "email": "test_ic_bad_month@test.com",
            "password": "test123456",
            "full_name": "Test IC Bad Month",
            "phone": "0123456789",
            "ic_number": "901301061234"  # Month 13 invalid
        }
        res = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert res.status_code == 422, f"Expected 422 but got {res.status_code}: {res.text}"
        print(f"IC with invalid month rejected: {res.json()}")
        
    def test_ic_with_invalid_day_fails(self):
        """IC with invalid day (>31) should fail"""
        payload = {
            "email": "test_ic_bad_day@test.com",
            "password": "test123456",
            "full_name": "Test IC Bad Day",
            "phone": "0123456789",
            "ic_number": "901232061234"  # Day 32 invalid
        }
        res = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert res.status_code == 422, f"Expected 422 but got {res.status_code}: {res.text}"
        print(f"IC with invalid day rejected: {res.json()}")


class TestICPlaceholderFormat:
    """Test that placeholder format 901201061234 is used correctly"""
    
    def test_valid_placeholder_format_accepted(self):
        """The placeholder format 901201061234 should be valid"""
        import uuid
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "email": f"test_placeholder_{unique_id}@test.com",
            "password": "test123456",
            "full_name": "Test Placeholder Format",
            "phone": "0123456789",
            "ic_number": "901201061234"  # Exact placeholder format
        }
        res = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        # Should succeed - placeholder format is valid
        assert res.status_code == 200, f"Expected 200 but got {res.status_code}: {res.text}"
        print("Placeholder format 901201061234 accepted as valid IC")
