"""
Test Suite for 'Di Luar Bidang Tugas' Feature
Testing new complaint status and guidelines functionality
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestGuidelinesEndpoints:
    """Test new guidelines endpoints"""
    
    def test_get_complaint_types_includes_di_luar_bidang(self):
        """Test GET /api/complaints/types returns di_luar_bidang status"""
        response = requests.get(f"{BASE_URL}/api/complaints/types")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "statuses" in data, "Response should contain 'statuses' key"
        statuses = data["statuses"]
        
        # Verify di_luar_bidang is present
        assert "di_luar_bidang" in statuses, "di_luar_bidang should be in statuses"
        assert statuses["di_luar_bidang"] == "Di Luar Bidang Tugas", f"Expected 'Di Luar Bidang Tugas', got {statuses['di_luar_bidang']}"
        print("PASS: di_luar_bidang status available in complaint types")
    
    def test_get_all_guidelines(self):
        """Test GET /api/complaints/guidelines returns all guidelines"""
        response = requests.get(f"{BASE_URL}/api/complaints/guidelines")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "guidelines" in data, "Response should contain 'guidelines' key"
        guidelines = data["guidelines"]
        
        # Verify all expected guideline types are present
        expected_types = ["disiplin", "keselamatan", "kebajikan", "fasiliti_rosak", "makanan", "gangguan_pelajar", "lain_lain"]
        for guideline_type in expected_types:
            assert guideline_type in guidelines, f"'{guideline_type}' should be in guidelines"
            guideline = guidelines[guideline_type]
            assert "title" in guideline, f"{guideline_type} should have 'title'"
            assert "items" in guideline, f"{guideline_type} should have 'items'"
            assert "contact" in guideline, f"{guideline_type} should have 'contact'"
            assert len(guideline["items"]) > 0, f"{guideline_type} should have at least one item"
        
        print(f"PASS: All {len(expected_types)} guideline types present with correct structure")
    
    def test_get_specific_guideline_disiplin(self):
        """Test GET /api/complaints/guidelines/disiplin returns specific guideline"""
        response = requests.get(f"{BASE_URL}/api/complaints/guidelines/disiplin")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "guideline" in data, "Response should contain 'guideline' key"
        guideline = data["guideline"]
        
        assert guideline["title"] == "Peraturan Disiplin Pelajar MRSMKU"
        assert "items" in guideline and len(guideline["items"]) == 5
        assert "contact" in guideline
        print("PASS: GET /api/complaints/guidelines/disiplin returns correct guideline")
    
    def test_get_specific_guideline_keselamatan(self):
        """Test GET /api/complaints/guidelines/keselamatan returns specific guideline"""
        response = requests.get(f"{BASE_URL}/api/complaints/guidelines/keselamatan")
        assert response.status_code == 200
        
        data = response.json()
        guideline = data["guideline"]
        assert guideline["title"] == "Panduan Keselamatan Asrama"
        print("PASS: GET /api/complaints/guidelines/keselamatan returns correct guideline")
    
    def test_get_specific_guideline_not_found(self):
        """Test GET /api/complaints/guidelines/{invalid} returns 404"""
        response = requests.get(f"{BASE_URL}/api/complaints/guidelines/invalid_type")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: Invalid guideline type returns 404")


class TestDiLuarBidangStatusWorkflow:
    """Test di_luar_bidang status update and guideline auto-attachment"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as different users and get tokens"""
        # Parent login
        parent_login = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "parent@muafakat.link",
            "password": "parent123"
        })
        if parent_login.status_code == 200:
            self.parent_token = parent_login.json().get("access_token")
            self.parent_headers = {"Authorization": f"Bearer {self.parent_token}"}
        else:
            pytest.skip("Parent login failed")
        
        # Warden login
        warden_login = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "warden@muafakat.link",
            "password": "warden123"
        })
        if warden_login.status_code == 200:
            self.warden_token = warden_login.json().get("access_token")
            self.warden_headers = {"Authorization": f"Bearer {self.warden_token}"}
        else:
            pytest.skip("Warden login failed")
    
    def test_warden_can_update_status_to_di_luar_bidang(self):
        """Test warden can update complaint status to di_luar_bidang"""
        # First create a complaint as parent
        complaint_data = {
            "nama_pengadu": "TEST_Parent User",
            "hubungan": "ibu_bapa",
            "nombor_maktab": "M2024999",
            "nama_pelajar": "TEST_Pelajar DiLuarBidang",
            "tingkatan": 3,
            "asrama": "JA",
            "jenis_aduan": "disiplin",
            "penerangan": "Ini adalah aduan ujian untuk status di luar bidang tugas warden",
            "tahap_keutamaan": "sederhana"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/complaints",
            json=complaint_data,
            headers=self.parent_headers
        )
        assert create_response.status_code == 200, f"Create complaint failed: {create_response.text}"
        complaint_id = create_response.json()["complaint"]["id"]
        print(f"Created test complaint: {complaint_id}")
        
        # Warden updates status to di_luar_bidang
        status_update = {
            "status": "di_luar_bidang",
            "catatan": "Aduan ini di luar bidang tugas warden. Sila rujuk Unit HEM."
        }
        
        update_response = requests.put(
            f"{BASE_URL}/api/complaints/{complaint_id}/status",
            json=status_update,
            headers=self.warden_headers
        )
        assert update_response.status_code == 200, f"Status update failed: {update_response.text}"
        
        updated_complaint = update_response.json()["complaint"]
        assert updated_complaint["status"] == "di_luar_bidang", "Status should be di_luar_bidang"
        print("PASS: Warden can update status to di_luar_bidang")
        
        # Cleanup
        self.test_complaint_id = complaint_id
    
    def test_guideline_auto_attached_on_di_luar_bidang(self):
        """Test guideline_reference is auto-attached when status changes to di_luar_bidang"""
        # Create complaint with jenis_aduan = keselamatan
        complaint_data = {
            "nama_pengadu": "TEST_Parent Keselamatan",
            "hubungan": "ibu_bapa",
            "nombor_maktab": "M2024888",
            "nama_pelajar": "TEST_Pelajar Keselamatan",
            "tingkatan": 2,
            "asrama": "JB",
            "jenis_aduan": "keselamatan",
            "penerangan": "Aduan keselamatan untuk ujian auto-attach guideline",
            "tahap_keutamaan": "sederhana"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/complaints",
            json=complaint_data,
            headers=self.parent_headers
        )
        assert create_response.status_code == 200
        complaint_id = create_response.json()["complaint"]["id"]
        
        # Update to di_luar_bidang
        status_update = {"status": "di_luar_bidang"}
        update_response = requests.put(
            f"{BASE_URL}/api/complaints/{complaint_id}/status",
            json=status_update,
            headers=self.warden_headers
        )
        assert update_response.status_code == 200
        
        updated_complaint = update_response.json()["complaint"]
        
        # Verify guideline_reference is attached
        assert "guideline_reference" in updated_complaint, "guideline_reference should be in response"
        guideline_ref = updated_complaint["guideline_reference"]
        
        # Verify guideline matches complaint type (keselamatan)
        assert guideline_ref["jenis_aduan"] == "keselamatan"
        assert guideline_ref["title"] == "Panduan Keselamatan Asrama"
        assert len(guideline_ref["items"]) == 5
        assert "contact" in guideline_ref
        
        print("PASS: guideline_reference auto-attached when status changes to di_luar_bidang")
        print(f"Guideline attached: {guideline_ref['title']}")
    
    def test_guideline_persists_on_complaint_fetch(self):
        """Test guideline_reference persists when fetching complaint detail"""
        # Create and mark as di_luar_bidang
        complaint_data = {
            "nama_pengadu": "TEST_Parent Makanan",
            "hubungan": "ibu_bapa",
            "nombor_maktab": "M2024777",
            "nama_pelajar": "TEST_Pelajar Makanan",
            "tingkatan": 4,
            "asrama": "JC",
            "jenis_aduan": "makanan",
            "penerangan": "Aduan makanan untuk ujian persistence guideline",
            "tahap_keutamaan": "rendah"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/complaints",
            json=complaint_data,
            headers=self.parent_headers
        )
        complaint_id = create_response.json()["complaint"]["id"]
        
        # Update to di_luar_bidang
        requests.put(
            f"{BASE_URL}/api/complaints/{complaint_id}/status",
            json={"status": "di_luar_bidang"},
            headers=self.warden_headers
        )
        
        # Fetch complaint as parent
        fetch_response = requests.get(
            f"{BASE_URL}/api/complaints/{complaint_id}",
            headers=self.parent_headers
        )
        assert fetch_response.status_code == 200
        
        complaint = fetch_response.json()["complaint"]
        assert complaint["status"] == "di_luar_bidang"
        assert "guideline_reference" in complaint
        assert complaint["guideline_reference"]["title"] == "Panduan Makanan & Dewan Makan"
        
        print("PASS: guideline_reference persists on subsequent fetches")
    
    def test_my_complaints_shows_di_luar_bidang_with_guideline(self):
        """Test parent's my-complaints endpoint shows guideline for di_luar_bidang status"""
        # Fetch parent's complaints
        response = requests.get(
            f"{BASE_URL}/api/complaints/my-complaints?status=di_luar_bidang",
            headers=self.parent_headers
        )
        assert response.status_code == 200
        
        complaints = response.json()["complaints"]
        # Check that di_luar_bidang complaints have guideline_reference
        for complaint in complaints:
            if complaint["status"] == "di_luar_bidang":
                assert "guideline_reference" in complaint, f"Complaint {complaint['id']} missing guideline_reference"
        
        print(f"PASS: my-complaints endpoint returns {len(complaints)} di_luar_bidang complaints with guidelines")


class TestAdminStatusWorkflow:
    """Test admin/superadmin can also use di_luar_bidang status"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin"""
        admin_login = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@muafakat.link",
            "password": "admin123"
        })
        if admin_login.status_code == 200:
            self.admin_token = admin_login.json().get("access_token")
            self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
        else:
            pytest.skip("Admin login failed")
        
        # Parent login for creating complaints
        parent_login = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "parent@muafakat.link",
            "password": "parent123"
        })
        if parent_login.status_code == 200:
            self.parent_token = parent_login.json().get("access_token")
            self.parent_headers = {"Authorization": f"Bearer {self.parent_token}"}
    
    def test_admin_can_update_status_to_di_luar_bidang(self):
        """Test admin can also update complaint status to di_luar_bidang"""
        # Create complaint as parent
        complaint_data = {
            "nama_pengadu": "TEST_Admin Parent",
            "hubungan": "ibu_bapa",
            "nombor_maktab": "M2024666",
            "nama_pelajar": "TEST_Pelajar Admin",
            "tingkatan": 1,
            "asrama": "E",
            "jenis_aduan": "gangguan_pelajar",
            "penerangan": "Aduan gangguan pelajar untuk ujian admin status update",
            "tahap_keutamaan": "kritikal"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/complaints",
            json=complaint_data,
            headers=self.parent_headers
        )
        assert create_response.status_code == 200
        complaint_id = create_response.json()["complaint"]["id"]
        
        # Admin updates to di_luar_bidang
        status_update = {
            "status": "di_luar_bidang",
            "catatan": "Kes buli perlu dirujuk kepada Unit Disiplin"
        }
        
        update_response = requests.put(
            f"{BASE_URL}/api/complaints/{complaint_id}/status",
            json=status_update,
            headers=self.admin_headers
        )
        assert update_response.status_code == 200
        
        updated = update_response.json()["complaint"]
        assert updated["status"] == "di_luar_bidang"
        assert "guideline_reference" in updated
        assert updated["guideline_reference"]["title"] == "Panduan Menangani Gangguan/Buli"
        
        print("PASS: Admin can update status to di_luar_bidang with correct guideline")
    
    def test_admin_list_complaints_includes_di_luar_bidang(self):
        """Test admin's complaint list shows di_luar_bidang complaints"""
        response = requests.get(
            f"{BASE_URL}/api/complaints?status=di_luar_bidang",
            headers=self.admin_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "complaints" in data
        print(f"PASS: Admin list returns {len(data['complaints'])} di_luar_bidang complaints")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
