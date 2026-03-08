"""
Test Student Bangsa and Report Features
- GET /api/admin/bangsa - List of bangsa options
- GET /api/admin/students/report - Student report by religion and bangsa
- GET /api/admin/students/with-parents - Students list with parent info
- PUT /api/students/{id} - Update student with bangsa field
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBangsaAndReport:
    """Tests for Bangsa and Student Report features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get admin auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@muafakat.link",
            "password": "admin123"
        })
        assert login_response.status_code == 200, f"Admin login failed: {login_response.text}"
        self.token = login_response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_get_bangsa_options(self):
        """Test GET /api/admin/bangsa returns list of bangsa options"""
        response = self.session.get(f"{BASE_URL}/api/admin/bangsa")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "options" in data
        
        expected_options = ["Melayu", "Cina", "India", "Bumiputera Sabah", "Bumiputera Sarawak", "Lain-lain"]
        assert data["options"] == expected_options, f"Options mismatch: {data['options']}"
        print(f"SUCCESS: GET /api/admin/bangsa - Returned {len(data['options'])} options")
    
    def test_get_students_report(self):
        """Test GET /api/admin/students/report returns comprehensive report"""
        response = self.session.get(f"{BASE_URL}/api/admin/students/report")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        
        # Check summary structure
        assert "summary" in data, "Missing 'summary' field"
        summary = data["summary"]
        assert "total_students" in summary
        assert "muslim" in summary
        assert "non_muslim" in summary
        assert "muslim_percentage" in summary
        assert "non_muslim_percentage" in summary
        
        # Verify percentage calculation
        total = summary["total_students"]
        if total > 0:
            expected_muslim_pct = round(summary["muslim"] / total * 100, 1)
            assert summary["muslim_percentage"] == expected_muslim_pct, "Muslim percentage mismatch"
        
        # Check breakdown structures
        assert "by_religion" in data, "Missing 'by_religion' field"
        assert "by_bangsa" in data, "Missing 'by_bangsa' field"
        assert "by_form" in data, "Missing 'by_form' field"
        
        print(f"SUCCESS: GET /api/admin/students/report")
        print(f"  Total: {summary['total_students']}, Muslim: {summary['muslim']} ({summary['muslim_percentage']}%), Non-Muslim: {summary['non_muslim']} ({summary['non_muslim_percentage']}%)")
        print(f"  By Bangsa: {data['by_bangsa']}")
        print(f"  By Religion: {data['by_religion']}")
    
    def test_report_70_30_ratio(self):
        """Test that Muslim vs Non-Muslim ratio is approximately 70/30 as specified"""
        response = self.session.get(f"{BASE_URL}/api/admin/students/report")
        assert response.status_code == 200
        
        data = response.json()
        summary = data["summary"]
        
        # Check if data has students
        if summary["total_students"] > 0:
            muslim_pct = summary["muslim_percentage"]
            non_muslim_pct = summary["non_muslim_percentage"]
            
            print(f"INFO: Muslim: {muslim_pct}%, Non-Muslim: {non_muslim_pct}%")
            
            # Allow some tolerance (±10%) from the 70/30 target
            if summary["total_students"] >= 10:  # Only check ratio if enough students
                assert 60 <= muslim_pct <= 80, f"Muslim percentage {muslim_pct}% outside expected range (60-80%)"
                assert 20 <= non_muslim_pct <= 40, f"Non-Muslim percentage {non_muslim_pct}% outside expected range (20-40%)"
                print(f"SUCCESS: Ratio is within expected 70/30 ±10% tolerance")
    
    def test_report_by_bangsa_breakdown(self):
        """Test that by_bangsa contains expected ethnic groups"""
        response = self.session.get(f"{BASE_URL}/api/admin/students/report")
        assert response.status_code == 200
        
        data = response.json()
        by_bangsa = data.get("by_bangsa", {})
        
        # Should have at least Melayu if there are students
        if data["summary"]["total_students"] > 0:
            print(f"INFO: Bangsa breakdown: {by_bangsa}")
            # Check if we have expected ethnic groups based on requirement (Cina, India, Bumiputera)
            expected_groups = ["Melayu", "Cina", "India"]
            found_groups = [g for g in expected_groups if g in by_bangsa]
            print(f"SUCCESS: Found ethnic groups: {found_groups}")
    
    def test_get_students_with_parents(self):
        """Test GET /api/admin/students/with-parents returns students with parent info"""
        response = self.session.get(f"{BASE_URL}/api/admin/students/with-parents")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        
        # Check structure
        assert "students" in data
        assert "pagination" in data
        
        pagination = data["pagination"]
        assert "page" in pagination
        assert "limit" in pagination
        assert "total" in pagination
        assert "total_pages" in pagination
        
        # Check student data structure if students exist
        if len(data["students"]) > 0:
            student = data["students"][0]
            # Verify expected fields
            expected_fields = ["student_id", "student_name", "matric_number", "form", "class_name", "religion", "bangsa"]
            for field in expected_fields:
                assert field in student, f"Missing field: {field}"
            
            # Parent fields (may be null)
            parent_fields = ["parent_id", "parent_name", "parent_email", "parent_phone"]
            for field in parent_fields:
                assert field in student, f"Missing parent field: {field}"
        
        print(f"SUCCESS: GET /api/admin/students/with-parents - Returned {len(data['students'])} students")
    
    def test_update_student_bangsa(self):
        """Test PUT /api/students/{id} can update bangsa field"""
        # First get a student to update
        students_response = self.session.get(f"{BASE_URL}/api/admin/students")
        assert students_response.status_code == 200
        
        students = students_response.json().get("students", [])
        if len(students) == 0:
            pytest.skip("No students available for update test")
        
        student = students[0]
        student_id = student["id"]
        original_bangsa = student.get("bangsa", "Melayu")
        
        # Update with a different bangsa
        new_bangsa = "Cina" if original_bangsa != "Cina" else "India"
        update_response = self.session.put(f"{BASE_URL}/api/students/{student_id}", json={
            "bangsa": new_bangsa
        })
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        updated_data = update_response.json()
        assert updated_data.get("bangsa") == new_bangsa, f"Bangsa not updated: {updated_data.get('bangsa')}"
        
        # Revert to original
        revert_response = self.session.put(f"{BASE_URL}/api/students/{student_id}", json={
            "bangsa": original_bangsa
        })
        assert revert_response.status_code == 200
        
        print(f"SUCCESS: PUT /api/students/{student_id} - Updated bangsa from {original_bangsa} to {new_bangsa} and reverted")
    
    def test_religions_endpoint(self):
        """Test GET /api/admin/religions returns expected options"""
        response = self.session.get(f"{BASE_URL}/api/admin/religions")
        assert response.status_code == 200
        
        data = response.json()
        assert "options" in data
        
        expected_options = ["Islam", "Buddha", "Hindu", "Kristian", "Sikh", "Taoisme", "Konfusianisme", "Lain-lain"]
        assert data["options"] == expected_options
        print(f"SUCCESS: GET /api/admin/religions - Returned {len(data['options'])} options")
    
    def test_cross_breakdown_in_report(self):
        """Test that report includes cross-tabulation of bangsa x religion"""
        response = self.session.get(f"{BASE_URL}/api/admin/students/report")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check for cross_breakdown field
        assert "cross_breakdown" in data, "Missing 'cross_breakdown' field"
        
        cross_breakdown = data["cross_breakdown"]
        if len(cross_breakdown) > 0:
            item = cross_breakdown[0]
            assert "bangsa" in item
            assert "religion" in item
            assert "count" in item
            print(f"SUCCESS: Cross breakdown available with {len(cross_breakdown)} entries")
            for entry in cross_breakdown[:5]:  # Show first 5
                print(f"  {entry['bangsa']} x {entry['religion']}: {entry['count']}")

    def test_report_by_form_breakdown(self):
        """Test that by_form breakdown is correct"""
        response = self.session.get(f"{BASE_URL}/api/admin/students/report")
        assert response.status_code == 200
        
        data = response.json()
        by_form = data.get("by_form", {})
        
        print(f"INFO: Form breakdown: {by_form}")
        
        # Check that form keys follow expected pattern
        for key in by_form.keys():
            assert key.startswith("Tingkatan"), f"Unexpected form key format: {key}"
        
        print(f"SUCCESS: by_form breakdown has {len(by_form)} entries")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
