"""
Test Financial Dashboard Export Functionality
Tests PDF and Excel export endpoints plus dashboard summary API

Endpoints tested:
- GET /api/financial-dashboard/summary
- GET /api/financial-dashboard/export/pdf
- GET /api/financial-dashboard/export/excel
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestFinancialDashboardAuth:
    """Authentication and login tests for financial dashboard access"""
    
    @pytest.fixture(scope="class")
    def superadmin_token(self):
        """Get superadmin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        return data.get("access_token")
    
    @pytest.fixture(scope="class")
    def bendahari_token(self):
        """Get bendahari authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "bendahari@muafakat.link",
            "password": "bendahari123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        return data.get("access_token")

    def test_superadmin_login(self, superadmin_token):
        """Test superadmin can login successfully"""
        assert superadmin_token is not None
        assert len(superadmin_token) > 0
        print(f"✓ Superadmin login successful, token length: {len(superadmin_token)}")

    def test_bendahari_login(self, bendahari_token):
        """Test bendahari can login successfully"""
        assert bendahari_token is not None
        assert len(bendahari_token) > 0
        print(f"✓ Bendahari login successful, token length: {len(bendahari_token)}")


class TestFinancialDashboardSummary:
    """Tests for /api/financial-dashboard/summary endpoint"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers with superadmin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "admin123"
        })
        token = response.json().get("access_token")
        return {"Authorization": f"Bearer {token}"}
    
    def test_summary_endpoint_default_period(self, auth_headers):
        """Test summary endpoint with default period (month)"""
        response = requests.get(
            f"{BASE_URL}/api/financial-dashboard/summary",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "period" in data
        assert "tabung" in data
        assert "accounting" in data
        assert "combined" in data
        
        # Verify tabung section
        assert "total_donations" in data["tabung"]
        assert "donation_count" in data["tabung"]
        assert "unique_donors" in data["tabung"]
        assert "active_campaigns" in data["tabung"]
        
        # Verify accounting section
        assert "total_income" in data["accounting"]
        assert "total_expense" in data["accounting"]
        assert "net_balance" in data["accounting"]
        
        # Verify combined section
        assert "surplus_deficit" in data["combined"]
        assert "health_status" in data["combined"]
        
        print(f"✓ Summary endpoint returned valid structure")
        print(f"  - Period: {data['period']}")
        print(f"  - Tabung donations: {data['tabung']['total_donations']}")
        print(f"  - Net balance: {data['accounting']['net_balance']}")
    
    def test_summary_endpoint_all_periods(self, auth_headers):
        """Test summary endpoint with different period parameters"""
        periods = ["month", "quarter", "year", "all"]
        
        for period in periods:
            response = requests.get(
                f"{BASE_URL}/api/financial-dashboard/summary?period={period}",
                headers=auth_headers
            )
            assert response.status_code == 200, f"Failed for period '{period}': {response.text}"
            data = response.json()
            assert data["period"] == period
            print(f"✓ Summary endpoint works for period: {period}")
    
    def test_summary_unauthorized_without_token(self):
        """Test summary endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/financial-dashboard/summary")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Summary endpoint properly requires authentication")


class TestPDFExport:
    """Tests for /api/financial-dashboard/export/pdf endpoint"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers with superadmin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "admin123"
        })
        token = response.json().get("access_token")
        return {"Authorization": f"Bearer {token}"}
    
    def test_pdf_export_endpoint_returns_200(self, auth_headers):
        """Test PDF export endpoint returns 200 OK"""
        response = requests.get(
            f"{BASE_URL}/api/financial-dashboard/export/pdf",
            headers=auth_headers
        )
        assert response.status_code == 200, f"PDF export failed: {response.status_code}"
        print(f"✓ PDF export endpoint returns 200 OK")
    
    def test_pdf_export_content_type(self, auth_headers):
        """Test PDF export returns correct content type"""
        response = requests.get(
            f"{BASE_URL}/api/financial-dashboard/export/pdf",
            headers=auth_headers
        )
        assert response.status_code == 200
        content_type = response.headers.get("content-type", "")
        assert "application/pdf" in content_type, f"Expected PDF content type, got: {content_type}"
        print(f"✓ PDF export returns correct content-type: {content_type}")
    
    def test_pdf_export_has_content_disposition(self, auth_headers):
        """Test PDF export includes Content-Disposition header for download"""
        response = requests.get(
            f"{BASE_URL}/api/financial-dashboard/export/pdf",
            headers=auth_headers
        )
        assert response.status_code == 200
        content_disp = response.headers.get("content-disposition", "")
        assert "attachment" in content_disp.lower(), f"Expected attachment, got: {content_disp}"
        assert ".pdf" in content_disp.lower(), f"Expected .pdf filename, got: {content_disp}"
        print(f"✓ PDF export has correct Content-Disposition: {content_disp}")
    
    def test_pdf_export_file_size(self, auth_headers):
        """Test PDF export returns valid file content"""
        response = requests.get(
            f"{BASE_URL}/api/financial-dashboard/export/pdf",
            headers=auth_headers
        )
        assert response.status_code == 200
        content_length = len(response.content)
        assert content_length > 0, "PDF file is empty"
        assert content_length > 1000, f"PDF seems too small: {content_length} bytes"
        print(f"✓ PDF export file size: {content_length} bytes")
    
    def test_pdf_export_file_signature(self, auth_headers):
        """Test PDF file has valid PDF signature (magic bytes)"""
        response = requests.get(
            f"{BASE_URL}/api/financial-dashboard/export/pdf",
            headers=auth_headers
        )
        assert response.status_code == 200
        # PDF files start with '%PDF-'
        assert response.content[:5] == b'%PDF-', "File does not have PDF signature"
        print(f"✓ PDF export has valid PDF magic bytes")
    
    def test_pdf_export_with_period_param(self, auth_headers):
        """Test PDF export with different period parameters"""
        periods = ["month", "quarter", "year", "all"]
        for period in periods:
            response = requests.get(
                f"{BASE_URL}/api/financial-dashboard/export/pdf?period={period}",
                headers=auth_headers
            )
            assert response.status_code == 200, f"PDF export failed for period '{period}'"
            assert response.content[:5] == b'%PDF-'
            print(f"✓ PDF export works for period: {period}")
    
    def test_pdf_export_unauthorized(self):
        """Test PDF export requires authentication"""
        response = requests.get(f"{BASE_URL}/api/financial-dashboard/export/pdf")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ PDF export properly requires authentication")


class TestExcelExport:
    """Tests for /api/financial-dashboard/export/excel endpoint"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers with superadmin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "admin123"
        })
        token = response.json().get("access_token")
        return {"Authorization": f"Bearer {token}"}
    
    def test_excel_export_endpoint_returns_200(self, auth_headers):
        """Test Excel export endpoint returns 200 OK"""
        response = requests.get(
            f"{BASE_URL}/api/financial-dashboard/export/excel",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Excel export failed: {response.status_code}"
        print(f"✓ Excel export endpoint returns 200 OK")
    
    def test_excel_export_content_type(self, auth_headers):
        """Test Excel export returns correct content type"""
        response = requests.get(
            f"{BASE_URL}/api/financial-dashboard/export/excel",
            headers=auth_headers
        )
        assert response.status_code == 200
        content_type = response.headers.get("content-type", "")
        # Excel XLSX files have this MIME type
        expected_types = [
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/octet-stream"  # Some servers may use this
        ]
        assert any(t in content_type for t in expected_types), f"Unexpected content type: {content_type}"
        print(f"✓ Excel export returns correct content-type: {content_type}")
    
    def test_excel_export_has_content_disposition(self, auth_headers):
        """Test Excel export includes Content-Disposition header for download"""
        response = requests.get(
            f"{BASE_URL}/api/financial-dashboard/export/excel",
            headers=auth_headers
        )
        assert response.status_code == 200
        content_disp = response.headers.get("content-disposition", "")
        assert "attachment" in content_disp.lower(), f"Expected attachment, got: {content_disp}"
        assert ".xlsx" in content_disp.lower(), f"Expected .xlsx filename, got: {content_disp}"
        print(f"✓ Excel export has correct Content-Disposition: {content_disp}")
    
    def test_excel_export_file_size(self, auth_headers):
        """Test Excel export returns valid file content"""
        response = requests.get(
            f"{BASE_URL}/api/financial-dashboard/export/excel",
            headers=auth_headers
        )
        assert response.status_code == 200
        content_length = len(response.content)
        assert content_length > 0, "Excel file is empty"
        assert content_length > 1000, f"Excel seems too small: {content_length} bytes"
        print(f"✓ Excel export file size: {content_length} bytes")
    
    def test_excel_export_file_signature(self, auth_headers):
        """Test Excel file has valid XLSX signature (magic bytes)"""
        response = requests.get(
            f"{BASE_URL}/api/financial-dashboard/export/excel",
            headers=auth_headers
        )
        assert response.status_code == 200
        # XLSX files are ZIP archives and start with 'PK' (50 4B)
        assert response.content[:2] == b'PK', "File does not have XLSX/ZIP signature"
        print(f"✓ Excel export has valid XLSX magic bytes (PK)")
    
    def test_excel_export_with_period_param(self, auth_headers):
        """Test Excel export with different period parameters"""
        periods = ["month", "quarter", "year", "all"]
        for period in periods:
            response = requests.get(
                f"{BASE_URL}/api/financial-dashboard/export/excel?period={period}",
                headers=auth_headers
            )
            assert response.status_code == 200, f"Excel export failed for period '{period}'"
            assert response.content[:2] == b'PK'
            print(f"✓ Excel export works for period: {period}")
    
    def test_excel_export_unauthorized(self):
        """Test Excel export requires authentication"""
        response = requests.get(f"{BASE_URL}/api/financial-dashboard/export/excel")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Excel export properly requires authentication")


class TestBendahariAccess:
    """Test bendahari role has access to financial dashboard"""
    
    @pytest.fixture(scope="class")
    def bendahari_headers(self):
        """Get auth headers with bendahari token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "bendahari@muafakat.link",
            "password": "bendahari123"
        })
        token = response.json().get("access_token")
        return {"Authorization": f"Bearer {token}"}
    
    def test_bendahari_can_access_summary(self, bendahari_headers):
        """Test bendahari can access dashboard summary"""
        response = requests.get(
            f"{BASE_URL}/api/financial-dashboard/summary",
            headers=bendahari_headers
        )
        assert response.status_code == 200, f"Bendahari access denied: {response.status_code}"
        print(f"✓ Bendahari can access summary endpoint")
    
    def test_bendahari_can_export_pdf(self, bendahari_headers):
        """Test bendahari can export PDF"""
        response = requests.get(
            f"{BASE_URL}/api/financial-dashboard/export/pdf",
            headers=bendahari_headers
        )
        assert response.status_code == 200, f"Bendahari PDF export denied: {response.status_code}"
        assert response.content[:5] == b'%PDF-'
        print(f"✓ Bendahari can export PDF")
    
    def test_bendahari_can_export_excel(self, bendahari_headers):
        """Test bendahari can export Excel"""
        response = requests.get(
            f"{BASE_URL}/api/financial-dashboard/export/excel",
            headers=bendahari_headers
        )
        assert response.status_code == 200, f"Bendahari Excel export denied: {response.status_code}"
        assert response.content[:2] == b'PK'
        print(f"✓ Bendahari can export Excel")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
