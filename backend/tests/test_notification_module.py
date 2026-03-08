"""
Test Notification Module - Guru Kelas Notification Center
Features:
- Bell icon notification for all logged-in users
- GET /api/notifications - get notification list
- GET /api/notifications/unread-count - get unread count
- PUT /api/notifications/mark-read - mark as read
- PUT /api/notifications/mark-all-read - mark all as read
- DELETE /api/notifications/{id} - delete notification
- GET /api/notifications/guru/dashboard - guru dashboard stats
- POST /api/notifications/guru/send-quick - send quick message
- POST /api/notifications/announcements - create announcement
- GET /api/notifications/announcements - list announcements
- POST /api/notifications/push/subscribe - push subscription
- GET /api/notifications/push/status - push status
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestNotificationModule:
    """Test Notification Module APIs"""
    
    # Class-level variables to store tokens and data
    parent_token = None
    guru_token = None
    superadmin_token = None
    parent_user = None
    guru_user = None
    notification_id = None
    announcement_id = None
    
    @pytest.fixture(autouse=True)
    def setup_session(self):
        """Setup session for each test"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    # ============ AUTH TESTS ============
    
    def test_01_login_parent(self):
        """Login as parent user"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "parent@muafakat.link",
            "password": "parent123"
        })
        assert response.status_code == 200, f"Parent login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        TestNotificationModule.parent_token = data["access_token"]
        TestNotificationModule.parent_user = data["user"]
        print(f"Parent login successful: {data['user']['full_name']}")
    
    def test_02_login_guru(self):
        """Login as guru_kelas user"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "guru@muafakat.link",
            "password": "guru123"
        })
        assert response.status_code == 200, f"Guru login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        TestNotificationModule.guru_token = data["access_token"]
        TestNotificationModule.guru_user = data["user"]
        print(f"Guru login successful: {data['user']['full_name']}, class: {data['user'].get('assigned_class')}")
    
    def test_03_login_superadmin(self):
        """Login as superadmin user"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "super123"
        })
        assert response.status_code == 200, f"SuperAdmin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        TestNotificationModule.superadmin_token = data["access_token"]
        print(f"SuperAdmin login successful: {data['user']['full_name']}")
    
    # ============ PARENT NOTIFICATION TESTS ============
    
    def test_04_get_notifications_parent(self):
        """GET /api/notifications - parent gets notification list"""
        self.session.headers["Authorization"] = f"Bearer {TestNotificationModule.parent_token}"
        response = self.session.get(f"{BASE_URL}/api/notifications")
        assert response.status_code == 200, f"Failed to get notifications: {response.text}"
        
        data = response.json()
        assert "notifications" in data
        assert "pagination" in data
        assert "unread_count" in data
        assert isinstance(data["notifications"], list)
        print(f"Parent notifications: {len(data['notifications'])} items, {data['unread_count']} unread")
    
    def test_05_get_unread_count_parent(self):
        """GET /api/notifications/unread-count - parent gets unread count"""
        self.session.headers["Authorization"] = f"Bearer {TestNotificationModule.parent_token}"
        response = self.session.get(f"{BASE_URL}/api/notifications/unread-count")
        assert response.status_code == 200, f"Failed to get unread count: {response.text}"
        
        data = response.json()
        assert "unread_count" in data
        assert isinstance(data["unread_count"], int)
        print(f"Parent unread count: {data['unread_count']}")
    
    def test_06_push_subscription_status_parent(self):
        """GET /api/notifications/push/status - check push subscription status"""
        self.session.headers["Authorization"] = f"Bearer {TestNotificationModule.parent_token}"
        response = self.session.get(f"{BASE_URL}/api/notifications/push/status")
        assert response.status_code == 200, f"Failed to get push status: {response.text}"
        
        data = response.json()
        assert "is_subscribed" in data
        assert "device_count" in data
        print(f"Push subscription status: subscribed={data['is_subscribed']}, devices={data['device_count']}")
    
    def test_07_push_subscribe_parent(self):
        """POST /api/notifications/push/subscribe - subscribe to push notifications"""
        self.session.headers["Authorization"] = f"Bearer {TestNotificationModule.parent_token}"
        response = self.session.post(f"{BASE_URL}/api/notifications/push/subscribe", json={
            "endpoint": "https://test.push.endpoint/test123",
            "keys": {
                "p256dh": "test_p256dh_key",
                "auth": "test_auth_key"
            },
            "device_info": "Test Device - Chrome"
        })
        assert response.status_code == 200, f"Failed to subscribe: {response.text}"
        
        data = response.json()
        assert "status" in data
        assert data["status"] in ["subscribed", "updated"]
        print(f"Push subscription result: {data['status']}")
    
    # ============ GURU NOTIFICATION TESTS ============
    
    def test_08_guru_notification_dashboard(self):
        """GET /api/notifications/guru/dashboard - guru gets dashboard stats"""
        self.session.headers["Authorization"] = f"Bearer {TestNotificationModule.guru_token}"
        response = self.session.get(f"{BASE_URL}/api/notifications/guru/dashboard")
        assert response.status_code == 200, f"Failed to get guru dashboard: {response.text}"
        
        data = response.json()
        assert "class_info" in data
        assert "push_stats" in data
        assert "announcement_stats" in data
        
        class_info = data["class_info"]
        assert "tingkatan" in class_info
        assert "kelas" in class_info
        assert "student_count" in class_info
        assert "parent_count" in class_info
        
        print(f"Guru dashboard - Class: {class_info.get('full_class')}, Students: {class_info['student_count']}, Parents: {class_info['parent_count']}")
    
    def test_09_guru_get_parents_list(self):
        """GET /api/notifications/guru/parents - guru gets list of parents"""
        self.session.headers["Authorization"] = f"Bearer {TestNotificationModule.guru_token}"
        response = self.session.get(f"{BASE_URL}/api/notifications/guru/parents")
        assert response.status_code == 200, f"Failed to get parents: {response.text}"
        
        data = response.json()
        assert "parents" in data
        assert "pagination" in data
        assert isinstance(data["parents"], list)
        
        if data["parents"]:
            parent = data["parents"][0]
            assert "id" in parent
            assert "full_name" in parent
            assert "children" in parent
        print(f"Guru parents list: {len(data['parents'])} parents found")
    
    def test_10_guru_send_quick_notification(self):
        """POST /api/notifications/guru/send-quick - guru sends quick message to class"""
        self.session.headers["Authorization"] = f"Bearer {TestNotificationModule.guru_token}"
        response = self.session.post(f"{BASE_URL}/api/notifications/guru/send-quick", json={
            "title": "TEST Peringatan Ujian",
            "message": "Ini adalah mesej ujian dari guru kelas untuk ibu bapa.",
            "target": "all",
            "send_push": True,
            "send_email": False
        })
        
        # May return 200 or 400 if no parents in class
        if response.status_code == 400:
            data = response.json()
            print(f"Quick send skipped (expected): {data.get('detail')}")
            return
        
        assert response.status_code == 200, f"Failed to send quick notification: {response.text}"
        
        data = response.json()
        assert "status" in data
        assert data["status"] == "success"
        assert "notifications_sent" in data
        print(f"Quick notification sent: {data['notifications_sent']} recipients")
    
    def test_11_guru_get_announcements(self):
        """GET /api/notifications/announcements - guru gets list of announcements"""
        self.session.headers["Authorization"] = f"Bearer {TestNotificationModule.guru_token}"
        response = self.session.get(f"{BASE_URL}/api/notifications/announcements")
        assert response.status_code == 200, f"Failed to get announcements: {response.text}"
        
        data = response.json()
        assert "announcements" in data
        assert "pagination" in data
        print(f"Guru announcements: {len(data['announcements'])} announcements")
    
    def test_12_guru_create_announcement(self):
        """POST /api/notifications/announcements - guru creates new announcement"""
        self.session.headers["Authorization"] = f"Bearer {TestNotificationModule.guru_token}"
        response = self.session.post(f"{BASE_URL}/api/notifications/announcements", json={
            "title": "TEST Pengumuman Kelas",
            "content": "Ini adalah pengumuman ujian untuk kelas. Sila abaikan mesej ini.",
            "priority": "normal",
            "send_push": True,
            "send_email": False
        })
        assert response.status_code == 200, f"Failed to create announcement: {response.text}"
        
        data = response.json()
        assert "status" in data
        assert data["status"] == "success"
        assert "announcement" in data
        assert "id" in data["announcement"]
        
        TestNotificationModule.announcement_id = data["announcement"]["id"]
        print(f"Announcement created: ID={data['announcement']['id']}, sent to {data['announcement'].get('sent_count', 0)} parents")
    
    def test_13_guru_delete_announcement(self):
        """DELETE /api/notifications/announcements/{id} - guru deletes announcement"""
        if not TestNotificationModule.announcement_id:
            pytest.skip("No announcement to delete")
        
        self.session.headers["Authorization"] = f"Bearer {TestNotificationModule.guru_token}"
        response = self.session.delete(f"{BASE_URL}/api/notifications/announcements/{TestNotificationModule.announcement_id}")
        assert response.status_code == 200, f"Failed to delete announcement: {response.text}"
        
        data = response.json()
        assert data["status"] == "deleted"
        print(f"Announcement deleted: {TestNotificationModule.announcement_id}")
    
    # ============ NOTIFICATION MANAGEMENT TESTS ============
    
    def test_14_create_test_notification_for_parent(self):
        """Create a test notification for parent (via superadmin creating via direct DB simulation)"""
        # First, let's get the guru dashboard to check if notifications were created
        self.session.headers["Authorization"] = f"Bearer {TestNotificationModule.parent_token}"
        response = self.session.get(f"{BASE_URL}/api/notifications")
        data = response.json()
        
        if data["notifications"]:
            # Use existing notification for testing
            TestNotificationModule.notification_id = data["notifications"][0]["id"]
            print(f"Using existing notification: {TestNotificationModule.notification_id}")
        else:
            # Create notification via guru quick send
            self.session.headers["Authorization"] = f"Bearer {TestNotificationModule.guru_token}"
            response = self.session.post(f"{BASE_URL}/api/notifications/guru/send-quick", json={
                "title": "TEST Notifikasi untuk Mark Read",
                "message": "Ini adalah notifikasi ujian.",
                "target": "all",
                "send_push": False,
                "send_email": False
            })
            
            # Get notification ID from parent's list
            self.session.headers["Authorization"] = f"Bearer {TestNotificationModule.parent_token}"
            response = self.session.get(f"{BASE_URL}/api/notifications")
            data = response.json()
            if data["notifications"]:
                TestNotificationModule.notification_id = data["notifications"][0]["id"]
                print(f"Created and using notification: {TestNotificationModule.notification_id}")
            else:
                print("No notifications available for testing mark-read")
    
    def test_15_mark_notification_as_read(self):
        """PUT /api/notifications/mark-read - mark specific notification as read"""
        if not TestNotificationModule.notification_id:
            pytest.skip("No notification to mark as read")
        
        self.session.headers["Authorization"] = f"Bearer {TestNotificationModule.parent_token}"
        response = self.session.put(f"{BASE_URL}/api/notifications/mark-read", json={
            "notification_ids": [TestNotificationModule.notification_id]
        })
        assert response.status_code == 200, f"Failed to mark as read: {response.text}"
        
        data = response.json()
        assert "status" in data
        assert data["status"] == "success"
        print(f"Marked {data.get('marked_count', 0)} notifications as read")
    
    def test_16_mark_all_notifications_as_read(self):
        """PUT /api/notifications/mark-all-read - mark all notifications as read"""
        self.session.headers["Authorization"] = f"Bearer {TestNotificationModule.parent_token}"
        response = self.session.put(f"{BASE_URL}/api/notifications/mark-all-read")
        assert response.status_code == 200, f"Failed to mark all as read: {response.text}"
        
        data = response.json()
        assert "status" in data
        assert data["status"] == "success"
        print(f"Marked all ({data.get('marked_count', 0)}) notifications as read")
    
    def test_17_verify_unread_count_zero(self):
        """Verify unread count is 0 after marking all as read"""
        self.session.headers["Authorization"] = f"Bearer {TestNotificationModule.parent_token}"
        response = self.session.get(f"{BASE_URL}/api/notifications/unread-count")
        assert response.status_code == 200
        
        data = response.json()
        assert data["unread_count"] == 0, f"Expected 0 unread, got {data['unread_count']}"
        print("Verified unread count is 0")
    
    def test_18_delete_notification(self):
        """DELETE /api/notifications/{id} - delete a notification"""
        if not TestNotificationModule.notification_id:
            pytest.skip("No notification to delete")
        
        self.session.headers["Authorization"] = f"Bearer {TestNotificationModule.parent_token}"
        response = self.session.delete(f"{BASE_URL}/api/notifications/{TestNotificationModule.notification_id}")
        
        # Could be 200 or 404 if already deleted
        if response.status_code == 404:
            print(f"Notification already deleted or not found")
            return
        
        assert response.status_code == 200, f"Failed to delete notification: {response.text}"
        
        data = response.json()
        assert data["status"] == "deleted"
        print(f"Notification deleted: {TestNotificationModule.notification_id}")
    
    # ============ SUPERADMIN TESTS ============
    
    def test_19_superadmin_guru_dashboard_access(self):
        """SuperAdmin can access guru notification dashboard"""
        self.session.headers["Authorization"] = f"Bearer {TestNotificationModule.superadmin_token}"
        response = self.session.get(f"{BASE_URL}/api/notifications/guru/dashboard")
        assert response.status_code == 200, f"SuperAdmin failed to access guru dashboard: {response.text}"
        
        data = response.json()
        assert "class_info" in data
        print("SuperAdmin can access guru notification dashboard")
    
    def test_20_superadmin_announcements_access(self):
        """SuperAdmin can access announcements"""
        self.session.headers["Authorization"] = f"Bearer {TestNotificationModule.superadmin_token}"
        response = self.session.get(f"{BASE_URL}/api/notifications/announcements")
        assert response.status_code == 200, f"SuperAdmin failed to access announcements: {response.text}"
        
        data = response.json()
        assert "announcements" in data
        print(f"SuperAdmin can view {len(data['announcements'])} announcements")
    
    # ============ EDGE CASES ============
    
    def test_21_notifications_pagination(self):
        """Test notification pagination"""
        self.session.headers["Authorization"] = f"Bearer {TestNotificationModule.parent_token}"
        response = self.session.get(f"{BASE_URL}/api/notifications?page=1&limit=5")
        assert response.status_code == 200
        
        data = response.json()
        pagination = data["pagination"]
        assert pagination["page"] == 1
        assert pagination["limit"] == 5
        print(f"Pagination test: page={pagination['page']}, total={pagination['total']}, total_pages={pagination['total_pages']}")
    
    def test_22_notifications_filter_unread(self):
        """Test unread filter"""
        self.session.headers["Authorization"] = f"Bearer {TestNotificationModule.parent_token}"
        response = self.session.get(f"{BASE_URL}/api/notifications?unread_only=true")
        assert response.status_code == 200
        
        data = response.json()
        # All returned should be unread (if any)
        for notif in data["notifications"]:
            assert notif["is_read"] == False, "Found read notification in unread filter"
        print(f"Unread filter test: {len(data['notifications'])} unread notifications")
    
    def test_23_delete_nonexistent_notification(self):
        """Test deleting non-existent notification returns 404"""
        self.session.headers["Authorization"] = f"Bearer {TestNotificationModule.parent_token}"
        response = self.session.delete(f"{BASE_URL}/api/notifications/000000000000000000000000")
        assert response.status_code == 404, f"Expected 404 for non-existent notification, got {response.status_code}"
        print("Correctly returns 404 for non-existent notification")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
