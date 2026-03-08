#!/usr/bin/env python3
"""
Fee Reminder Cron Job Script
Run weekly (Every Monday at 9:00 AM) to send fee reminders to parents

Usage:
    python fee_reminder.py

Or add to crontab:
    0 9 * * 1 cd /app/backend && python cron/fee_reminder.py >> /var/log/fee_reminder.log 2>&1
"""
import os
import sys
import httpx
from datetime import datetime

# Configuration
API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8001")
CRON_SECRET_KEY = os.environ.get("CRON_SECRET_KEY", "mrsmku-cron-2026")

def send_fee_reminders():
    """Call the fee reminders API endpoint"""
    print(f"[{datetime.now().isoformat()}] Starting fee reminder job...")
    
    try:
        url = f"{API_BASE_URL}/api/cron/fee-reminders"
        params = {"cron_key": CRON_SECRET_KEY}
        
        with httpx.Client(timeout=60.0) as client:
            response = client.post(url, params=params)
            
        if response.status_code == 200:
            result = response.json()
            print(f"[{datetime.now().isoformat()}] SUCCESS: {result['message']}")
            print(f"  - Notifications sent: {result['notifications_sent']}")
            print(f"  - Parents notified: {result['parents_notified']}")
            return True
        else:
            print(f"[{datetime.now().isoformat()}] FAILED: HTTP {response.status_code}")
            print(f"  - Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"[{datetime.now().isoformat()}] ERROR: {str(e)}")
        return False

if __name__ == "__main__":
    success = send_fee_reminders()
    sys.exit(0 if success else 1)
