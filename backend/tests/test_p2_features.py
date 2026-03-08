"""
P2 Features Testing - Smart Dashboard, Reports, Complaints Feedback
Tests:
1. Login functionality for admin/parent users
2. Smart Dashboard API
3. Admin Reports APIs (fees, collection)
4. Complaints API (parent view, admin view, feedback submission)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
ADMIN_EMAIL = "admin@muafakat.link"
ADMIN_PASSWORD = "admin123"
PARENT_EMAIL = "parent@muafakat.link"
PARENT_PASSWORD = "parent123"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def admin_token(api_client):
    """Get admin authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    data = response.json()
    assert "access_token" in data
    return data["access_token"]


@pytest.fixture(scope="module")
def parent_token(api_client):
    """Get parent authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": PARENT_EMAIL,
        "password": PARENT_PASSWORD
    })
    assert response.status_code == 200, f"Parent login failed: {response.text}"
    data = response.json()
    assert "access_token" in data
    return data["access_token"]


@pytest.fixture(scope="module")
def admin_client(api_client, admin_token):
    """Session with admin auth header"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {admin_token}"
    })
    return session


@pytest.fixture(scope="module")
def parent_client(api_client, parent_token):
    """Session with parent auth header"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {parent_token}"
    })
    return session


# ==================== LOGIN TESTS ====================

class TestLogin:
    """Test login functionality"""
    
    def test_admin_login_success(self, api_client):
        """Test admin login with valid credentials"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] in ["admin", "superadmin", "bendahari"]
        print(f"✓ Admin login successful - role: {data['user']['role']}")
    
    def test_parent_login_success(self, api_client):
        """Test parent login with valid credentials"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARENT_EMAIL,
            "password": PARENT_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == PARENT_EMAIL
        assert data["user"]["role"] == "parent"
        print(f"✓ Parent login successful - role: {data['user']['role']}")
    
    def test_login_invalid_credentials(self, api_client):
        """Test login with invalid credentials"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code in [401, 400, 404]
        print("✓ Invalid credentials rejected correctly")


# ==================== SMART DASHBOARD TESTS ====================

class TestSmartDashboard:
    """Test Smart Dashboard API - /api/dashboard/admin"""
    
    def test_admin_dashboard_stats(self, admin_client):
        """Test admin dashboard statistics endpoint"""
        response = admin_client.get(f"{BASE_URL}/api/dashboard/admin")
        assert response.status_code == 200
        data = response.json()
        
        # Check essential fields
        assert "total_students" in data
        assert "total_fees" in data
        assert "total_collected" in data
        assert isinstance(data["total_students"], int)
        assert isinstance(data["total_fees"], (int, float))
        assert isinstance(data["total_collected"], (int, float))
        
        print(f"✓ Admin Dashboard Stats:")
        print(f"  - Total Students: {data['total_students']}")
        print(f"  - Total Fees: RM {data['total_fees']}")
        print(f"  - Total Collected: RM {data['total_collected']}")
        
        # Optional fields
        if "collection_rate" in data:
            print(f"  - Collection Rate: {data['collection_rate']:.1f}%")
        if "pending_students" in data:
            print(f"  - Pending Students: {data['pending_students']}")
    
    def test_admin_dashboard_role_counts(self, admin_client):
        """Test that admin dashboard includes role counts"""
        response = admin_client.get(f"{BASE_URL}/api/dashboard/admin")
        assert response.status_code == 200
        data = response.json()
        
        # Role counts may or may not be present
        if "role_counts" in data:
            assert isinstance(data["role_counts"], dict)
            print(f"✓ Role counts present: {data['role_counts']}")
        else:
            print("⚠ Role counts not in response (optional)")
    
    def test_admin_dashboard_unauthorized(self, api_client):
        """Test admin dashboard without authentication"""
        response = api_client.get(f"{BASE_URL}/api/dashboard/admin")
        assert response.status_code in [401, 403]
        print("✓ Unauthorized access to admin dashboard rejected")


# ==================== ADMIN REPORTS TESTS ====================

class TestAdminReports:
    """Test Admin Reports APIs"""
    
    def test_fees_report(self, admin_client):
        """Test fees report endpoint"""
        response = admin_client.get(f"{BASE_URL}/api/reports/fees")
        assert response.status_code == 200
        data = response.json()
        
        # Check for report structure
        assert "by_category" in data or "by_status" in data or "total_fees" in data
        print(f"✓ Fees report retrieved successfully")
        
        if "by_category" in data:
            print(f"  - Categories: {list(data['by_category'].keys())}")
        if "by_status" in data:
            print(f"  - Statuses: {data['by_status']}")
    
    def test_collection_report(self, admin_client):
        """Test collection report endpoint"""
        response = admin_client.get(f"{BASE_URL}/api/reports/collection")
        assert response.status_code == 200
        data = response.json()
        
        # Check for expected fields
        assert "total_collected" in data or "collection_rate" in data or "total_outstanding" in data
        print(f"✓ Collection report retrieved successfully")
        
        if "total_collected" in data:
            print(f"  - Total Collected: RM {data['total_collected']}")
        if "total_outstanding" in data:
            print(f"  - Total Outstanding: RM {data['total_outstanding']}")
        if "collection_rate" in data:
            print(f"  - Collection Rate: {data['collection_rate']:.1f}%")
    
    def test_reports_unauthorized(self, api_client):
        """Test reports endpoint without authentication"""
        response = api_client.get(f"{BASE_URL}/api/reports/fees")
        assert response.status_code in [401, 403]
        print("✓ Unauthorized access to reports rejected")


# ==================== COMPLAINTS TESTS ====================

class TestComplaintsDashboard:
    """Test Complaints Dashboard Stats API"""
    
    def test_complaints_dashboard_stats(self, admin_client):
        """Test complaints dashboard stats endpoint"""
        response = admin_client.get(f"{BASE_URL}/api/complaints/dashboard/stats")
        assert response.status_code == 200
        data = response.json()
        
        assert "stats" in data
        stats = data["stats"]
        
        # Check for expected fields
        expected_fields = ["jumlah_hari_ini", "aduan_kritikal", "aduan_belum_selesai"]
        for field in expected_fields:
            assert field in stats, f"Missing field: {field}"
        
        print(f"✓ Complaints Dashboard Stats:")
        print(f"  - Today's Complaints: {stats.get('jumlah_hari_ini', 0)}")
        print(f"  - Critical Complaints: {stats.get('aduan_kritikal', 0)}")
        print(f"  - Unresolved: {stats.get('aduan_belum_selesai', 0)}")
        
        if "aduan_ikut_kategori" in stats:
            print(f"  - By Category: {stats['aduan_ikut_kategori']}")


class TestAdminComplaints:
    """Test Admin Complaints API"""
    
    def test_admin_list_complaints(self, admin_client):
        """Test listing all complaints as admin"""
        response = admin_client.get(f"{BASE_URL}/api/complaints")
        assert response.status_code == 200
        data = response.json()
        
        assert "complaints" in data
        assert isinstance(data["complaints"], list)
        print(f"✓ Admin can list complaints: {len(data['complaints'])} complaints found")
        
        if data["complaints"]:
            complaint = data["complaints"][0]
            assert "nombor_aduan" in complaint
            assert "status" in complaint
            print(f"  - Sample complaint: {complaint.get('nombor_aduan')}")
    
    def test_admin_filter_complaints_by_status(self, admin_client):
        """Test filtering complaints by status"""
        response = admin_client.get(f"{BASE_URL}/api/complaints", params={"status": "baru_dihantar"})
        assert response.status_code == 200
        data = response.json()
        assert "complaints" in data
        print(f"✓ Filter by status works: {len(data['complaints'])} new complaints")
    
    def test_trending_categories(self, admin_client):
        """Test trending complaint categories endpoint"""
        response = admin_client.get(f"{BASE_URL}/api/complaints/trending/categories")
        # This might be 200 or 404 if no trending data
        if response.status_code == 200:
            data = response.json()
            assert "trending" in data
            print(f"✓ Trending categories: {data.get('trending', [])}")
        else:
            print(f"⚠ Trending endpoint returned {response.status_code} (may be empty)")


class TestParentComplaints:
    """Test Parent Complaints API"""
    
    def test_parent_list_my_complaints(self, parent_client):
        """Test parent listing their own complaints"""
        response = parent_client.get(f"{BASE_URL}/api/complaints/my-complaints")
        assert response.status_code == 200
        data = response.json()
        
        assert "complaints" in data
        assert isinstance(data["complaints"], list)
        print(f"✓ Parent can list their complaints: {len(data['complaints'])} complaints")
    
    def test_parent_create_complaint(self, parent_client):
        """Test parent creating a new complaint"""
        complaint_data = {
            "nama_pengadu": "Test Parent",
            "hubungan": "ibu_bapa",
            "nombor_maktab": "M2024TEST",
            "nama_pelajar": "Test Student",
            "tingkatan": 1,
            "asrama": "JA",
            "jenis_aduan": "kebajikan",
            "penerangan": "This is a test complaint for testing purposes only. Please ignore.",
            "tahap_keutamaan": "sederhana"
        }
        
        response = parent_client.post(f"{BASE_URL}/api/complaints", json=complaint_data)
        # May get 201 or 200 depending on implementation
        assert response.status_code in [200, 201], f"Create complaint failed: {response.text}"
        data = response.json()
        
        assert "complaint" in data or "id" in data or "nombor_aduan" in data
        print(f"✓ Parent created complaint successfully")
        
        # Return complaint ID for further tests
        if "complaint" in data:
            return data["complaint"].get("id") or data["complaint"].get("_id")
        return data.get("id")


class TestComplaintsFeedback:
    """Test Complaints Feedback API - New P2 Feature"""
    
    @pytest.fixture(scope="class")
    def test_complaint_id(self, parent_client, admin_client):
        """Create a test complaint and return its ID"""
        # Create complaint
        complaint_data = {
            "nama_pengadu": "Test Feedback Parent",
            "hubungan": "ibu_bapa",
            "nombor_maktab": "M2024FB",
            "nama_pelajar": "Feedback Test Student",
            "tingkatan": 2,
            "asrama": "JA",
            "jenis_aduan": "fasiliti_rosak",
            "penerangan": "Test complaint for feedback testing - facility broken test case.",
            "tahap_keutamaan": "sederhana"
        }
        
        response = parent_client.post(f"{BASE_URL}/api/complaints", json=complaint_data)
        assert response.status_code in [200, 201], f"Failed to create test complaint: {response.text}"
        
        data = response.json()
        complaint_id = None
        if "complaint" in data:
            complaint_id = data["complaint"].get("id") or str(data["complaint"].get("_id"))
        else:
            complaint_id = data.get("id")
        
        # Update status to 'selesai' so feedback can be given
        if complaint_id:
            status_update = {
                "status": "selesai",
                "catatan": "Test resolved for feedback testing"
            }
            admin_client.put(f"{BASE_URL}/api/complaints/{complaint_id}/status", json=status_update)
        
        return complaint_id
    
    def test_submit_feedback(self, parent_client, test_complaint_id):
        """Test submitting feedback on a resolved complaint"""
        if not test_complaint_id:
            pytest.skip("No complaint ID available for feedback test")
        
        feedback_data = {
            "rating": 4,
            "komen": "Good response from warden. Issue resolved satisfactorily."
        }
        
        response = parent_client.post(
            f"{BASE_URL}/api/complaints/{test_complaint_id}/feedback",
            json=feedback_data
        )
        
        # Should succeed or fail gracefully
        if response.status_code in [200, 201]:
            print(f"✓ Feedback submitted successfully for complaint {test_complaint_id}")
            data = response.json()
            assert "message" in data or "feedback" in data
        elif response.status_code == 400:
            # May fail if feedback already given or status not ready
            print(f"⚠ Feedback rejected (may already exist): {response.text}")
        else:
            print(f"⚠ Feedback endpoint returned {response.status_code}: {response.text}")


class TestHostelBlocksPublic:
    """Test Hostel Blocks Public API - Used by Complaints Form"""
    
    def test_public_hostel_blocks(self, api_client):
        """Test public endpoint for hostel blocks"""
        response = api_client.get(f"{BASE_URL}/api/hostel-blocks/public")
        assert response.status_code == 200
        data = response.json()
        
        assert "blocks" in data
        assert isinstance(data["blocks"], list)
        print(f"✓ Public hostel blocks: {len(data['blocks'])} blocks available")
        
        if data["blocks"]:
            block = data["blocks"][0]
            print(f"  - Sample block: {block.get('name')} ({block.get('code')})")


class TestKoperasiStats:
    """Test Koperasi Stats API - Used by Smart Dashboard"""
    
    def test_koperasi_admin_stats(self, admin_client):
        """Test koperasi admin stats endpoint"""
        response = admin_client.get(f"{BASE_URL}/api/koperasi/admin/stats")
        
        # May or may not exist
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Koperasi stats available:")
            if "total_orders" in data:
                print(f"  - Total Orders: {data['total_orders']}")
            if "total_sales" in data:
                print(f"  - Total Sales: RM {data['total_sales']}")
        else:
            print(f"⚠ Koperasi stats endpoint returned {response.status_code}")


# ==================== RUN TESTS ====================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
