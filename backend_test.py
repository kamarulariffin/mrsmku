#!/usr/bin/env python3
"""
MRSM Portal Backend API Testing
Tests all endpoints thoroughly including authentication, student management, fees, and payments.
"""
import requests
import json
import sys
from datetime import datetime, timedelta
import time

class MRSMAPITester:
    def __init__(self, base_url="http://localhost:8001"):
        self.base_url = base_url
        self.parent_token = None
        self.admin_token = None
        self.bendahari_token = None
        self.superadmin_token = None
        self.warden_token = None
        self.guard_token = None
        self.guru_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.current_student_id = None
        self.current_fee_id = None
        self.created_user_id = None
        self.headers = {'Content-Type': 'application/json'}

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None, description=""):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        test_headers = headers or self.headers.copy()
        
        self.tests_run += 1
        print(f"\n🔍 Test {self.tests_run}: {name}")
        if description:
            print(f"   Description: {description}")
        print(f"   URL: {method} {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ PASSED - Status: {response.status_code}")
                try:
                    resp_data = response.json()
                    if 'access_token' in resp_data:
                        print(f"   Token received: {resp_data['access_token'][:20]}...")
                    return True, resp_data
                except:
                    return True, {}
            else:
                print(f"❌ FAILED - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    print(f"   Error: {error_detail}")
                except:
                    print(f"   Response: {response.text}")
                return False, {}

        except requests.exceptions.RequestException as e:
            print(f"❌ FAILED - Network Error: {str(e)}")
            return False, {}
        except Exception as e:
            print(f"❌ FAILED - Error: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test health endpoint"""
        return self.run_test(
            "Health Check", 
            "GET", 
            "/api/health", 
            200,
            description="Basic connectivity and server health"
        )

    def test_parent_registration(self):
        """Test parent registration"""
        timestamp = str(int(time.time()))
        parent_data = {
            "full_name": f"Test Parent {timestamp}",
            "email": f"parent{timestamp}@test.com",
            "phone": "0123456789",
            "ic_number": f"990101{timestamp[-6:]}",
            "password": "TestPass123!"
        }
        
        success, response = self.run_test(
            "Parent Registration",
            "POST",
            "/api/auth/register",
            200,
            data=parent_data,
            description="Register new parent account"
        )
        
        if success and 'access_token' in response:
            self.parent_token = response['access_token']
            print(f"   Registered parent: {response['user']['full_name']}")
        
        return success

    def test_parent_login(self):
        """Test parent login"""
        # Create a new parent for login testing
        timestamp = str(int(time.time()))
        parent_data = {
            "full_name": f"Login Test Parent {timestamp}",
            "email": f"loginparent{timestamp}@test.com",
            "phone": "0123456788",
            "ic_number": f"880101{timestamp[-6:]}",
            "password": "LoginPass123!"
        }
        
        # First register
        requests.post(f"{self.base_url}/api/auth/register", json=parent_data)
        
        # Now login
        login_data = {
            "email": parent_data["email"],
            "password": parent_data["password"]
        }
        
        success, response = self.run_test(
            "Parent Login",
            "POST",
            "/api/auth/login",
            200,
            data=login_data,
            description="Login with parent credentials"
        )
        
        if success and 'access_token' in response:
            self.parent_token = response['access_token']
        
        return success

    def test_admin_login(self):
        """Test admin login"""
        admin_data = {
            "email": "admin@mrsm.edu.my",
            "password": "admin123"
        }
        
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "/api/auth/login",
            200,
            data=admin_data,
            description="Login with admin credentials"
        )
        
        if success and 'access_token' in response:
            self.admin_token = response['access_token']
            print(f"   Admin logged in: {response['user']['full_name']}")
        
        return success

    def test_bendahari_login(self):
        """Test bendahari login"""
        bendahari_data = {
            "email": "bendahari@mrsm.edu.my",
            "password": "bendahari123"
        }
        
        success, response = self.run_test(
            "Bendahari Login",
            "POST",
            "/api/auth/login",
            200,
            data=bendahari_data,
            description="Login with bendahari credentials"
        )
        
        if success and 'access_token' in response:
            self.bendahari_token = response['access_token']
            print(f"   Bendahari logged in: {response['user']['full_name']}")
        
        return success

    def test_superadmin_login(self):
        """Test SuperAdmin login"""
        superadmin_data = {
            "email": "superadmin@mrsm.edu.my",
            "password": "super123"
        }
        
        success, response = self.run_test(
            "SuperAdmin Login",
            "POST",
            "/api/auth/login",
            200,
            data=superadmin_data,
            description="Login with SuperAdmin credentials"
        )
        
        if success and 'access_token' in response:
            self.superadmin_token = response['access_token']
            print(f"   SuperAdmin logged in: {response['user']['full_name']}")
        
        return success

    def test_warden_login(self):
        """Test Warden login"""
        warden_data = {
            "email": "warden@mrsm.edu.my",
            "password": "warden123"
        }
        
        success, response = self.run_test(
            "Warden Login",
            "POST",
            "/api/auth/login",
            200,
            data=warden_data,
            description="Login with warden credentials"
        )
        
        if success and 'access_token' in response:
            self.warden_token = response['access_token']
            print(f"   Warden logged in: {response['user']['full_name']}")
        
        return success

    def test_guard_login(self):
        """Test Guard login"""
        guard_data = {
            "email": "guard@mrsm.edu.my",
            "password": "guard123"
        }
        
        success, response = self.run_test(
            "Guard Login",
            "POST",
            "/api/auth/login",
            200,
            data=guard_data,
            description="Login with guard credentials"
        )
        
        if success and 'access_token' in response:
            self.guard_token = response['access_token']
            print(f"   Guard logged in: {response['user']['full_name']}")
        
        return success

    def test_guru_login(self):
        """Test Guru login"""
        guru_data = {
            "email": "guru@mrsm.edu.my",
            "password": "guru123"
        }
        
        success, response = self.run_test(
            "Guru Login",
            "POST",
            "/api/auth/login",
            200,
            data=guru_data,
            description="Login with guru credentials"
        )
        
        if success and 'access_token' in response:
            self.guru_token = response['access_token']
            print(f"   Guru logged in: {response['user']['full_name']}")
        
        return success

    def test_get_current_user(self):
        """Test get current user info"""
        if not self.parent_token:
            print("❌ No parent token available for user info test")
            return False
            
        headers = self.headers.copy()
        headers['Authorization'] = f'Bearer {self.parent_token}'
        
        return self.run_test(
            "Get Current User",
            "GET",
            "/api/auth/me",
            200,
            headers=headers,
            description="Get authenticated user information"
        )[0]

    def test_create_student(self):
        """Test creating a student"""
        if not self.parent_token:
            print("❌ No parent token available for student creation")
            return False
            
        timestamp = str(int(time.time()))
        student_data = {
            "full_name": f"Test Student {timestamp}",
            "matric_number": f"M{timestamp[-8:]}",
            "ic_number": f"080101{timestamp[-6:]}",
            "year": 2024,
            "form": 3,
            "class_name": "Bestari",
            "block_name": "Blok A",
            "room_number": "101",
            "state": "Selangor"
        }
        
        headers = self.headers.copy()
        headers['Authorization'] = f'Bearer {self.parent_token}'
        
        success, response = self.run_test(
            "Create Student",
            "POST",
            "/api/students",
            200,
            data=student_data,
            headers=headers,
            description="Parent adds child to system"
        )
        
        if success and 'id' in response:
            self.current_student_id = response['id']
            print(f"   Student created with ID: {self.current_student_id}")
        
        return success

    def test_get_students(self):
        """Test getting students list"""
        if not self.parent_token:
            print("❌ No parent token available")
            return False
            
        headers = self.headers.copy()
        headers['Authorization'] = f'Bearer {self.parent_token}'
        
        success, response = self.run_test(
            "Get Students (Parent)",
            "GET",
            "/api/students",
            200,
            headers=headers,
            description="Get parent's children list"
        )
        
        if success:
            print(f"   Found {len(response)} student(s)")
        
        return success

    def test_admin_get_students(self):
        """Test admin getting all students"""
        if not self.admin_token:
            print("❌ No admin token available")
            return False
            
        headers = self.headers.copy()
        headers['Authorization'] = f'Bearer {self.admin_token}'
        
        success, response = self.run_test(
            "Get All Students (Admin)",
            "GET",
            "/api/students",
            200,
            headers=headers,
            description="Admin gets all students"
        )
        
        if success:
            print(f"   Found {len(response)} total student(s)")
        
        return success

    def test_approve_student(self):
        """Test admin approving a student"""
        if not self.admin_token or not self.current_student_id:
            print("❌ No admin token or student ID available")
            return False
            
        headers = self.headers.copy()
        headers['Authorization'] = f'Bearer {self.admin_token}'
        
        success, response = self.run_test(
            "Approve Student",
            "PUT",
            f"/api/students/{self.current_student_id}/approve",
            200,
            headers=headers,
            description="Admin approves student registration"
        )
        
        if success:
            print(f"   Student approved successfully")
        
        return success

    def test_get_fees(self):
        """Test getting fees after student approval"""
        if not self.parent_token:
            print("❌ No parent token available")
            return False
            
        # Wait a moment for fees to be created after approval
        print("   Waiting for fees to be generated...")
        time.sleep(2)
            
        headers = self.headers.copy()
        headers['Authorization'] = f'Bearer {self.parent_token}'
        
        success, response = self.run_test(
            "Get Fees (Parent)",
            "GET",
            "/api/fees",
            200,
            headers=headers,
            description="Get student fees after approval"
        )
        
        if success and response:
            print(f"   Found {len(response)} fee(s)")
            if response:
                self.current_fee_id = response[0]['id']
                print(f"   First fee ID: {self.current_fee_id}")
        
        return success

    def test_make_payment(self):
        """Test making a payment"""
        if not self.parent_token or not self.current_fee_id:
            print("❌ No parent token or fee ID available")
            return False
            
        payment_data = {
            "fee_id": self.current_fee_id,
            "amount": 100.00,
            "payment_method": "fpx"
        }
        
        headers = self.headers.copy()
        headers['Authorization'] = f'Bearer {self.parent_token}'
        
        success, response = self.run_test(
            "Make Payment",
            "POST",
            "/api/payments",
            200,
            data=payment_data,
            headers=headers,
            description="Make mock payment for fee"
        )
        
        if success:
            print(f"   Payment successful, receipt: {response.get('receipt_number', 'N/A')}")
        
        return success

    def test_get_payments(self):
        """Test getting payment history"""
        if not self.parent_token:
            print("❌ No parent token available")
            return False
            
        headers = self.headers.copy()
        headers['Authorization'] = f'Bearer {self.parent_token}'
        
        success, response = self.run_test(
            "Get Payment History",
            "GET",
            "/api/payments",
            200,
            headers=headers,
            description="Get parent's payment history"
        )
        
        if success:
            print(f"   Found {len(response)} payment(s)")
        
        return success

    def test_get_notifications(self):
        """Test getting notifications"""
        if not self.parent_token:
            print("❌ No parent token available")
            return False
            
        headers = self.headers.copy()
        headers['Authorization'] = f'Bearer {self.parent_token}'
        
        success, response = self.run_test(
            "Get Notifications",
            "GET",
            "/api/notifications",
            200,
            headers=headers,
            description="Get user notifications"
        )
        
        if success:
            print(f"   Found {len(response)} notification(s)")
        
        return success

    def test_parent_dashboard(self):
        """Test parent dashboard stats"""
        if not self.parent_token:
            print("❌ No parent token available")
            return False
            
        headers = self.headers.copy()
        headers['Authorization'] = f'Bearer {self.parent_token}'
        
        success, response = self.run_test(
            "Parent Dashboard",
            "GET",
            "/api/dashboard/parent",
            200,
            headers=headers,
            description="Get parent dashboard statistics"
        )
        
        if success:
            print(f"   Children: {response.get('total_children', 0)}, Fees: RM{response.get('total_fees', 0):.2f}")
        
        return success

    def test_admin_dashboard(self):
        """Test admin dashboard stats"""
        if not self.admin_token:
            print("❌ No admin token available")
            return False
            
        headers = self.headers.copy()
        headers['Authorization'] = f'Bearer {self.admin_token}'
        
        success, response = self.run_test(
            "Admin Dashboard",
            "GET",
            "/api/dashboard/admin",
            200,
            headers=headers,
            description="Get admin dashboard statistics"
        )
        
        if success:
            print(f"   Total Students: {response.get('total_students', 0)}, Total Parents: {response.get('total_parents', 0)}")
        
        return success

    def test_fee_reports(self):
        """Test fee reports"""
        if not self.admin_token:
            print("❌ No admin token available")
            return False
            
        headers = self.headers.copy()
        headers['Authorization'] = f'Bearer {self.admin_token}'
        
        success, response = self.run_test(
            "Fee Reports",
            "GET",
            "/api/reports/fees",
            200,
            headers=headers,
            description="Get fee reports for admin"
        )
        
        if success:
            print(f"   Total fees tracked: {response.get('total_fees', 0)}")
        
        return success

    def test_superadmin_create_user(self):
        """Test SuperAdmin creating new user"""
        if not self.superadmin_token:
            print("❌ No SuperAdmin token available")
            return False
            
        timestamp = str(int(time.time()))
        user_data = {
            "email": f"testuser{timestamp}@mrsm.edu.my",
            "password": "TestPass123!",
            "full_name": f"Test User {timestamp}",
            "phone": "0123456789",
            "ic_number": f"990202{timestamp[-6:]}",
            "role": "admin",
            "staff_id": f"STAFF{timestamp[-4:]}"
        }
        
        headers = self.headers.copy()
        headers['Authorization'] = f'Bearer {self.superadmin_token}'
        
        success, response = self.run_test(
            "SuperAdmin Create User",
            "POST",
            "/api/users",
            200,
            data=user_data,
            headers=headers,
            description="SuperAdmin creates new admin user"
        )
        
        if success and 'id' in response:
            self.created_user_id = response['id']
            print(f"   Created user with ID: {self.created_user_id}")
        
        return success

    def test_superadmin_get_users(self):
        """Test SuperAdmin getting all users"""
        if not self.superadmin_token:
            print("❌ No SuperAdmin token available")
            return False
            
        headers = self.headers.copy()
        headers['Authorization'] = f'Bearer {self.superadmin_token}'
        
        success, response = self.run_test(
            "SuperAdmin Get All Users",
            "GET",
            "/api/users",
            200,
            headers=headers,
            description="SuperAdmin gets all system users"
        )
        
        if success:
            print(f"   Found {len(response)} user(s) in system")
        
        return success

    def test_superadmin_audit_logs(self):
        """Test SuperAdmin accessing audit logs"""
        if not self.superadmin_token:
            print("❌ No SuperAdmin token available")
            return False
            
        headers = self.headers.copy()
        headers['Authorization'] = f'Bearer {self.superadmin_token}'
        
        success, response = self.run_test(
            "SuperAdmin Audit Logs",
            "GET",
            "/api/audit-logs?limit=50",
            200,
            headers=headers,
            description="SuperAdmin accesses system audit logs"
        )
        
        if success:
            print(f"   Found {len(response)} audit log entries")
        
        return success

    def test_role_based_dashboards(self):
        """Test different role-based dashboards"""
        dashboards = [
            (self.superadmin_token, "/api/dashboard/admin", "SuperAdmin Dashboard"),
            (self.admin_token, "/api/dashboard/admin", "Admin Dashboard"),
            (self.bendahari_token, "/api/dashboard/admin", "Bendahari Dashboard"),
            (self.warden_token, "/api/dashboard/warden", "Warden Dashboard"),
            (self.guard_token, "/api/dashboard/guard", "Guard Dashboard"),
            (self.guru_token, "/api/dashboard/guru", "Guru Dashboard")
        ]
        
        all_success = True
        for token, endpoint, name in dashboards:
            if token:
                headers = self.headers.copy()
                headers['Authorization'] = f'Bearer {token}'
                
                success, response = self.run_test(
                    name,
                    "GET",
                    endpoint,
                    200,
                    headers=headers,
                    description=f"Get {name} statistics"
                )
                if not success:
                    all_success = False
                    
        return all_success

    def run_all_tests(self):
        """Run all API tests"""
        print("=" * 60)
        print("🚀 MRSM Portal Backend API Testing Started - Iteration 2")
        print("=" * 60)
        
        # Basic connectivity
        self.test_health_check()
        
        # Authentication flow - All roles
        print("\n🔐 AUTHENTICATION TESTS")
        self.test_parent_registration()
        self.test_parent_login()
        self.test_superadmin_login()
        self.test_admin_login()
        self.test_bendahari_login()
        self.test_warden_login()
        self.test_guard_login()
        self.test_guru_login()
        self.test_get_current_user()
        
        # SuperAdmin specific functionality
        print("\n👑 SUPERADMIN FUNCTIONALITY TESTS")
        self.test_superadmin_get_users()
        self.test_superadmin_create_user()
        self.test_superadmin_audit_logs()
        
        # Student management
        print("\n🎓 STUDENT MANAGEMENT TESTS")
        self.test_create_student()
        self.test_get_students()
        self.test_admin_get_students()
        self.test_approve_student()
        
        # Fee management
        print("\n💰 FEE MANAGEMENT TESTS")
        self.test_get_fees()
        self.test_make_payment()
        self.test_get_payments()
        
        # Notifications
        print("\n🔔 NOTIFICATION TESTS")
        self.test_get_notifications()
        
        # Role-based dashboards
        print("\n📊 DASHBOARD TESTS")
        self.test_parent_dashboard()
        self.test_role_based_dashboards()
        
        # Reports
        print("\n📈 REPORTING TESTS")
        self.test_fee_reports()
        
        # Final results
        print("\n" + "=" * 60)
        print("📊 FINAL TEST RESULTS - ITERATION 2")
        print("=" * 60)
        print(f"✅ Tests Passed: {self.tests_passed}")
        print(f"❌ Tests Failed: {self.tests_run - self.tests_passed}")
        print(f"📈 Success Rate: {(self.tests_passed / self.tests_run * 100):.1f}%")
        
        success_rate = self.tests_passed / self.tests_run if self.tests_run > 0 else 0
        
        if success_rate >= 0.8:
            print("🎉 BACKEND TESTS: PASSED (>= 80% success)")
            return True
        else:
            print("⚠️  BACKEND TESTS: FAILED (< 80% success)")
            return False

def main():
    """Main test execution"""
    print("🔧 Starting MRSM Portal Backend API Tests...")
    
    tester = MRSMAPITester()
    
    try:
        success = tester.run_all_tests()
        return 0 if success else 1
    except KeyboardInterrupt:
        print("\n🛑 Tests interrupted by user")
        return 2
    except Exception as e:
        print(f"\n💥 Unexpected error during testing: {e}")
        return 3

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)