"""
Test Suite for Parent Registration with Address Fields
Tests the new address fields (Alamat, Poskod, Bandar, Negeri) added to registration form
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://yuran-admin-panel.preview.emergentagent.com')

class TestRegistrationAddressFields:
    """Test parent registration with address fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Generate unique test identifiers
        self.unique_id = str(uuid.uuid4())[:8]
        self.test_email = f"test_address_{self.unique_id}@test.com"
        yield
        # Cleanup not needed as we use unique emails
    
    def test_health_check(self):
        """Test API is accessible"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("✅ Health check passed")
    
    def test_registration_with_full_address(self):
        """Test registration with all address fields (Alamat, Poskod, Bandar, Negeri)"""
        unique_email = f"test_fulladdr_{str(uuid.uuid4())[:8]}@test.com"
        
        payload = {
            "full_name": "Test Parent With Address",
            "email": unique_email,
            "phone": "0123456789",
            "ic_number": "901234-56-7890",
            "password": "test123456",
            "address": "No. 123, Jalan Bunga Raya, Taman Indah",
            "postcode": "43000",
            "city": "Kajang",
            "state": "Selangor"
        }
        
        response = self.session.post(f"{BASE_URL}/api/auth/register", json=payload)
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "access_token" in data
        assert "user" in data
        assert data["token_type"] == "bearer"
        
        # Verify user data
        user = data["user"]
        assert user["full_name"] == payload["full_name"]
        assert user["email"] == unique_email
        assert user["phone"] == payload["phone"]
        assert user["role"] == "parent"
        assert user["is_active"] == True
        
        print(f"✅ Registration with full address successful for {unique_email}")
        print(f"   Address: {payload['address']}")
        print(f"   Poskod: {payload['postcode']}, Bandar: {payload['city']}, Negeri: {payload['state']}")
        
        return data["access_token"]
    
    def test_registration_with_partial_address(self):
        """Test registration with partial address fields (only some fields filled)"""
        unique_email = f"test_partaddr_{str(uuid.uuid4())[:8]}@test.com"
        
        payload = {
            "full_name": "Test Parent Partial Address",
            "email": unique_email,
            "phone": "0129876543",
            "ic_number": "891234-12-3456",
            "password": "test123456",
            "address": "No. 456, Jalan Mawar",
            "postcode": "50000",
            "city": "",  # Empty city
            "state": "W.P. Kuala Lumpur"
        }
        
        response = self.session.post(f"{BASE_URL}/api/auth/register", json=payload)
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        assert "access_token" in data
        assert data["user"]["full_name"] == payload["full_name"]
        assert data["user"]["role"] == "parent"
        
        print(f"✅ Registration with partial address successful for {unique_email}")
        return data["access_token"]
    
    def test_registration_without_address(self):
        """Test registration without any address fields (backward compatibility)"""
        unique_email = f"test_noaddr_{str(uuid.uuid4())[:8]}@test.com"
        
        payload = {
            "full_name": "Test Parent No Address",
            "email": unique_email,
            "phone": "0127654321",
            "ic_number": "881234-45-6789",
            "password": "test123456"
            # No address fields - should still work
        }
        
        response = self.session.post(f"{BASE_URL}/api/auth/register", json=payload)
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        assert "access_token" in data
        assert data["user"]["full_name"] == payload["full_name"]
        
        print(f"✅ Registration without address fields successful for {unique_email}")
        return data["access_token"]
    
    def test_registration_with_address_and_children(self):
        """Test registration with address fields AND children info"""
        unique_email = f"test_addrchild_{str(uuid.uuid4())[:8]}@test.com"
        unique_matric = f"M2024{str(uuid.uuid4())[:4].upper()}"
        
        payload = {
            "full_name": "Test Parent With Children",
            "email": unique_email,
            "phone": "0121234567",
            "ic_number": "871234-78-9012",
            "password": "test123456",
            "address": "No. 789, Persiaran Anggerik, Seksyen 7",
            "postcode": "40000",
            "city": "Shah Alam",
            "state": "Selangor",
            "children": [
                {
                    "matric_number": unique_matric,
                    "full_name": "Test Child One",
                    "form": 4,
                    "class_name": "A",
                    "phone": "0171234567",
                    "email": "childone@student.test"
                }
            ]
        }
        
        response = self.session.post(f"{BASE_URL}/api/auth/register", json=payload)
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        # Verify parent registered
        assert "access_token" in data
        user = data["user"]
        assert user["full_name"] == payload["full_name"]
        assert user["role"] == "parent"
        
        print(f"✅ Registration with address and children successful")
        print(f"   Parent: {unique_email}")
        print(f"   Address: {payload['address']}, {payload['city']}, {payload['state']} {payload['postcode']}")
        print(f"   Child: {unique_matric}")
        
        return data["access_token"]
    
    def test_login_after_registration(self):
        """Test login flow works after registration with address"""
        # First register
        unique_email = f"test_loginaddr_{str(uuid.uuid4())[:8]}@test.com"
        password = "test123456"
        
        register_payload = {
            "full_name": "Test Login User",
            "email": unique_email,
            "phone": "0129998888",
            "ic_number": "861234-01-2345",
            "password": password,
            "address": "No. 100, Jalan Tun Razak",
            "postcode": "50400",
            "city": "Kuala Lumpur",
            "state": "W.P. Kuala Lumpur"
        }
        
        reg_response = self.session.post(f"{BASE_URL}/api/auth/register", json=register_payload)
        assert reg_response.status_code == 200, f"Registration failed: {reg_response.text}"
        
        # Now login
        login_payload = {
            "email": unique_email,
            "password": password
        }
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json=login_payload)
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        login_data = login_response.json()
        assert "access_token" in login_data
        assert login_data["user"]["email"] == unique_email
        
        print(f"✅ Login after registration with address works for {unique_email}")
        return login_data["access_token"]
    
    def test_dashboard_access_after_registration(self):
        """Test dashboard loads after registration with address"""
        # Register
        unique_email = f"test_dashaddr_{str(uuid.uuid4())[:8]}@test.com"
        
        register_payload = {
            "full_name": "Test Dashboard User",
            "email": unique_email,
            "phone": "0129997777",
            "ic_number": "851234-02-3456",
            "password": "test123456",
            "address": "No. 200, Jalan Ampang",
            "postcode": "50450",
            "city": "Kuala Lumpur",
            "state": "W.P. Kuala Lumpur"
        }
        
        reg_response = self.session.post(f"{BASE_URL}/api/auth/register", json=register_payload)
        assert reg_response.status_code == 200
        
        token = reg_response.json()["access_token"]
        
        # Access parent dashboard
        headers = {"Authorization": f"Bearer {token}"}
        dashboard_response = self.session.get(f"{BASE_URL}/api/dashboard/parent", headers=headers)
        
        assert dashboard_response.status_code == 200, f"Dashboard access failed: {dashboard_response.text}"
        
        dashboard_data = dashboard_response.json()
        assert "total_children" in dashboard_data
        assert "total_fees" in dashboard_data
        
        print(f"✅ Dashboard access after registration works")
        print(f"   Children: {dashboard_data['total_children']}, Fees: RM{dashboard_data['total_fees']:.2f}")
    
    def test_all_malaysian_states(self):
        """Test registration with different Malaysian states"""
        states = ["Johor", "Kedah", "Selangor", "Sabah", "Sarawak", "W.P. Kuala Lumpur"]
        
        for state in states:
            unique_email = f"test_state_{state[:4].lower()}_{str(uuid.uuid4())[:4]}@test.com"
            
            payload = {
                "full_name": f"Test User {state}",
                "email": unique_email,
                "phone": "0121234000",
                "password": "test123456",
                "state": state
            }
            
            response = self.session.post(f"{BASE_URL}/api/auth/register", json=payload)
            assert response.status_code == 200, f"Registration failed for state {state}: {response.text}"
            
            print(f"   ✅ {state}")
        
        print(f"✅ All Malaysian states tested successfully")


class TestExistingLoginFlows:
    """Test existing login flows still work after changes"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_admin_login(self):
        """Test admin can still login"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@muafakat.link",
            "password": "admin123"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["role"] == "admin"
        print("✅ Admin login works")
    
    def test_bendahari_login(self):
        """Test bendahari can still login"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "bendahari@muafakat.link",
            "password": "bendahari123"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["role"] == "bendahari"
        print("✅ Bendahari login works")
    
    def test_superadmin_login(self):
        """Test superadmin can still login"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "super123"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["role"] == "superadmin"
        print("✅ SuperAdmin login works")
    
    def test_student_login(self):
        """Test student login with matric number"""
        response = self.session.post(f"{BASE_URL}/api/auth/login/student", json={
            "identifier": "M2024001",
            "password": "pelajar123"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["role"] == "pelajar"
        print("✅ Student login with matric number works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
