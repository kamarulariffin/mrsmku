"""
Test Student Import Module - Phase 2 Smart Import & Claim Code System
Tests: Template download, Excel upload, Claim codes CRUD, PDF slip generation, Stats
"""
import pytest
import requests
import os
import io
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPERADMIN = {"email": "superadmin@muafakat.link", "password": "admin123"}
PARENT = {"email": "parent@muafakat.link", "password": "parent123"}


class TestAuth:
    """Authentication helper tests"""
    
    def test_superadmin_login(self):
        """Test superadmin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERADMIN)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "superadmin"
        print(f"✅ SuperAdmin login successful, token received")
        return data["access_token"]
    
    def test_parent_login(self):
        """Test parent login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=PARENT)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "parent"
        print(f"✅ Parent login successful, token received")
        return data["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERADMIN)
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("SuperAdmin authentication failed")


@pytest.fixture(scope="module")
def parent_token():
    """Get parent authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=PARENT)
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Parent authentication failed")


class TestStudentImportTemplate:
    """Test Excel template download"""
    
    def test_download_template(self, admin_token):
        """Test downloading Excel template for student import"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/student-import/template", headers=headers)
        
        assert response.status_code == 200, f"Template download failed: {response.text}"
        
        # Check content type
        content_type = response.headers.get('content-type', '')
        assert 'spreadsheet' in content_type or 'excel' in content_type, f"Invalid content type: {content_type}"
        
        # Check content disposition
        content_disp = response.headers.get('content-disposition', '')
        assert 'Template_Import_Pelajar.xlsx' in content_disp, f"Invalid filename: {content_disp}"
        
        # Check file size is reasonable (should have some content)
        content_length = len(response.content)
        assert content_length > 1000, f"Template file too small: {content_length} bytes"
        
        print(f"✅ Template downloaded successfully, size: {content_length} bytes")


class TestClaimCodesAPI:
    """Test Claim Codes listing and filtering"""
    
    def test_get_claim_codes_list(self, admin_token):
        """Test getting list of claim codes"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/student-import/claim-codes", headers=headers)
        
        assert response.status_code == 200, f"Get claim codes failed: {response.text}"
        
        data = response.json()
        assert "claim_codes" in data, "Missing claim_codes array"
        assert "stats" in data, "Missing stats object"
        assert "pagination" in data, "Missing pagination object"
        
        # Verify stats structure
        stats = data["stats"]
        assert "total" in stats
        assert "pending" in stats
        assert "claimed" in stats
        
        # Verify pagination structure
        pagination = data["pagination"]
        assert "page" in pagination
        assert "limit" in pagination
        assert "total" in pagination
        assert "total_pages" in pagination
        
        print(f"✅ Claim codes list retrieved: {stats['total']} total, {stats['pending']} pending")
        return data
    
    def test_get_claim_codes_with_pagination(self, admin_token):
        """Test claim codes pagination"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/student-import/claim-codes?page=1&limit=5", 
            headers=headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Should return at most 5 items
        assert len(data["claim_codes"]) <= 5
        assert data["pagination"]["limit"] == 5
        
        print(f"✅ Pagination works: {len(data['claim_codes'])} items returned")
    
    def test_get_claim_codes_with_status_filter(self, admin_token):
        """Test claim codes filtering by status"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/student-import/claim-codes?status=pending", 
            headers=headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # All returned items should have pending status
        for cc in data["claim_codes"]:
            assert cc["status"] == "pending", f"Expected pending, got {cc['status']}"
        
        print(f"✅ Status filter works: {len(data['claim_codes'])} pending items")
    
    def test_get_claim_codes_with_search(self, admin_token):
        """Test claim codes search functionality"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First get any existing claim code
        response = requests.get(f"{BASE_URL}/api/student-import/claim-codes", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        if data["claim_codes"]:
            # Search using first claim code
            search_code = data["claim_codes"][0]["claim_code"][:4]  # Use first 4 chars
            
            response = requests.get(
                f"{BASE_URL}/api/student-import/claim-codes?search={search_code}", 
                headers=headers
            )
            assert response.status_code == 200
            search_data = response.json()
            
            # Should find at least one result
            assert len(search_data["claim_codes"]) >= 1
            print(f"✅ Search works: found {len(search_data['claim_codes'])} results for '{search_code}'")
        else:
            print("⚠️ No claim codes in database, skipping search test")


class TestClaimCodesExport:
    """Test Claim Codes Excel export"""
    
    def test_export_claim_codes(self, admin_token):
        """Test exporting claim codes to Excel"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/student-import/claim-codes/export", 
            headers=headers
        )
        
        assert response.status_code == 200, f"Export failed: {response.text}"
        
        # Check content type
        content_type = response.headers.get('content-type', '')
        assert 'spreadsheet' in content_type or 'excel' in content_type
        
        # Check filename
        content_disp = response.headers.get('content-disposition', '')
        assert 'Claim_Codes' in content_disp
        
        print(f"✅ Export successful, file size: {len(response.content)} bytes")
    
    def test_export_with_filter(self, admin_token):
        """Test exporting with status filter"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/student-import/claim-codes/export?status=pending", 
            headers=headers
        )
        
        assert response.status_code == 200
        print(f"✅ Filtered export successful")


class TestClaimSlipPDF:
    """Test PDF claim slip generation"""
    
    def test_generate_slip_for_valid_code(self, admin_token):
        """Test generating PDF slip for valid claim code"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First get a claim code from the list
        response = requests.get(f"{BASE_URL}/api/student-import/claim-codes", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        if not data["claim_codes"]:
            pytest.skip("No claim codes available for testing")
        
        claim_code = data["claim_codes"][0]["claim_code"]
        
        # Generate PDF slip
        portal_url = "https://yuran-admin-panel.preview.emergentagent.com"
        response = requests.get(
            f"{BASE_URL}/api/student-import/claim-codes/{claim_code}/slip?portal_url={portal_url}"
        )
        
        assert response.status_code == 200, f"PDF generation failed: {response.text}"
        
        # Check content type is PDF
        content_type = response.headers.get('content-type', '')
        assert 'pdf' in content_type.lower(), f"Expected PDF, got: {content_type}"
        
        # Check content disposition has claim code
        content_disp = response.headers.get('content-disposition', '')
        assert claim_code in content_disp, f"Filename should contain claim code: {content_disp}"
        
        # Check PDF content starts with %PDF
        assert response.content[:4] == b'%PDF', "Invalid PDF content"
        
        print(f"✅ PDF slip generated for {claim_code}, size: {len(response.content)} bytes")
    
    def test_slip_for_invalid_code(self):
        """Test slip generation with invalid claim code"""
        response = requests.get(
            f"{BASE_URL}/api/student-import/claim-codes/INVALID999/slip"
        )
        
        assert response.status_code == 404, f"Expected 404, got: {response.status_code}"
        print(f"✅ Invalid code correctly returns 404")


class TestImportStats:
    """Test import statistics endpoint"""
    
    def test_get_stats(self, admin_token):
        """Test getting import statistics"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/student-import/stats", headers=headers)
        
        assert response.status_code == 200, f"Stats failed: {response.text}"
        
        data = response.json()
        
        # Verify students stats
        assert "students" in data
        assert "total" in data["students"]
        assert "with_parent" in data["students"]
        assert "without_parent" in data["students"]
        
        # Verify claim codes stats
        assert "claim_codes" in data
        assert "total" in data["claim_codes"]
        assert "pending" in data["claim_codes"]
        assert "claimed" in data["claim_codes"]
        
        # Verify by_tingkatan breakdown
        assert "by_tingkatan" in data
        
        print(f"✅ Stats retrieved: {data['students']['total']} students, {data['claim_codes']['total']} claim codes")
        return data


class TestClaimStudent:
    """Test student claiming functionality"""
    
    def test_claim_with_valid_code(self, admin_token):
        """Test claiming student with valid code (public endpoint)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get a pending claim code
        response = requests.get(
            f"{BASE_URL}/api/student-import/claim-codes?status=pending", 
            headers=headers
        )
        data = response.json()
        
        if not data["claim_codes"]:
            pytest.skip("No pending claim codes available")
        
        claim_code = data["claim_codes"][0]["claim_code"]
        
        # Test claim (public endpoint - just validates code exists)
        response = requests.post(
            f"{BASE_URL}/api/student-import/claim",
            json={"claim_code": claim_code}
        )
        
        assert response.status_code == 200, f"Claim failed: {response.text}"
        result = response.json()
        
        assert result["success"] == True
        assert "student" in result
        assert "full_name" in result["student"]
        assert "matric_number" in result["student"]
        
        print(f"✅ Claim validation successful for {claim_code}, student: {result['student']['full_name']}")
    
    def test_claim_with_invalid_code(self):
        """Test claiming with invalid code"""
        response = requests.post(
            f"{BASE_URL}/api/student-import/claim",
            json={"claim_code": "INVALID999"}
        )
        
        assert response.status_code == 404
        print(f"✅ Invalid code correctly rejected with 404")
    
    def test_claim_authenticated(self, parent_token, admin_token):
        """Test authenticated claim endpoint"""
        # Get parent user ID
        parent_response = requests.get(
            f"{BASE_URL}/api/auth/me", 
            headers={"Authorization": f"Bearer {parent_token}"}
        )
        
        if parent_response.status_code != 200:
            pytest.skip("Could not get parent user info")
        
        parent_id = parent_response.json().get("id")
        
        # Get a pending claim code
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/student-import/claim-codes?status=pending", 
            headers=admin_headers
        )
        data = response.json()
        
        if not data["claim_codes"]:
            pytest.skip("No pending claim codes available for authenticated claim test")
        
        claim_code = data["claim_codes"][0]["claim_code"]
        
        # Test authenticated claim
        response = requests.post(
            f"{BASE_URL}/api/student-import/claim-authenticated",
            json={
                "claim_code": claim_code,
                "parent_id": parent_id
            }
        )
        
        # Either success or already claimed
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 200:
            result = response.json()
            assert result["success"] == True
            print(f"✅ Authenticated claim successful: {result['student']['full_name']}")
        else:
            print(f"⚠️ Code may already be claimed: {response.json().get('detail')}")


class TestExcelUpload:
    """Test Excel file upload and import"""
    
    def test_upload_invalid_file_type(self, admin_token):
        """Test uploading non-Excel file"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create a fake text file
        files = {
            'file': ('test.txt', b'Not an Excel file', 'text/plain')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/student-import/upload?year=2026",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 400, f"Expected 400, got: {response.status_code}"
        print(f"✅ Invalid file type correctly rejected")


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
