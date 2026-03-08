"""
Tests for Digital Complaint System, Warden Management, and Hostel Blocks modules
MRSMKU Smart360 - Phase 9
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPERADMIN = {"email": "superadmin@muafakat.link", "password": "super123"}
ADMIN = {"email": "admin@muafakat.link", "password": "admin123"}
WARDEN = {"email": "warden@muafakat.link", "password": "warden123"}


class TestAuth:
    """Authentication helpers for test suite"""
    
    @staticmethod
    def get_token(email, password):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        return None
    
    @staticmethod
    def get_auth_headers(token):
        """Get headers with auth token"""
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }


class TestHostelBlocks:
    """Hostel Blocks API Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        self.token = TestAuth.get_token(**ADMIN)
        if not self.token:
            self.token = TestAuth.get_token(**SUPERADMIN)
        self.headers = TestAuth.get_auth_headers(self.token) if self.token else {}
    
    def test_list_hostel_blocks(self):
        """Test listing all hostel blocks"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = requests.get(f"{BASE_URL}/api/hostel-blocks", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "blocks" in data, "Response should contain 'blocks' key"
        assert "total" in data, "Response should contain 'total' key"
        
        # Verify blocks have required fields
        if data["blocks"]:
            block = data["blocks"][0]
            assert "id" in block
            assert "code" in block
            assert "name" in block
            assert "gender" in block
            assert "gender_display" in block
            print(f"Found {data['total']} hostel blocks")
    
    def test_get_public_blocks(self):
        """Test public endpoint for hostel blocks (no auth required)"""
        response = requests.get(f"{BASE_URL}/api/hostel-blocks/public")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "blocks" in data
        
        # Verify all 8 blocks are seeded
        if data["blocks"]:
            codes = [b["code"] for b in data["blocks"]]
            expected_codes = ["E", "F", "G", "H", "I", "JA", "JB", "JC"]
            for code in expected_codes:
                assert code in codes, f"Expected block {code} in seeded blocks"
            print(f"All 8 hostel blocks verified: {codes}")
    
    def test_hostel_blocks_stats(self):
        """Test hostel blocks statistics endpoint"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = requests.get(f"{BASE_URL}/api/hostel-blocks/stats/overview", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "blocks" in data or "summary" in data
        print(f"Hostel stats retrieved: {data}")
    
    def test_filter_blocks_by_gender(self):
        """Test filtering blocks by gender"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        # Filter for male blocks
        response = requests.get(f"{BASE_URL}/api/hostel-blocks?gender=lelaki", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        for block in data.get("blocks", []):
            assert block["gender"] == "lelaki", f"Block {block['code']} should be male"
        
        # Filter for female blocks
        response = requests.get(f"{BASE_URL}/api/hostel-blocks?gender=perempuan", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        for block in data.get("blocks", []):
            assert block["gender"] == "perempuan", f"Block {block['code']} should be female"


class TestComplaints:
    """Complaints API Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        self.admin_token = TestAuth.get_token(**ADMIN)
        self.superadmin_token = TestAuth.get_token(**SUPERADMIN)
        self.token = self.admin_token or self.superadmin_token
        self.headers = TestAuth.get_auth_headers(self.token) if self.token else {}
    
    def test_get_complaint_types(self):
        """Test getting complaint types (public endpoint)"""
        response = requests.get(f"{BASE_URL}/api/complaints/types")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "types" in data, "Should have complaint types"
        assert "priorities" in data, "Should have priorities"
        assert "statuses" in data, "Should have statuses"
        
        # Verify expected complaint types
        types = data["types"]
        expected_types = ["disiplin", "keselamatan", "kebajikan", "fasiliti_rosak", "makanan", "gangguan_pelajar", "lain_lain"]
        for t in expected_types:
            assert t in types, f"Expected type {t} in complaint types"
        print(f"Complaint types verified: {list(types.keys())}")
    
    def test_list_complaints_admin(self):
        """Test listing complaints as admin"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = requests.get(f"{BASE_URL}/api/complaints", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "complaints" in data, "Response should have 'complaints' key"
        assert "pagination" in data, "Response should have 'pagination' key"
        
        pagination = data["pagination"]
        assert "page" in pagination
        assert "total" in pagination
        print(f"Found {pagination['total']} complaints")
    
    def test_complaints_dashboard_stats(self):
        """Test complaint dashboard statistics"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = requests.get(f"{BASE_URL}/api/complaints/dashboard/stats", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "stats" in data
        stats = data["stats"]
        
        # Verify expected stat keys
        expected_keys = ["jumlah_hari_ini", "aduan_kritikal", "aduan_belum_selesai"]
        for key in expected_keys:
            assert key in stats, f"Expected key {key} in stats"
        print(f"Dashboard stats: {stats}")
    
    def test_create_and_list_complaint(self):
        """Test creating a complaint and verifying it in list"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        # Create complaint data
        complaint_data = {
            "nama_pengadu": "TEST_Pengadu",
            "hubungan": "ibu_bapa",
            "nombor_maktab": "TEST123",
            "nama_pelajar": "TEST_Pelajar",
            "tingkatan": 3,
            "asrama": "JA",
            "jenis_aduan": "kebajikan",
            "penerangan": "TEST aduan untuk tujuan ujian automatik - sila abaikan",
            "tahap_keutamaan": "sederhana"
        }
        
        # Create complaint
        response = requests.post(f"{BASE_URL}/api/complaints", 
                                headers=self.headers, 
                                json=complaint_data)
        
        # Note: May fail if user doesn't have permission to create complaints
        if response.status_code == 201 or response.status_code == 200:
            data = response.json()
            assert "complaint" in data
            complaint = data["complaint"]
            assert complaint["nama_pelajar"] == "TEST_Pelajar"
            assert complaint["jenis_aduan"] == "kebajikan"
            assert "nombor_aduan" in complaint
            print(f"Created complaint: {complaint['nombor_aduan']}")
            
            # Now list and verify
            list_response = requests.get(f"{BASE_URL}/api/complaints?search=TEST_Pelajar", 
                                        headers=self.headers)
            assert list_response.status_code == 200
            list_data = list_response.json()
            
            # Find our created complaint
            found = False
            for c in list_data.get("complaints", []):
                if c.get("nombor_aduan") == complaint["nombor_aduan"]:
                    found = True
                    break
            assert found, "Created complaint should be in the list"
        else:
            # Admin may not have permission to create - check if endpoint exists
            assert response.status_code in [401, 403, 422], f"Unexpected status: {response.status_code}"
            print(f"Create complaint not permitted for this user: {response.status_code}")
    
    def test_filter_complaints_by_status(self):
        """Test filtering complaints by status"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        # Test each status filter
        statuses = ["baru_dihantar", "diterima_warden", "dalam_siasatan", "dalam_tindakan", 
                   "menunggu_maklum_balas", "selesai", "ditutup"]
        
        for status in statuses:
            response = requests.get(f"{BASE_URL}/api/complaints?status={status}", headers=self.headers)
            assert response.status_code == 200, f"Filter by status {status} failed"
        
        print("All status filters working")


class TestWardenManagement:
    """Warden Management API Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        self.admin_token = TestAuth.get_token(**ADMIN)
        self.superadmin_token = TestAuth.get_token(**SUPERADMIN)
        self.token = self.admin_token or self.superadmin_token
        self.headers = TestAuth.get_auth_headers(self.token) if self.token else {}
    
    def test_get_on_duty_wardens(self):
        """Test getting current duty wardens (public endpoint)"""
        response = requests.get(f"{BASE_URL}/api/warden/on-duty")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "wardens" in data, "Response should have 'wardens' key"
        assert "date" in data, "Response should have 'date' key"
        assert "day" in data, "Response should have 'day' key (Malay day name)"
        print(f"On-duty wardens for {data['date']} ({data['day']}): {len(data['wardens'])} wardens")
    
    def test_get_on_duty_warden_for_block(self):
        """Test getting duty warden for specific block"""
        # Test for JA block
        response = requests.get(f"{BASE_URL}/api/warden/on-duty/block/JA")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Either warden exists or message says none scheduled
        assert "warden" in data or "message" in data
        print(f"Duty warden for block JA: {data}")
    
    def test_list_warden_schedules(self):
        """Test listing warden schedules"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = requests.get(f"{BASE_URL}/api/warden/schedules", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "schedules" in data
        assert "total" in data
        print(f"Found {data['total']} warden schedules")
    
    def test_list_wardens(self):
        """Test listing all wardens"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = requests.get(f"{BASE_URL}/api/warden/list", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "wardens" in data
        assert "total" in data
        print(f"Found {data['total']} wardens")
    
    def test_warden_calendar_view(self):
        """Test warden calendar view endpoint"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        import datetime
        now = datetime.datetime.now()
        
        response = requests.get(
            f"{BASE_URL}/api/warden/calendar",
            params={"bulan": now.month, "tahun": now.year},
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "calendar" in data
        calendar = data["calendar"]
        
        assert "bulan" in calendar
        assert "tahun" in calendar
        assert "days" in calendar
        
        # Verify days structure
        assert len(calendar["days"]) > 0, "Calendar should have days"
        first_day = calendar["days"][0]
        assert "tarikh" in first_day
        assert "hari" in first_day
        assert "wardens" in first_day
        
        print(f"Calendar for {calendar['bulan_name']} {calendar['tahun']}: {len(calendar['days'])} days")
    
    def test_schedule_filtering_by_month(self):
        """Test filtering schedules by month and year"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        import datetime
        now = datetime.datetime.now()
        
        response = requests.get(
            f"{BASE_URL}/api/warden/schedules",
            params={"bulan": now.month, "tahun": now.year},
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "schedules" in data
        print(f"Schedules for {now.month}/{now.year}: {len(data['schedules'])} schedules")


class TestIntegration:
    """Integration tests between modules"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        self.admin_token = TestAuth.get_token(**ADMIN)
        self.superadmin_token = TestAuth.get_token(**SUPERADMIN)
        self.token = self.admin_token or self.superadmin_token
        self.headers = TestAuth.get_auth_headers(self.token) if self.token else {}
    
    def test_hostel_blocks_with_warden_list(self):
        """Test that hostel blocks can retrieve warden list for assignment"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        # Get blocks
        blocks_response = requests.get(f"{BASE_URL}/api/hostel-blocks", headers=self.headers)
        assert blocks_response.status_code == 200
        
        # Get wardens
        wardens_response = requests.get(f"{BASE_URL}/api/warden/list", headers=self.headers)
        assert wardens_response.status_code == 200
        
        blocks_data = blocks_response.json()
        wardens_data = wardens_response.json()
        
        print(f"Integration: {len(blocks_data.get('blocks', []))} blocks can be assigned to {len(wardens_data.get('wardens', []))} wardens")
    
    def test_complaint_status_workflow(self):
        """Test complaint status workflow"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        # Get existing complaints
        response = requests.get(f"{BASE_URL}/api/complaints", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        complaints = data.get("complaints", [])
        
        if complaints:
            complaint = complaints[0]
            complaint_id = complaint["id"]
            current_status = complaint["status"]
            
            # Get complaint detail
            detail_response = requests.get(f"{BASE_URL}/api/complaints/{complaint_id}", headers=self.headers)
            assert detail_response.status_code == 200
            
            detail_data = detail_response.json()
            assert "complaint" in detail_data
            
            # Verify audit log exists
            complaint_detail = detail_data["complaint"]
            assert "audit_log" in complaint_detail
            
            print(f"Complaint {complaint['nombor_aduan']}: status={current_status}, audit_entries={len(complaint_detail['audit_log'])}")
        else:
            print("No complaints to test status workflow")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
