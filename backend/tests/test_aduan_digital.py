"""
Test suite for Aduan Digital module - MRSMKU Smart360
Tests: Parent dashboard warden display, Complaint submission, Warden complaint management
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://yuran-admin-panel.preview.emergentagent.com').rstrip('/')

# Test credentials
PARENT_EMAIL = "parent@muafakat.link"
PARENT_PASSWORD = "parent123"
WARDEN_EMAIL = "warden@muafakat.link"
WARDEN_PASSWORD = "warden123"
ADMIN_EMAIL = "admin@muafakat.link"
ADMIN_PASSWORD = "admin123"


class TestWardenOnDuty:
    """Test warden on-duty endpoint for parent dashboard display"""
    
    def test_get_wardens_on_duty_public(self):
        """Test public endpoint for warden on-duty - Returns current duty wardens"""
        response = requests.get(f"{BASE_URL}/api/warden/on-duty")
        assert response.status_code == 200
        
        data = response.json()
        assert "date" in data
        assert "day" in data
        assert "wardens" in data
        assert isinstance(data["wardens"], list)
        
        # Verify warden info contains required fields for parent dashboard
        if len(data["wardens"]) > 0:
            warden = data["wardens"][0]
            assert "warden_name" in warden
            assert "warden_phone" in warden
            assert "warden_email" in warden
            assert "blok_assigned" in warden
            assert "jawatan_display" in warden
            print(f"SUCCESS: Warden on duty - {warden['warden_name']}, Phone: {warden['warden_phone']}, Blocks: {warden['blok_assigned']}")
        else:
            print("INFO: No wardens on duty today")
    
    def test_get_warden_for_specific_block(self):
        """Test getting duty warden for a specific block"""
        # Test for block JA
        response = requests.get(f"{BASE_URL}/api/warden/on-duty/block/JA")
        assert response.status_code == 200
        
        data = response.json()
        assert "warden" in data or "message" in data
        print(f"Block JA warden query result: {data}")


class TestComplaintWorkflow:
    """Test full complaint workflow: submission by parent, management by warden"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth tokens for parent and warden"""
        # Parent login
        parent_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARENT_EMAIL,
            "password": PARENT_PASSWORD
        })
        if parent_response.status_code == 200:
            self.parent_token = parent_response.json()["access_token"]
            self.parent_user = parent_response.json()["user"]
        else:
            pytest.skip(f"Parent login failed: {parent_response.text}")
        
        # Warden login
        warden_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": WARDEN_EMAIL,
            "password": WARDEN_PASSWORD
        })
        if warden_response.status_code == 200:
            self.warden_token = warden_response.json()["access_token"]
            self.warden_user = warden_response.json()["user"]
        else:
            pytest.skip(f"Warden login failed: {warden_response.text}")
    
    def test_get_complaint_types(self):
        """Test getting available complaint types"""
        response = requests.get(f"{BASE_URL}/api/complaints/types")
        assert response.status_code == 200
        
        data = response.json()
        assert "types" in data
        assert "priorities" in data
        assert "statuses" in data
        
        # Verify expected types exist
        expected_types = ["disiplin", "keselamatan", "kebajikan", "fasiliti_rosak", "makanan"]
        for t in expected_types:
            assert t in data["types"], f"Missing complaint type: {t}"
        
        print(f"Complaint types: {list(data['types'].keys())}")
    
    def test_get_hostel_blocks_for_form(self):
        """Test getting hostel blocks for complaint form dropdown"""
        response = requests.get(f"{BASE_URL}/api/hostel-blocks/public")
        assert response.status_code == 200
        
        data = response.json()
        assert "blocks" in data
        assert len(data["blocks"]) > 0
        
        # Verify block has required fields
        block = data["blocks"][0]
        assert "code" in block
        assert "name" in block
        print(f"Available blocks: {[b['code'] for b in data['blocks']]}")
    
    def test_parent_submit_complaint(self):
        """Test parent submitting a new complaint"""
        headers = {"Authorization": f"Bearer {self.parent_token}"}
        
        complaint_data = {
            "nama_pengadu": self.parent_user["full_name"],
            "hubungan": "ibu_bapa",
            "nombor_maktab": "M2024TEST001",
            "nama_pelajar": "TEST_Pelajar Aduan",
            "tingkatan": 3,
            "asrama": "JA",
            "jenis_aduan": "disiplin",
            "penerangan": "Ini adalah aduan ujian untuk modul Aduan Digital - pelajar didapati tidak mengikut peraturan asrama",
            "gambar_sokongan": [],
            "tahap_keutamaan": "sederhana"
        }
        
        response = requests.post(f"{BASE_URL}/api/complaints", json=complaint_data, headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "complaint" in data
        complaint = data["complaint"]
        
        # Verify complaint was created with correct data
        assert complaint["nama_pelajar"] == "TEST_Pelajar Aduan"
        assert complaint["jenis_aduan"] == "disiplin"
        assert complaint["status"] == "baru_dihantar"
        assert "nombor_aduan" in complaint
        assert complaint["nombor_aduan"].startswith("ADU-")
        
        # Verify auto-assignment to warden
        print(f"SUCCESS: Complaint created - {complaint['nombor_aduan']}")
        print(f"Assigned warden: {complaint.get('warden_name', 'Not assigned')}")
        
        # Store complaint ID for subsequent tests
        self.__class__.test_complaint_id = complaint["id"]
        self.__class__.test_complaint_number = complaint["nombor_aduan"]
    
    def test_parent_view_own_complaints(self):
        """Test parent viewing their own complaints"""
        headers = {"Authorization": f"Bearer {self.parent_token}"}
        
        response = requests.get(f"{BASE_URL}/api/complaints/my-complaints", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "complaints" in data
        assert "pagination" in data
        
        # Should have at least the complaint we just created
        print(f"Parent has {len(data['complaints'])} complaints")
    
    def test_warden_view_assigned_complaints(self):
        """Test warden viewing complaints assigned to them"""
        headers = {"Authorization": f"Bearer {self.warden_token}"}
        
        response = requests.get(f"{BASE_URL}/api/complaints", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "complaints" in data
        print(f"Warden has {len(data['complaints'])} assigned complaints")
    
    def test_warden_update_complaint_status(self):
        """Test warden updating complaint status"""
        if not hasattr(self.__class__, 'test_complaint_id'):
            pytest.skip("No test complaint created")
        
        headers = {"Authorization": f"Bearer {self.warden_token}"}
        
        # Update status to 'diterima_warden'
        status_update = {
            "status": "diterima_warden",
            "catatan": "Aduan diterima dan akan disiasat"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/complaints/{self.__class__.test_complaint_id}/status",
            json=status_update,
            headers=headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["complaint"]["status"] == "diterima_warden"
        print(f"SUCCESS: Status updated to 'diterima_warden'")
    
    def test_warden_add_action_to_complaint(self):
        """Test warden adding action/tindakan to complaint"""
        if not hasattr(self.__class__, 'test_complaint_id'):
            pytest.skip("No test complaint created")
        
        headers = {"Authorization": f"Bearer {self.warden_token}"}
        
        action_data = {
            "tindakan": "Telah memanggil pelajar untuk sesi kaunseling dan perbincangan mengenai peraturan asrama",
            "respon_kepada_ibubapa": "Terima kasih atas aduan. Pihak kami telah mengambil tindakan awal dengan memanggil pelajar untuk sesi kaunseling."
        }
        
        response = requests.post(
            f"{BASE_URL}/api/complaints/{self.__class__.test_complaint_id}/action",
            json=action_data,
            headers=headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "tindakan_list" in data["complaint"]
        assert len(data["complaint"]["tindakan_list"]) > 0
        print(f"SUCCESS: Action added to complaint")
    
    def test_get_complaint_detail(self):
        """Test getting full complaint detail with audit log and actions"""
        if not hasattr(self.__class__, 'test_complaint_id'):
            pytest.skip("No test complaint created")
        
        headers = {"Authorization": f"Bearer {self.warden_token}"}
        
        response = requests.get(
            f"{BASE_URL}/api/complaints/{self.__class__.test_complaint_id}",
            headers=headers
        )
        assert response.status_code == 200
        
        data = response.json()
        complaint = data["complaint"]
        
        # Verify detail fields
        assert "audit_log" in complaint
        assert "tindakan_list" in complaint
        assert len(complaint["audit_log"]) >= 1  # At least creation entry
        
        print(f"Complaint detail: {complaint['nombor_aduan']}")
        print(f"Audit log entries: {len(complaint['audit_log'])}")
        print(f"Actions taken: {len(complaint['tindakan_list'])}")
    
    def test_get_dashboard_stats(self):
        """Test getting complaint dashboard statistics"""
        headers = {"Authorization": f"Bearer {self.warden_token}"}
        
        response = requests.get(f"{BASE_URL}/api/complaints/dashboard/stats", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        stats = data["stats"]
        
        assert "jumlah_hari_ini" in stats
        assert "aduan_kritikal" in stats
        assert "aduan_belum_selesai" in stats
        
        print(f"Dashboard stats - Today: {stats['jumlah_hari_ini']}, Critical: {stats['aduan_kritikal']}, Pending: {stats['aduan_belum_selesai']}")


class TestComplaintFiltering:
    """Test complaint filtering and search"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        # Warden login
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": WARDEN_EMAIL,
            "password": WARDEN_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
        else:
            pytest.skip("Warden login failed")
    
    def test_filter_by_status(self):
        """Test filtering complaints by status"""
        headers = {"Authorization": f"Bearer {self.token}"}
        
        response = requests.get(
            f"{BASE_URL}/api/complaints",
            params={"status": "baru_dihantar"},
            headers=headers
        )
        assert response.status_code == 200
        print(f"Complaints with status 'baru_dihantar': {len(response.json()['complaints'])}")
    
    def test_filter_by_priority(self):
        """Test filtering complaints by priority"""
        headers = {"Authorization": f"Bearer {self.token}"}
        
        response = requests.get(
            f"{BASE_URL}/api/complaints",
            params={"tahap_keutamaan": "kritikal"},
            headers=headers
        )
        assert response.status_code == 200
        print(f"Critical complaints: {len(response.json()['complaints'])}")
    
    def test_filter_by_type(self):
        """Test filtering complaints by type"""
        headers = {"Authorization": f"Bearer {self.token}"}
        
        response = requests.get(
            f"{BASE_URL}/api/complaints",
            params={"jenis_aduan": "disiplin"},
            headers=headers
        )
        assert response.status_code == 200
        print(f"Disiplin complaints: {len(response.json()['complaints'])}")


class TestParentDashboard:
    """Test parent dashboard endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARENT_EMAIL,
            "password": PARENT_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
        else:
            pytest.skip("Parent login failed")
    
    def test_parent_dashboard_stats(self):
        """Test parent dashboard statistics endpoint"""
        headers = {"Authorization": f"Bearer {self.token}"}
        
        response = requests.get(f"{BASE_URL}/api/dashboard/parent", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        # Verify expected fields for parent dashboard
        assert "total_children" in data or "message" in data
        print(f"Parent dashboard data: {data}")


# Cleanup test data
class TestCleanup:
    """Cleanup test complaints created during testing"""
    
    def test_cleanup_test_complaints(self):
        """Delete test complaints (admin only)"""
        # Login as admin
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Admin login failed - cannot cleanup")
        
        token = response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get all complaints and find test ones
        response = requests.get(f"{BASE_URL}/api/complaints", headers=headers)
        if response.status_code == 200:
            complaints = response.json()["complaints"]
            test_complaints = [c for c in complaints if "TEST_" in c.get("nama_pelajar", "")]
            print(f"Found {len(test_complaints)} test complaints to cleanup")
            # Note: Actual deletion would require a delete endpoint - leaving as-is
