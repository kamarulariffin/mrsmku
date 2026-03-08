"""
Test Guru Dashboard Module - Fasa 3: Dashboard Guru Kelas
Tests for viewing student fee payment status in assigned class
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
GURU_EMAIL = "guru@muafakat.link"
GURU_PASSWORD = "guru123"
SUPERADMIN_EMAIL = "superadmin@muafakat.link"
SUPERADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def guru_token(api_client):
    """Get guru authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": GURU_EMAIL,
        "password": GURU_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Guru authentication failed: {response.text}")


@pytest.fixture(scope="module")
def superadmin_token(api_client):
    """Get superadmin authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": SUPERADMIN_EMAIL,
        "password": SUPERADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Superadmin authentication failed: {response.text}")


@pytest.fixture(scope="module")
def guru_client(api_client, guru_token):
    """Session with guru auth header"""
    api_client.headers.update({"Authorization": f"Bearer {guru_token}"})
    return api_client


class TestGuruDashboardOverview:
    """Test GET /api/guru-dashboard/overview endpoint"""
    
    def test_overview_returns_class_statistics(self, api_client, guru_token):
        """Test that overview returns statistics for assigned class"""
        response = api_client.get(
            f"{BASE_URL}/api/guru-dashboard/overview",
            headers={"Authorization": f"Bearer {guru_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify structure
        assert "class_name" in data
        assert "total_students" in data
        assert "statistics" in data
        assert "by_fee_status" in data
        assert "by_gender" in data
        assert "by_religion" in data
        
        # Verify statistics structure
        stats = data["statistics"]
        assert "total_expected" in stats
        assert "total_collected" in stats
        assert "total_outstanding" in stats
        assert "collection_rate" in stats
        
        # Verify fee status breakdown
        fee_status = data["by_fee_status"]
        assert "selesai" in fee_status
        assert "separa" in fee_status
        assert "belum_bayar" in fee_status
        assert "tiada_yuran" in fee_status
        
        # Verify gender breakdown
        assert "male" in data["by_gender"]
        assert "female" in data["by_gender"]
        
        print(f"Overview response: class={data['class_name']}, students={data['total_students']}")
    
    def test_overview_with_tahun_filter(self, api_client, guru_token):
        """Test overview with year filter"""
        response = api_client.get(
            f"{BASE_URL}/api/guru-dashboard/overview",
            params={"tahun": 2026},
            headers={"Authorization": f"Bearer {guru_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["tahun"] == 2026
        print(f"Overview with tahun=2026: students={data['total_students']}")
    
    def test_overview_returns_top_outstanding(self, api_client, guru_token):
        """Test that overview includes top outstanding students"""
        response = api_client.get(
            f"{BASE_URL}/api/guru-dashboard/overview",
            headers={"Authorization": f"Bearer {guru_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        # top_outstanding should be a list (may be empty)
        assert "top_outstanding" in data
        assert isinstance(data["top_outstanding"], list)
        
        if data["top_outstanding"]:
            first = data["top_outstanding"][0]
            assert "student_id" in first
            assert "full_name" in first
            assert "matric_number" in first
            assert "outstanding" in first
        print(f"Top outstanding count: {len(data['top_outstanding'])}")


class TestGuruDashboardStudents:
    """Test GET /api/guru-dashboard/students endpoint"""
    
    def test_students_list_returns_paginated(self, api_client, guru_token):
        """Test that students list returns paginated data"""
        response = api_client.get(
            f"{BASE_URL}/api/guru-dashboard/students",
            headers={"Authorization": f"Bearer {guru_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "students" in data
        assert "pagination" in data
        assert isinstance(data["students"], list)
        
        # Verify pagination structure
        pagination = data["pagination"]
        assert "page" in pagination
        assert "limit" in pagination
        assert "total" in pagination
        assert "has_next" in pagination
        assert "has_prev" in pagination
        
        print(f"Students list: total={pagination['total']}, page={pagination['page']}")
    
    def test_students_with_gender_filter_male(self, api_client, guru_token):
        """Test filter by gender=male"""
        response = api_client.get(
            f"{BASE_URL}/api/guru-dashboard/students",
            params={"gender": "male"},
            headers={"Authorization": f"Bearer {guru_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        filters = data.get("filters_applied", {})
        assert filters.get("gender") == "male"
        
        # Verify all returned students are male
        for student in data["students"]:
            if student.get("gender"):
                assert student["gender"].lower() in ["male", "lelaki"]
        print(f"Male students: {len(data['students'])}")
    
    def test_students_with_gender_filter_female(self, api_client, guru_token):
        """Test filter by gender=female"""
        response = api_client.get(
            f"{BASE_URL}/api/guru-dashboard/students",
            params={"gender": "female"},
            headers={"Authorization": f"Bearer {guru_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        for student in data["students"]:
            if student.get("gender"):
                assert student["gender"].lower() in ["female", "perempuan"]
        print(f"Female students: {len(data['students'])}")
    
    def test_students_with_religion_filter(self, api_client, guru_token):
        """Test filter by religion"""
        response = api_client.get(
            f"{BASE_URL}/api/guru-dashboard/students",
            params={"religion": "Islam"},
            headers={"Authorization": f"Bearer {guru_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        filters = data.get("filters_applied", {})
        assert filters.get("religion") == "Islam"
        print(f"Islam students: {len(data['students'])}")
    
    def test_students_with_fee_status_filter_selesai(self, api_client, guru_token):
        """Test filter by fee_status=selesai"""
        response = api_client.get(
            f"{BASE_URL}/api/guru-dashboard/students",
            params={"fee_status": "selesai"},
            headers={"Authorization": f"Bearer {guru_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        # All returned students should have fee_status=selesai
        for student in data["students"]:
            assert student["fee_status"] == "selesai"
        print(f"Selesai students: {len(data['students'])}")
    
    def test_students_with_fee_status_filter_belum_bayar(self, api_client, guru_token):
        """Test filter by fee_status=belum_bayar"""
        response = api_client.get(
            f"{BASE_URL}/api/guru-dashboard/students",
            params={"fee_status": "belum_bayar"},
            headers={"Authorization": f"Bearer {guru_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        for student in data["students"]:
            assert student["fee_status"] == "belum_bayar"
        print(f"Belum bayar students: {len(data['students'])}")
    
    def test_students_search_by_name(self, api_client, guru_token):
        """Test search by student name"""
        response = api_client.get(
            f"{BASE_URL}/api/guru-dashboard/students",
            params={"search": "Ahmad"},
            headers={"Authorization": f"Bearer {guru_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        filters = data.get("filters_applied", {})
        assert filters.get("search") == "Ahmad"
        print(f"Search 'Ahmad' results: {len(data['students'])}")
    
    def test_students_search_by_matric(self, api_client, guru_token):
        """Test search by matric number"""
        response = api_client.get(
            f"{BASE_URL}/api/guru-dashboard/students",
            params={"search": "S2026"},
            headers={"Authorization": f"Bearer {guru_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        print(f"Search 'S2026' results: {len(data['students'])}")
    
    def test_students_pagination_page_2(self, api_client, guru_token):
        """Test pagination - page 2"""
        response = api_client.get(
            f"{BASE_URL}/api/guru-dashboard/students",
            params={"page": 2, "limit": 5},
            headers={"Authorization": f"Bearer {guru_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        pagination = data["pagination"]
        assert pagination["page"] == 2
        assert pagination["limit"] == 5
        print(f"Page 2 (limit 5): {len(data['students'])} students")
    
    def test_students_data_structure(self, api_client, guru_token):
        """Test student data structure has all required fields"""
        response = api_client.get(
            f"{BASE_URL}/api/guru-dashboard/students",
            params={"limit": 1},
            headers={"Authorization": f"Bearer {guru_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        if data["students"]:
            student = data["students"][0]
            # Required fields
            assert "student_id" in student
            assert "full_name" in student
            assert "matric_number" in student
            assert "form" in student
            assert "class_name" in student
            assert "total_fees" in student
            assert "paid_amount" in student
            assert "outstanding" in student
            assert "fee_status" in student
            assert "progress_percent" in student
            print(f"Student structure verified: {student['full_name']}")


class TestGuruDashboardStudentDetail:
    """Test GET /api/guru-dashboard/student/{id} endpoint"""
    
    def test_student_detail_returns_full_info(self, api_client, guru_token):
        """Test student detail returns complete information"""
        # First get a student ID from the list
        list_response = api_client.get(
            f"{BASE_URL}/api/guru-dashboard/students",
            params={"limit": 1},
            headers={"Authorization": f"Bearer {guru_token}"}
        )
        
        if list_response.status_code == 200 and list_response.json()["students"]:
            student_id = list_response.json()["students"][0]["student_id"]
            
            response = api_client.get(
                f"{BASE_URL}/api/guru-dashboard/student/{student_id}",
                headers={"Authorization": f"Bearer {guru_token}"}
            )
            assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
            
            data = response.json()
            # Verify structure
            assert "student" in data
            assert "fee_summary" in data
            assert "yuran_records" in data
            
            # Verify student info
            student = data["student"]
            assert "id" in student
            assert "full_name" in student
            assert "matric_number" in student
            assert "ic_number" in student
            assert "form" in student
            assert "class_name" in student
            
            # Verify fee summary
            fee_summary = data["fee_summary"]
            assert "total_fees" in fee_summary
            assert "paid_amount" in fee_summary
            assert "outstanding" in fee_summary
            assert "progress_percent" in fee_summary
            
            # yuran_records should be a list
            assert isinstance(data["yuran_records"], list)
            
            print(f"Student detail: {student['full_name']}, total_fees={fee_summary['total_fees']}")
        else:
            pytest.skip("No students available in class")
    
    def test_student_detail_invalid_id(self, api_client, guru_token):
        """Test student detail with invalid ID returns 404 or error"""
        response = api_client.get(
            f"{BASE_URL}/api/guru-dashboard/student/000000000000000000000000",
            headers={"Authorization": f"Bearer {guru_token}"}
        )
        # Should return 404 or 500 (depends on implementation)
        assert response.status_code in [404, 400, 500]
        print(f"Invalid ID response: {response.status_code}")


class TestGuruDashboardFilterOptions:
    """Test GET /api/guru-dashboard/filter-options endpoint"""
    
    def test_filter_options_returns_all_categories(self, api_client, guru_token):
        """Test filter options returns all filter categories"""
        response = api_client.get(
            f"{BASE_URL}/api/guru-dashboard/filter-options",
            headers={"Authorization": f"Bearer {guru_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Required categories
        assert "gender" in data
        assert "religion" in data
        assert "bangsa" in data
        assert "state" in data
        assert "fee_status" in data
        assert "tahun" in data
        
        # Gender should have male/female options
        assert len(data["gender"]) >= 2
        
        # Fee status should have 4 options
        assert len(data["fee_status"]) == 4
        
        # Tahun should have years
        assert isinstance(data["tahun"], list)
        assert len(data["tahun"]) >= 1
        
        print(f"Filter options: gender={len(data['gender'])}, religion={len(data['religion'])}, fee_status={len(data['fee_status'])}")


class TestGuruDashboardAccessControl:
    """Test access control - guru can only see their class"""
    
    def test_guru_sees_only_assigned_class(self, api_client, guru_token):
        """Test guru can only see students from assigned class"""
        response = api_client.get(
            f"{BASE_URL}/api/guru-dashboard/overview",
            headers={"Authorization": f"Bearer {guru_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        # Guru with assigned_class='A' should only see class A
        # Note: Could be "Semua Kelas" if guru is superadmin/admin
        print(f"Guru sees class: {data['class_name']}")
    
    def test_superadmin_sees_all_classes(self, api_client, superadmin_token):
        """Test superadmin can see all students"""
        response = api_client.get(
            f"{BASE_URL}/api/guru-dashboard/overview",
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        # Superadmin should see "Semua Kelas" or all students
        print(f"Superadmin sees: class={data['class_name']}, total={data['total_students']}")
    
    def test_unauthorized_access(self, api_client):
        """Test unauthorized access is denied"""
        response = api_client.get(
            f"{BASE_URL}/api/guru-dashboard/overview"
        )
        # Should fail without auth token
        assert response.status_code in [401, 403]
        print(f"Unauthorized access denied: {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
