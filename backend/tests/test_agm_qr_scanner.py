"""
AGM QR Scanner Feature Tests
Tests QR scanning functionality for attendance marking with fee status verification
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data
TEST_EVENT_ID = "698fe2e8d8c7a1c47014c7d3"
QR_CODE_PAID = "AGM-698fe2e8d8c7a1c47014c7d3-750812105777-f43e4d2b"  # Paid fees - Ahli
QR_CODE_UNPAID = "AGM-698fe2e8d8c7a1c47014c7d3-900612105666-b4d14711"  # Unpaid fees - Pemerhati


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestAGMEvents:
    """AGM Events endpoint tests"""
    
    def test_get_events_success(self, api_client):
        """Test fetching all AGM events"""
        response = api_client.get(f"{BASE_URL}/api/agm/events")
        assert response.status_code == 200
        
        data = response.json()
        assert "events" in data
        assert isinstance(data["events"], list)
        print(f"✓ Found {len(data['events'])} AGM events")
    
    def test_get_event_by_id(self, api_client):
        """Test fetching specific event by ID"""
        response = api_client.get(f"{BASE_URL}/api/agm/events/{TEST_EVENT_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert "event" in data
        assert data["event"]["id"] == TEST_EVENT_ID
        print(f"✓ Event found: {data['event'].get('nama_event')}")


class TestAGMAttendees:
    """AGM Attendees endpoint tests"""
    
    def test_get_attendees_for_event(self, api_client):
        """Test fetching all attendees for an event"""
        response = api_client.get(f"{BASE_URL}/api/agm/attendees/{TEST_EVENT_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert "attendees" in data
        assert isinstance(data["attendees"], list)
        print(f"✓ Found {len(data['attendees'])} attendees for event")


class TestQRScannerEndpoint:
    """QR Scanner POST /api/agm/attendees/scan tests"""
    
    def test_scan_paid_user_qr(self, api_client):
        """Test scanning QR for user with paid fees - should be Ahli Muafakat Aktif"""
        response = api_client.post(
            f"{BASE_URL}/api/agm/attendees/scan",
            params={"qr_code": QR_CODE_PAID}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["message"] == "Kehadiran berjaya direkodkan"
        assert "attendee" in data
        
        # Verify attendee data
        attendee = data["attendee"]
        assert attendee["qr_code"] == QR_CODE_PAID
        assert attendee["status_kehadiran"] == "Hadir"
        assert attendee["kategori_peserta"] == "Ahli"  # Paid user = Ahli (Aktif)
        assert attendee["status_yuran"] == "Sudah Bayar"
        
        # No fee alert for paid user
        assert data["fee_alert"] is None
        print(f"✓ Paid user scan: {attendee['nama_penuh']} marked as Ahli Muafakat Aktif")
    
    def test_scan_unpaid_user_qr(self, api_client):
        """Test scanning QR for user with unpaid fees - should be Ahli Muafakat Pemerhati"""
        response = api_client.post(
            f"{BASE_URL}/api/agm/attendees/scan",
            params={"qr_code": QR_CODE_UNPAID}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["message"] == "Kehadiran berjaya direkodkan"
        assert "attendee" in data
        
        # Verify attendee data
        attendee = data["attendee"]
        assert attendee["qr_code"] == QR_CODE_UNPAID
        assert attendee["status_kehadiran"] == "Hadir"
        assert attendee["kategori_peserta"] == "Pemerhati"  # Unpaid user = Pemerhati
        assert attendee["status_yuran"] == "Belum Bayar"
        
        # Fee alert should be present for unpaid user
        assert data["fee_alert"] is not None
        fee_alert = data["fee_alert"]
        assert "AMARAN" in fee_alert["message"]
        assert fee_alert["status"] == "Pemerhati sahaja"
        assert "anak_belum_bayar" in fee_alert
        assert isinstance(fee_alert["anak_belum_bayar"], list)
        print(f"✓ Unpaid user scan: {attendee['nama_penuh']} marked as Ahli Muafakat Pemerhati")
        print(f"  Fee alert: {fee_alert['message']}")
    
    def test_scan_invalid_qr_code(self, api_client):
        """Test scanning invalid QR code - should return 404"""
        response = api_client.post(
            f"{BASE_URL}/api/agm/attendees/scan",
            params={"qr_code": "INVALID-QR-CODE-12345"}
        )
        assert response.status_code == 404
        
        data = response.json()
        assert data["detail"] == "QR Code tidak sah"
        print("✓ Invalid QR code correctly returns 404")
    
    def test_scan_empty_qr_code(self, api_client):
        """Test scanning empty QR code"""
        response = api_client.post(
            f"{BASE_URL}/api/agm/attendees/scan",
            params={"qr_code": ""}
        )
        # Empty QR should return 404 (not found)
        assert response.status_code == 404
        print("✓ Empty QR code correctly rejected")
    
    def test_scan_returns_attendee_details(self, api_client):
        """Verify scan response includes all required attendee details"""
        response = api_client.post(
            f"{BASE_URL}/api/agm/attendees/scan",
            params={"qr_code": QR_CODE_PAID}
        )
        assert response.status_code == 200
        
        data = response.json()
        attendee = data["attendee"]
        
        # Check required fields
        required_fields = [
            "nama_penuh", "no_ic", "kategori_peserta", 
            "status_kehadiran", "status_yuran", "waktu_hadir"
        ]
        for field in required_fields:
            assert field in attendee, f"Missing field: {field}"
        
        # Verify waktu_hadir is set
        assert attendee["waktu_hadir"] is not None
        print(f"✓ All required attendee fields present in scan response")


class TestAGMReports:
    """AGM Reports endpoint tests"""
    
    def test_get_event_report(self, api_client):
        """Test fetching event report"""
        response = api_client.get(f"{BASE_URL}/api/agm/reports/{TEST_EVENT_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert "report" in data
        report = data["report"]
        
        # Check report structure
        assert "ringkasan_kehadiran" in report
        assert "statistik_yuran" in report
        assert "quorum" in report
        
        # Verify attendance stats
        kehadiran = report["ringkasan_kehadiran"]
        assert "jumlah_didaftarkan" in kehadiran
        assert "jumlah_hadir" in kehadiran
        
        # Verify fee stats include pemerhati count
        yuran = report["statistik_yuran"]
        assert "pemerhati" in yuran
        
        print(f"✓ Report: {kehadiran['jumlah_hadir']}/{kehadiran['jumlah_didaftarkan']} attended")
        print(f"  Pemerhati count: {yuran['pemerhati']}")


class TestCreateNewAttendee:
    """Test creating new attendee (for testing fresh QR scan)"""
    
    def test_register_new_attendee_with_qr(self, api_client):
        """Test registering a new attendee generates QR code"""
        unique_id = uuid.uuid4().hex[:8]
        new_attendee = {
            "event_id": TEST_EVENT_ID,
            "nama_penuh": f"TEST_Peserta_{unique_id}",
            "no_ic": f"TEST{unique_id}",
            "email": f"test_{unique_id}@test.com",
            "no_telefon": "0123456789",
            "jantina": "Lelaki",
            "negeri": "Selangor",
            "kategori_peserta": "Ahli",
            "status_yuran": "Sudah Bayar"
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/agm/attendees",
            json=new_attendee
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "attendee" in data
        attendee = data["attendee"]
        
        # Verify QR code was generated
        assert "qr_code" in attendee
        assert attendee["qr_code"].startswith("AGM-")
        assert "qr_code_image" in attendee
        assert len(attendee["qr_code_image"]) > 0  # Base64 image
        
        print(f"✓ New attendee registered with QR: {attendee['qr_code']}")
        
        # Test scanning the new QR code
        scan_response = api_client.post(
            f"{BASE_URL}/api/agm/attendees/scan",
            params={"qr_code": attendee["qr_code"]}
        )
        assert scan_response.status_code == 200
        scan_data = scan_response.json()
        assert scan_data["attendee"]["status_kehadiran"] == "Hadir"
        print(f"✓ New attendee QR scan works - marked as Hadir")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
