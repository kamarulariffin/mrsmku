"""
Tests for Teacher Pages - /guru/students and /guru/fees
Testing new TeacherStudentsPage.js and TeacherFeesPage.js components
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://yuran-admin-panel.preview.emergentagent.com")

# Test credentials
GURU_EMAIL = "guru@muafakat.link"
GURU_PASSWORD = "guru123"


@pytest.fixture(scope="module")
def guru_token():
    """Get auth token for guru_kelas user"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": GURU_EMAIL,
        "password": GURU_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert data["user"]["role"] == "guru_kelas", f"Expected guru_kelas role, got {data['user']['role']}"
    return data["access_token"]


@pytest.fixture(scope="module")
def guru_user_info(guru_token):
    """Get guru user info"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": GURU_EMAIL,
        "password": GURU_PASSWORD
    })
    return response.json()["user"]


class TestGuruDashboardOverviewAPI:
    """Test /api/guru-dashboard/overview endpoint for guru_kelas role"""
    
    def test_overview_returns_200(self, guru_token):
        """Test that overview endpoint works for guru_kelas"""
        headers = {"Authorization": f"Bearer {guru_token}"}
        response = requests.get(f"{BASE_URL}/api/guru-dashboard/overview", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
    def test_overview_returns_class_info(self, guru_token):
        """Test that overview returns class name and student count"""
        headers = {"Authorization": f"Bearer {guru_token}"}
        response = requests.get(f"{BASE_URL}/api/guru-dashboard/overview", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "class_name" in data, "Missing class_name field"
        assert "total_students" in data, "Missing total_students field"
        assert "statistics" in data, "Missing statistics field"
        assert "by_fee_status" in data, "Missing by_fee_status field"
        
    def test_overview_statistics_structure(self, guru_token):
        """Test that statistics has required fields"""
        headers = {"Authorization": f"Bearer {guru_token}"}
        response = requests.get(f"{BASE_URL}/api/guru-dashboard/overview", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        stats = data.get("statistics", {})
        
        # Verify statistics fields
        assert "total_expected" in stats, "Missing total_expected in statistics"
        assert "total_collected" in stats, "Missing total_collected in statistics"
        assert "total_outstanding" in stats, "Missing total_outstanding in statistics"
        assert "collection_rate" in stats, "Missing collection_rate in statistics"
        
    def test_overview_fee_status_breakdown(self, guru_token):
        """Test that fee status breakdown has all categories"""
        headers = {"Authorization": f"Bearer {guru_token}"}
        response = requests.get(f"{BASE_URL}/api/guru-dashboard/overview", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        by_status = data.get("by_fee_status", {})
        
        # Verify all fee status categories
        expected_statuses = ["selesai", "separa", "belum_bayar", "tiada_yuran"]
        for status in expected_statuses:
            assert status in by_status, f"Missing {status} in by_fee_status"


class TestGuruStudentsAPI:
    """Test /api/guru-dashboard/students endpoint for guru_kelas role"""
    
    def test_students_returns_200(self, guru_token):
        """Test that students endpoint works for guru_kelas"""
        headers = {"Authorization": f"Bearer {guru_token}"}
        response = requests.get(f"{BASE_URL}/api/guru-dashboard/students", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
    def test_students_returns_list_with_pagination(self, guru_token):
        """Test that students response has students list and pagination"""
        headers = {"Authorization": f"Bearer {guru_token}"}
        response = requests.get(f"{BASE_URL}/api/guru-dashboard/students", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "students" in data, "Missing students field"
        assert "pagination" in data, "Missing pagination field"
        assert isinstance(data["students"], list), "students should be a list"
        
    def test_students_have_required_fields(self, guru_token):
        """Test that each student has required fields"""
        headers = {"Authorization": f"Bearer {guru_token}"}
        response = requests.get(f"{BASE_URL}/api/guru-dashboard/students", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        students = data.get("students", [])
        
        if len(students) > 0:
            student = students[0]
            required_fields = ["student_id", "full_name", "matric_number", "total_fees", 
                            "paid_amount", "outstanding", "fee_status"]
            for field in required_fields:
                assert field in student, f"Missing {field} in student data"
                
    def test_students_filter_by_fee_status(self, guru_token):
        """Test filtering students by fee status"""
        headers = {"Authorization": f"Bearer {guru_token}"}
        
        # Test filter by selesai status
        response = requests.get(f"{BASE_URL}/api/guru-dashboard/students?fee_status=selesai", headers=headers)
        assert response.status_code == 200
        
        # Test filter by belum_bayar status
        response = requests.get(f"{BASE_URL}/api/guru-dashboard/students?fee_status=belum_bayar", headers=headers)
        assert response.status_code == 200
        
    def test_students_search_functionality(self, guru_token):
        """Test search by name or matric number"""
        headers = {"Authorization": f"Bearer {guru_token}"}
        
        # Search by a name fragment
        response = requests.get(f"{BASE_URL}/api/guru-dashboard/students?search=test", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "students" in data
        

class TestGuruStudentDetailAPI:
    """Test /api/guru-dashboard/student/{student_id} endpoint"""
    
    def test_student_detail_works_for_class_student(self, guru_token):
        """Test getting student detail for a student in guru's class"""
        headers = {"Authorization": f"Bearer {guru_token}"}
        
        # First get a student from the list
        response = requests.get(f"{BASE_URL}/api/guru-dashboard/students", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        students = data.get("students", [])
        if len(students) > 0:
            student_id = students[0]["student_id"]
            
            # Now get detail
            detail_response = requests.get(f"{BASE_URL}/api/guru-dashboard/student/{student_id}", headers=headers)
            assert detail_response.status_code == 200, f"Expected 200, got {detail_response.status_code}"
            
            detail = detail_response.json()
            assert "full_name" in detail, "Missing full_name in detail"
            assert "matric_number" in detail, "Missing matric_number in detail"
        else:
            pytest.skip("No students in class to test detail endpoint")


class TestTeacherPagesDataIntegrity:
    """Test data integrity - teacher should only see students from assigned class"""
    
    def test_overview_shows_assigned_class_only(self, guru_token, guru_user_info):
        """Verify that overview shows correct class (T1 A for guru@muafakat.link)"""
        headers = {"Authorization": f"Bearer {guru_token}"}
        response = requests.get(f"{BASE_URL}/api/guru-dashboard/overview", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Guru is assigned to Tingkatan 1, Kelas A
        assigned_form = guru_user_info.get("assigned_form", 1)
        assigned_class = guru_user_info.get("assigned_class", "A")
        
        # Verify class name matches
        class_name = data.get("class_name", "")
        tingkatan = data.get("tingkatan")
        kelas = data.get("kelas")
        
        print(f"User assigned to: Tingkatan {assigned_form}, Kelas {assigned_class}")
        print(f"API returned: class_name={class_name}, tingkatan={tingkatan}, kelas={kelas}")
        
        # Allow for various class name formats
        if tingkatan:
            assert tingkatan == assigned_form, f"Expected tingkatan {assigned_form}, got {tingkatan}"
        if kelas:
            assert kelas == assigned_class, f"Expected kelas {assigned_class}, got {kelas}"
            
    def test_students_from_assigned_class_only(self, guru_token, guru_user_info):
        """Verify that students list only shows students from assigned class"""
        headers = {"Authorization": f"Bearer {guru_token}"}
        response = requests.get(f"{BASE_URL}/api/guru-dashboard/students", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        students = data.get("students", [])
        filters = data.get("filters_applied", {})
        
        assigned_form = guru_user_info.get("assigned_form", 1)
        assigned_class = guru_user_info.get("assigned_class", "A")
        
        print(f"Filters applied: {filters}")
        print(f"Number of students: {len(students)}")
        
        # Verify filters are being applied correctly
        assert filters.get("tingkatan") == assigned_form or filters.get("tingkatan") is None
        
        # Verify each student is from the correct class
        for student in students:
            student_form = student.get("form")
            student_class = student.get("class_name")
            
            if assigned_form:
                assert student_form == assigned_form, f"Student {student['full_name']} has form {student_form}, expected {assigned_form}"
            if assigned_class:
                assert student_class == assigned_class, f"Student {student['full_name']} has class {student_class}, expected {assigned_class}"


class TestSendReminderAPI:
    """Test /api/guru-dashboard/send-reminder endpoint"""
    
    def test_send_reminder_returns_success_or_not_found(self, guru_token):
        """Test sending payment reminder to parents with outstanding fees"""
        headers = {"Authorization": f"Bearer {guru_token}"}
        response = requests.post(f"{BASE_URL}/api/guru-dashboard/send-reminder", headers=headers)
        
        # Should return 200 with success message or appropriate error
        assert response.status_code in [200, 404, 400], f"Unexpected status: {response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
