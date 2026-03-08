"""
Tests for Warden Schedule CRUD Operations
MRSMKU Smart360 - Warden Schedule Management Module
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN = {"email": "admin@muafakat.link", "password": "admin123"}


class TestAuth:
    """Authentication helpers"""
    
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


class TestWardenScheduleCRUD:
    """Warden Schedule CRUD API Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        self.token = TestAuth.get_token(**ADMIN)
        self.headers = TestAuth.get_auth_headers(self.token) if self.token else {}
        self.created_schedule_id = None
    
    def test_01_get_warden_list_for_dropdown(self):
        """Test getting warden list for schedule form dropdown"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = requests.get(f"{BASE_URL}/api/warden/list", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "wardens" in data
        assert "total" in data
        
        # Verify warden has required fields for dropdown
        if data["wardens"]:
            warden = data["wardens"][0]
            assert "id" in warden
            assert "full_name" in warden
            print(f"Found {data['total']} wardens for dropdown")
    
    def test_02_get_hostel_blocks_for_assignment(self):
        """Test getting hostel blocks for schedule form"""
        response = requests.get(f"{BASE_URL}/api/hostel-blocks/public")
        assert response.status_code == 200
        
        data = response.json()
        assert "blocks" in data
        
        # Verify 8 blocks available
        codes = [b["code"] for b in data["blocks"]]
        expected = ["E", "F", "G", "H", "I", "JA", "JB", "JC"]
        for code in expected:
            assert code in codes, f"Block {code} should be available"
        print(f"All 8 blocks available: {codes}")
    
    def test_03_create_schedule(self):
        """Test creating a new warden schedule"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        # Get a warden ID first
        wardens_response = requests.get(f"{BASE_URL}/api/warden/list", headers=self.headers)
        warden_id = wardens_response.json()["wardens"][0]["id"]
        
        # Create schedule with unique dates
        schedule_data = {
            "warden_id": warden_id,
            "tarikh_mula": "2026-03-01",
            "tarikh_tamat": "2026-03-05",
            "waktu_mula": "18:00",
            "waktu_tamat": "07:00",
            "blok_assigned": ["JA", "JB"],
            "catatan": "TEST_schedule created via pytest"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/warden/schedules",
            headers=self.headers,
            json=schedule_data
        )
        
        assert response.status_code == 200 or response.status_code == 201
        data = response.json()
        assert "schedule" in data
        
        schedule = data["schedule"]
        assert schedule["tarikh_mula"] == "2026-03-01"
        assert schedule["tarikh_tamat"] == "2026-03-05"
        assert schedule["blok_assigned"] == ["JA", "JB"]
        assert "id" in schedule
        
        # Store for cleanup
        TestWardenScheduleCRUD.created_schedule_id = schedule["id"]
        print(f"Created schedule: {schedule['id']}")
    
    def test_04_verify_schedule_in_list(self):
        """Test that created schedule appears in list"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = requests.get(
            f"{BASE_URL}/api/warden/schedules",
            params={"bulan": 3, "tahun": 2026},
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "schedules" in data
        
        # Find our test schedule
        found = False
        for schedule in data["schedules"]:
            if schedule.get("catatan") == "TEST_schedule created via pytest":
                found = True
                break
        
        assert found, "Created schedule should be in list"
        print(f"Found {len(data['schedules'])} schedules for March 2026")
    
    def test_05_verify_schedule_in_calendar(self):
        """Test that schedule appears in calendar view"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = requests.get(
            f"{BASE_URL}/api/warden/calendar",
            params={"bulan": 3, "tahun": 2026},
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "calendar" in data
        
        calendar = data["calendar"]
        assert calendar["bulan"] == 3
        assert calendar["tahun"] == 2026
        
        # Check days with wardens
        days_with_warden = [d for d in calendar["days"] if len(d["wardens"]) > 0]
        print(f"Days with warden in March 2026: {len(days_with_warden)}")
        
        # Our schedule should cover 1-5 March
        for day in calendar["days"]:
            if day["day_number"] in [1, 2, 3, 4, 5]:
                assert len(day["wardens"]) > 0, f"Day {day['day_number']} should have warden"
    
    def test_06_update_schedule(self):
        """Test updating an existing schedule"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        schedule_id = TestWardenScheduleCRUD.created_schedule_id
        if not schedule_id:
            pytest.skip("No schedule created to update")
        
        update_data = {
            "catatan": "TEST_schedule UPDATED via pytest",
            "blok_assigned": ["JA", "JB", "JC"]
        }
        
        response = requests.put(
            f"{BASE_URL}/api/warden/schedules/{schedule_id}",
            headers=self.headers,
            json=update_data
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "schedule" in data
        
        schedule = data["schedule"]
        assert schedule["catatan"] == "TEST_schedule UPDATED via pytest"
        assert "JC" in schedule["blok_assigned"]
        print(f"Updated schedule: {schedule_id}")
    
    def test_07_delete_schedule(self):
        """Test deleting a schedule"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        schedule_id = TestWardenScheduleCRUD.created_schedule_id
        if not schedule_id:
            pytest.skip("No schedule created to delete")
        
        response = requests.delete(
            f"{BASE_URL}/api/warden/schedules/{schedule_id}",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data
        print(f"Deleted schedule: {schedule_id}")
    
    def test_08_verify_schedule_deleted(self):
        """Test that deleted schedule no longer appears in list"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = requests.get(
            f"{BASE_URL}/api/warden/schedules",
            params={"bulan": 3, "tahun": 2026},
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify our test schedule is gone
        for schedule in data["schedules"]:
            assert schedule.get("catatan") != "TEST_schedule UPDATED via pytest"
        
        print("Verified schedule was deleted")
    
    def test_09_schedule_overlap_validation(self):
        """Test that overlapping schedules are rejected"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        # Get a warden ID
        wardens_response = requests.get(f"{BASE_URL}/api/warden/list", headers=self.headers)
        warden_id = wardens_response.json()["wardens"][0]["id"]
        
        # Create first schedule
        schedule1 = {
            "warden_id": warden_id,
            "tarikh_mula": "2026-04-01",
            "tarikh_tamat": "2026-04-05",
            "waktu_mula": "18:00",
            "waktu_tamat": "07:00",
            "blok_assigned": [],
            "catatan": "TEST_overlap_test_1"
        }
        
        response1 = requests.post(
            f"{BASE_URL}/api/warden/schedules",
            headers=self.headers,
            json=schedule1
        )
        assert response1.status_code in [200, 201]
        created_id = response1.json()["schedule"]["id"]
        
        # Try to create overlapping schedule
        schedule2 = {
            "warden_id": warden_id,
            "tarikh_mula": "2026-04-03",
            "tarikh_tamat": "2026-04-07",
            "waktu_mula": "18:00",
            "waktu_tamat": "07:00",
            "blok_assigned": [],
            "catatan": "TEST_overlap_test_2"
        }
        
        response2 = requests.post(
            f"{BASE_URL}/api/warden/schedules",
            headers=self.headers,
            json=schedule2
        )
        
        # Should be rejected (400 error)
        assert response2.status_code == 400
        print("Overlap validation working correctly")
        
        # Cleanup - delete first schedule
        requests.delete(f"{BASE_URL}/api/warden/schedules/{created_id}", headers=self.headers)
    
    def test_10_on_duty_warden_endpoint(self):
        """Test getting current on-duty wardens"""
        response = requests.get(f"{BASE_URL}/api/warden/on-duty")
        assert response.status_code == 200
        
        data = response.json()
        assert "wardens" in data
        assert "date" in data
        assert "day" in data
        
        # Day should be in Malay
        malay_days = ["Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu", "Ahad"]
        assert data["day"] in malay_days, f"Day '{data['day']}' should be in Malay"
        
        print(f"On-duty: {len(data['wardens'])} wardens on {data['date']} ({data['day']})")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
