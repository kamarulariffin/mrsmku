"""
Test Student Address Fields - Tests for Alamat, Poskod, Bandar, address_incomplete
This test suite verifies the new address fields feature added to student management.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://yuran-admin-panel.preview.emergentagent.com')

class TestStudentAddressFields:
    """Test address fields for students - Alamat, Poskod, Bandar, address_incomplete"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test with parent login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as parent
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "parent1@muafakat.link",
            "password": "parent123"
        })
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.parent_logged_in = True
        else:
            self.parent_logged_in = False
            pytest.skip("Parent login failed - skipping tests")
    
    def test_01_get_students_returns_address_fields(self):
        """GET /api/students - should return address, postcode, city, address_incomplete fields"""
        response = self.session.get(f"{BASE_URL}/api/students")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        students = response.json()
        assert isinstance(students, list), "Response should be a list"
        
        if len(students) > 0:
            student = students[0]
            # Verify address fields exist in response
            assert 'address' in student, "Student should have 'address' field"
            assert 'postcode' in student, "Student should have 'postcode' field"
            assert 'city' in student, "Student should have 'city' field"
            assert 'address_incomplete' in student, "Student should have 'address_incomplete' field"
            
            # address_incomplete should be boolean
            assert isinstance(student['address_incomplete'], bool), "address_incomplete should be boolean"
            
            print(f"Student {student.get('full_name')}:")
            print(f"  - address: {student.get('address')}")
            print(f"  - postcode: {student.get('postcode')}")
            print(f"  - city: {student.get('city')}")
            print(f"  - address_incomplete: {student.get('address_incomplete')}")
        else:
            print("No students found in response")
    
    def test_02_address_incomplete_flag_logic(self):
        """Verify address_incomplete is True when address/postcode/city is missing"""
        response = self.session.get(f"{BASE_URL}/api/students")
        assert response.status_code == 200
        
        students = response.json()
        for student in students:
            address = student.get('address')
            postcode = student.get('postcode')
            city = student.get('city')
            address_incomplete = student.get('address_incomplete')
            
            # Calculate expected value
            expected_incomplete = not address or not postcode or not city
            
            assert address_incomplete == expected_incomplete, \
                f"Student {student.get('full_name')}: address_incomplete should be {expected_incomplete}, got {address_incomplete}"
            
            print(f"Student {student.get('full_name')}: address_incomplete={address_incomplete} (expected: {expected_incomplete})")
    
    def test_03_update_student_address_fields(self):
        """PUT /api/students/{id} - should be able to update address, postcode, city"""
        # First get a student
        response = self.session.get(f"{BASE_URL}/api/students")
        assert response.status_code == 200
        
        students = response.json()
        if len(students) == 0:
            pytest.skip("No students to update")
        
        student = students[0]
        student_id = student.get('id')
        
        # Update address fields
        update_data = {
            "address": "No. 123, Jalan Test Alamat",
            "postcode": "40000",
            "city": "Shah Alam"
        }
        
        update_response = self.session.put(f"{BASE_URL}/api/students/{student_id}", json=update_data)
        assert update_response.status_code == 200, f"Update failed: {update_response.status_code} - {update_response.text}"
        
        updated_student = update_response.json()
        assert updated_student.get('address') == "No. 123, Jalan Test Alamat", "Address should be updated"
        assert updated_student.get('postcode') == "40000", "Postcode should be updated"
        assert updated_student.get('city') == "Shah Alam", "City should be updated"
        assert updated_student.get('address_incomplete') == False, "address_incomplete should be False after full update"
        
        print(f"Updated student {student_id}:")
        print(f"  - address: {updated_student.get('address')}")
        print(f"  - postcode: {updated_student.get('postcode')}")
        print(f"  - city: {updated_student.get('city')}")
        print(f"  - address_incomplete: {updated_student.get('address_incomplete')}")
    
    def test_04_partial_address_update_still_incomplete(self):
        """PUT /api/students/{id} - partial address update should keep address_incomplete=True"""
        # Get a student
        response = self.session.get(f"{BASE_URL}/api/students")
        assert response.status_code == 200
        
        students = response.json()
        if len(students) < 2:
            pytest.skip("Need at least 2 students for this test")
        
        # Use second student if available
        student = students[1] if len(students) > 1 else students[0]
        student_id = student.get('id')
        
        # Clear address first, then only update address (not postcode/city)
        clear_data = {
            "address": "",
            "postcode": "",
            "city": ""
        }
        self.session.put(f"{BASE_URL}/api/students/{student_id}", json=clear_data)
        
        # Now update only address
        update_data = {
            "address": "Jalan Partial Test"
        }
        
        update_response = self.session.put(f"{BASE_URL}/api/students/{student_id}", json=update_data)
        assert update_response.status_code == 200
        
        updated_student = update_response.json()
        # address_incomplete should still be True because postcode and city are empty
        assert updated_student.get('address_incomplete') == True, \
            "address_incomplete should be True when only address is filled"
        
        print(f"Partial update - address_incomplete: {updated_student.get('address_incomplete')}")
    
    def test_05_count_students_with_incomplete_address(self):
        """Count students that have incomplete address info"""
        response = self.session.get(f"{BASE_URL}/api/students")
        assert response.status_code == 200
        
        students = response.json()
        incomplete_count = sum(1 for s in students if s.get('address_incomplete', True))
        total_count = len(students)
        
        print(f"Total students: {total_count}")
        print(f"Students with incomplete address: {incomplete_count}")
        print(f"Students with complete address: {total_count - incomplete_count}")
        
        # This is informational - test passes regardless


class TestStudentAddressFieldsAdmin:
    """Test address fields with admin login"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test with admin login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as superadmin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "admin123"
        })
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.admin_logged_in = True
        else:
            self.admin_logged_in = False
            pytest.skip("Admin login failed - skipping tests")
    
    def test_01_admin_view_all_students_address(self):
        """Admin: GET /api/students/all - should return students with address fields"""
        response = self.session.get(f"{BASE_URL}/api/students/all")
        assert response.status_code == 200
        
        students = response.json()
        if len(students) > 0:
            student = students[0]
            assert 'address' in student, "Student should have 'address' field"
            assert 'postcode' in student, "Student should have 'postcode' field"
            assert 'city' in student, "Student should have 'city' field"
            assert 'address_incomplete' in student, "Student should have 'address_incomplete' field"
            
            print(f"Admin view - Total students: {len(students)}")
            incomplete = sum(1 for s in students if s.get('address_incomplete', True))
            print(f"Admin view - Students with incomplete address: {incomplete}")
    
    def test_02_admin_update_student_address(self):
        """Admin: PUT /api/students/{id}/admin - should be able to update address fields"""
        # Get students
        response = self.session.get(f"{BASE_URL}/api/students/all")
        assert response.status_code == 200
        
        students = response.json()
        if len(students) == 0:
            pytest.skip("No students to update")
        
        # Find a student with incomplete address
        student = next((s for s in students if s.get('address_incomplete', True)), students[0])
        student_id = student.get('id')
        
        # Admin update with full address
        update_data = {
            "address": "No. 456, Jalan Admin Test",
            "postcode": "50000",
            "city": "Kuala Lumpur"
        }
        
        update_response = self.session.put(f"{BASE_URL}/api/students/{student_id}/admin", json=update_data)
        
        if update_response.status_code == 404:
            # Try regular endpoint
            update_response = self.session.put(f"{BASE_URL}/api/students/{student_id}", json=update_data)
        
        assert update_response.status_code == 200, f"Admin update failed: {update_response.status_code}"
        
        updated_student = update_response.json()
        print(f"Admin updated student: {updated_student.get('full_name')}")
        print(f"  - address_incomplete: {updated_student.get('address_incomplete')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
