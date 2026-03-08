"""
Test Deletable Notifications and Fee Reminder Cron Job
Tests:
1. DELETE /api/notifications/{notification_id} - Delete single notification
2. DELETE /api/notifications - Delete all notifications for user
3. POST /api/cron/fee-reminders - Cron job to send fee reminders (with cron_key validation)
4. GET /api/cron/status - Get cron job status (superadmin only)
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://yuran-admin-panel.preview.emergentagent.com')

# Test credentials
PARENT_CREDS = {"email": "demo@muafakat.link", "password": "demoparent"}
SUPERADMIN_CREDS = {"email": "superadmin@muafakat.link", "password": "super123"}
CRON_KEY = "mrsmku-cron-2026"


@pytest.fixture(scope="module")
def parent_token():
    """Get parent authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=PARENT_CREDS)
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Parent authentication failed: {response.status_code}")


@pytest.fixture(scope="module")
def superadmin_token():
    """Get superadmin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERADMIN_CREDS)
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Superadmin authentication failed: {response.status_code}")


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestNotificationDeletion:
    """Test notification deletion endpoints"""
    
    def test_get_notifications_list(self, api_client, parent_token):
        """Test fetching notifications list"""
        api_client.headers.update({"Authorization": f"Bearer {parent_token}"})
        response = api_client.get(f"{BASE_URL}/api/notifications")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} notifications for parent user")
        
    def test_delete_single_notification(self, api_client, parent_token):
        """Test deleting a single notification"""
        api_client.headers.update({"Authorization": f"Bearer {parent_token}"})
        
        # First, get notifications list
        get_response = api_client.get(f"{BASE_URL}/api/notifications")
        assert get_response.status_code == 200
        notifications = get_response.json()
        
        if len(notifications) == 0:
            # Create a notification first by triggering the cron job
            cron_response = api_client.post(
                f"{BASE_URL}/api/cron/fee-reminders",
                params={"cron_key": CRON_KEY}
            )
            # Re-fetch notifications
            get_response = api_client.get(f"{BASE_URL}/api/notifications")
            notifications = get_response.json()
        
        if len(notifications) == 0:
            pytest.skip("No notifications available to delete")
        
        # Delete first notification
        notification_id = notifications[0]["id"]
        delete_response = api_client.delete(f"{BASE_URL}/api/notifications/{notification_id}")
        
        assert delete_response.status_code == 200
        data = delete_response.json()
        assert "message" in data
        assert "dipadam" in data["message"].lower()
        print(f"Successfully deleted notification: {notification_id}")
        
        # Verify notification no longer exists
        get_after_delete = api_client.get(f"{BASE_URL}/api/notifications")
        remaining_ids = [n["id"] for n in get_after_delete.json()]
        assert notification_id not in remaining_ids, "Notification should be removed after deletion"
        
    def test_delete_notification_not_found(self, api_client, parent_token):
        """Test deleting a non-existent notification returns 404"""
        api_client.headers.update({"Authorization": f"Bearer {parent_token}"})
        
        # Use a fake ObjectId
        fake_id = "000000000000000000000000"
        delete_response = api_client.delete(f"{BASE_URL}/api/notifications/{fake_id}")
        
        assert delete_response.status_code == 404
        print("Correctly returned 404 for non-existent notification")
        
    def test_delete_all_notifications(self, api_client, parent_token):
        """Test deleting all notifications"""
        api_client.headers.update({"Authorization": f"Bearer {parent_token}"})
        
        # Get current count
        get_before = api_client.get(f"{BASE_URL}/api/notifications")
        count_before = len(get_before.json())
        
        # Delete all
        delete_response = api_client.delete(f"{BASE_URL}/api/notifications")
        
        assert delete_response.status_code == 200
        data = delete_response.json()
        assert "message" in data
        assert "dipadam" in data["message"].lower()
        print(f"Delete all response: {data['message']}")
        
        # Verify empty list
        get_after = api_client.get(f"{BASE_URL}/api/notifications")
        assert get_after.status_code == 200
        assert len(get_after.json()) == 0
        print("All notifications successfully deleted - list is empty")


class TestCronJobFeeReminders:
    """Test fee reminder cron job endpoints"""
    
    def test_cron_fee_reminders_without_key(self, api_client):
        """Test cron job rejects request without key"""
        response = api_client.post(f"{BASE_URL}/api/cron/fee-reminders")
        
        assert response.status_code == 401
        data = response.json()
        assert "Invalid" in data.get("detail", "") or "invalid" in data.get("detail", "").lower()
        print("Correctly rejected request without cron key")
        
    def test_cron_fee_reminders_with_invalid_key(self, api_client):
        """Test cron job rejects request with invalid key"""
        response = api_client.post(
            f"{BASE_URL}/api/cron/fee-reminders",
            params={"cron_key": "wrong-key-123"}
        )
        
        assert response.status_code == 401
        data = response.json()
        assert "Invalid" in data.get("detail", "") or "invalid" in data.get("detail", "").lower()
        print("Correctly rejected request with invalid cron key")
        
    def test_cron_fee_reminders_with_valid_key(self, api_client):
        """Test cron job succeeds with valid key"""
        response = api_client.post(
            f"{BASE_URL}/api/cron/fee-reminders",
            params={"cron_key": CRON_KEY}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "message" in data
        assert "notifications_sent" in data
        assert "parents_notified" in data
        assert "timestamp" in data
        
        # Verify data types
        assert isinstance(data["notifications_sent"], int)
        assert isinstance(data["parents_notified"], int)
        assert data["notifications_sent"] >= 0
        
        print(f"Cron job executed successfully:")
        print(f"  - Message: {data['message']}")
        print(f"  - Notifications sent: {data['notifications_sent']}")
        print(f"  - Parents notified: {data['parents_notified']}")
        print(f"  - Timestamp: {data['timestamp']}")


class TestCronStatus:
    """Test cron status endpoint"""
    
    def test_cron_status_unauthorized(self, api_client, parent_token):
        """Test cron status is restricted to superadmin"""
        api_client.headers.update({"Authorization": f"Bearer {parent_token}"})
        
        response = api_client.get(f"{BASE_URL}/api/cron/status")
        
        assert response.status_code == 403
        print("Correctly denied access to non-superadmin user")
        
    def test_cron_status_unauthenticated(self, api_client):
        """Test cron status requires authentication"""
        response = api_client.get(f"{BASE_URL}/api/cron/status")
        
        assert response.status_code in [401, 403]
        print("Correctly requires authentication")
        
    def test_cron_status_superadmin(self, api_client, superadmin_token):
        """Test superadmin can access cron status"""
        api_client.headers.update({"Authorization": f"Bearer {superadmin_token}"})
        
        response = api_client.get(f"{BASE_URL}/api/cron/status")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "fee_reminders" in data
        assert "endpoint" in data["fee_reminders"]
        assert "schedule" in data["fee_reminders"]
        assert "description" in data["fee_reminders"]
        
        print(f"Cron status:")
        print(f"  - Endpoint: {data['fee_reminders']['endpoint']}")
        print(f"  - Schedule: {data['fee_reminders']['schedule']}")
        print(f"  - Description: {data['fee_reminders']['description']}")


class TestNotificationAfterCronJob:
    """Test that cron job creates notifications correctly"""
    
    def test_notifications_created_by_cron(self, api_client, parent_token):
        """Verify that cron job creates notifications for parents"""
        api_client.headers.update({"Authorization": f"Bearer {parent_token}"})
        
        # Run cron job
        cron_response = api_client.post(
            f"{BASE_URL}/api/cron/fee-reminders",
            params={"cron_key": CRON_KEY}
        )
        assert cron_response.status_code == 200
        cron_data = cron_response.json()
        
        if cron_data["notifications_sent"] > 0:
            # Fetch notifications
            notif_response = api_client.get(f"{BASE_URL}/api/notifications")
            assert notif_response.status_code == 200
            notifications = notif_response.json()
            
            # Check if any fee reminder notification exists
            fee_reminders = [n for n in notifications if "yuran" in n.get("title", "").lower() or "yuran" in n.get("message", "").lower()]
            print(f"Found {len(fee_reminders)} fee reminder notifications")
            
            if len(fee_reminders) > 0:
                # Verify notification structure
                reminder = fee_reminders[0]
                assert "id" in reminder
                assert "title" in reminder
                assert "message" in reminder
                assert "type" in reminder
                assert reminder["type"] == "warning"
                print(f"Fee reminder notification: {reminder['title']}")
        else:
            print("No notifications sent - parent may not have outstanding fees")
