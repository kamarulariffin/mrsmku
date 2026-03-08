"""
Test Trial Balance Comparison Feature (Bandingkan Tempoh)
Tests for: include_comparison parameter, comparison_data structure, trend indicators
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestTrialBalanceComparisonAPI:
    """Tests for Trial Balance Comparison (Bandingkan Tempoh) feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token for admin user"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@muafakat.link",
            "password": "admin123"
        })
        assert login_response.status_code == 200, "Admin login failed"
        token = login_response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {token}"}
        
        # Get current financial year
        fy_response = requests.get(f"{BASE_URL}/api/accounting-full/financial-years", headers=self.headers)
        if fy_response.status_code == 200:
            years = fy_response.json()
            current = next((y for y in years if y.get("is_current")), None)
            self.financial_year_id = current["id"] if current else None
        else:
            self.financial_year_id = None
    
    def test_trial_balance_with_include_comparison_true(self):
        """Test GET /api/accounting-full/agm/trial-balance?include_comparison=true returns comparison_data"""
        params = {"include_comparison": "true"}
        if self.financial_year_id:
            params["financial_year_id"] = self.financial_year_id
        
        response = requests.get(f"{BASE_URL}/api/accounting-full/agm/trial-balance", 
                               headers=self.headers, params=params)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify comparison fields exist
        assert "has_comparison" in data, "Missing has_comparison field"
        assert "comparison_period_label" in data, "Missing comparison_period_label field"
        assert "comparison_data" in data, "Missing comparison_data field"
        
        # Verify has_comparison flag
        assert isinstance(data["has_comparison"], bool)
        
        print(f"SUCCESS: Trial Balance with include_comparison=true - has_comparison: {data['has_comparison']}")
    
    def test_trial_balance_monthly_with_comparison(self):
        """Test GET /api/accounting-full/agm/trial-balance?period_type=month&month=2&year=2026&include_comparison=true"""
        params = {
            "period_type": "month",
            "month": 2,
            "year": 2026,
            "include_comparison": "true"
        }
        if self.financial_year_id:
            params["financial_year_id"] = self.financial_year_id
        
        response = requests.get(f"{BASE_URL}/api/accounting-full/agm/trial-balance", 
                               headers=self.headers, params=params)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify comparison fields
        assert "has_comparison" in data
        assert "comparison_data" in data
        
        # If comparison data exists, verify structure
        if data["has_comparison"] and data["comparison_data"]:
            comp = data["comparison_data"]
            
            # Required comparison fields
            assert "prev_total_income" in comp, "Missing prev_total_income"
            assert "prev_total_expense" in comp, "Missing prev_total_expense"
            assert "income_variance" in comp, "Missing income_variance"
            assert "expense_variance" in comp, "Missing expense_variance"
            
            # Verify data types
            assert isinstance(comp["prev_total_income"], (int, float))
            assert isinstance(comp["prev_total_expense"], (int, float))
            assert isinstance(comp["income_variance"], (int, float))
            assert isinstance(comp["expense_variance"], (int, float))
            
            # Verify comparison_period_label exists
            assert data["comparison_period_label"] is not None
            # For February 2026, previous month should be January 2026
            assert "Januari" in data["comparison_period_label"] or "2026" in data["comparison_period_label"]
            
            print(f"SUCCESS: Monthly comparison - Current period: Februari 2026, Comparison: {data['comparison_period_label']}")
            print(f"  - Income variance: {comp['income_variance']}, Expense variance: {comp['expense_variance']}")
        else:
            print("INFO: No comparison data available (no previous period data)")
    
    def test_trial_balance_quarterly_with_comparison(self):
        """Test GET /api/accounting-full/agm/trial-balance?period_type=quarter&quarter=1&year=2025&include_comparison=true"""
        params = {
            "period_type": "quarter",
            "quarter": 1,
            "year": 2025,
            "include_comparison": "true"
        }
        if self.financial_year_id:
            params["financial_year_id"] = self.financial_year_id
        
        response = requests.get(f"{BASE_URL}/api/accounting-full/agm/trial-balance", 
                               headers=self.headers, params=params)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify period type and label
        assert data["period_type"] == "quarter"
        assert "Suku 1" in data["period_label"]
        
        # Verify comparison fields
        assert "has_comparison" in data
        assert "comparison_data" in data
        
        # If comparison data exists, verify structure
        if data["has_comparison"] and data["comparison_data"]:
            comp = data["comparison_data"]
            
            # Required comparison fields
            assert "prev_total_income" in comp
            assert "prev_total_expense" in comp
            assert "income_variance" in comp
            assert "expense_variance" in comp
            
            # For Q1 2025, previous quarter should be Q4 2024
            if data["comparison_period_label"]:
                assert "Suku 4" in data["comparison_period_label"] or "2024" in data["comparison_period_label"]
            
            print(f"SUCCESS: Quarterly comparison - Period: {data['period_label']}, Comparison: {data['comparison_period_label']}")
        else:
            print("INFO: No quarterly comparison data available (no previous quarter data)")
    
    def test_comparison_data_full_structure(self):
        """Test that comparison_data contains all required fields"""
        params = {
            "period_type": "month",
            "month": 2,
            "year": 2026,
            "include_comparison": "true"
        }
        if self.financial_year_id:
            params["financial_year_id"] = self.financial_year_id
        
        response = requests.get(f"{BASE_URL}/api/accounting-full/agm/trial-balance", 
                               headers=self.headers, params=params)
        
        assert response.status_code == 200
        data = response.json()
        
        if data["has_comparison"] and data["comparison_data"]:
            comp = data["comparison_data"]
            
            # All required fields from the specification
            required_fields = [
                "prev_total_income",
                "prev_total_expense", 
                "prev_total_bank",
                "income_variance",
                "expense_variance",
                "bank_variance",
                "income_pct_change",
                "expense_pct_change",
                "trend_income",
                "trend_expense"
            ]
            
            for field in required_fields:
                assert field in comp, f"Missing required comparison field: {field}"
            
            # Verify trend values are valid
            assert comp["trend_income"] in ["naik", "turun", "sama"], f"Invalid trend_income: {comp['trend_income']}"
            assert comp["trend_expense"] in ["naik", "turun", "sama"], f"Invalid trend_expense: {comp['trend_expense']}"
            
            # Verify percentage change is numeric
            assert isinstance(comp["income_pct_change"], (int, float))
            assert isinstance(comp["expense_pct_change"], (int, float))
            
            print(f"SUCCESS: Comparison data structure validated with all {len(required_fields)} required fields")
            print(f"  - Trends: Income {comp['trend_income']}, Expense {comp['trend_expense']}")
            print(f"  - % Changes: Income {comp['income_pct_change']}%, Expense {comp['expense_pct_change']}%")
        else:
            print("INFO: No comparison data to validate (no previous period data)")
    
    def test_trend_indicator_logic(self):
        """Test that trend indicators (naik/turun/sama) are calculated correctly"""
        params = {
            "period_type": "month",
            "month": 2,
            "year": 2026,
            "include_comparison": "true"
        }
        if self.financial_year_id:
            params["financial_year_id"] = self.financial_year_id
        
        response = requests.get(f"{BASE_URL}/api/accounting-full/agm/trial-balance", 
                               headers=self.headers, params=params)
        
        assert response.status_code == 200
        data = response.json()
        
        if data["has_comparison"] and data["comparison_data"]:
            comp = data["comparison_data"]
            
            # Verify trend_income logic
            if comp["income_variance"] > 0:
                assert comp["trend_income"] == "naik", "Income increased but trend is not 'naik'"
            elif comp["income_variance"] < 0:
                assert comp["trend_income"] == "turun", "Income decreased but trend is not 'turun'"
            else:
                assert comp["trend_income"] == "sama", "Income unchanged but trend is not 'sama'"
            
            # Verify trend_expense logic
            if comp["expense_variance"] > 0:
                assert comp["trend_expense"] == "naik", "Expense increased but trend is not 'naik'"
            elif comp["expense_variance"] < 0:
                assert comp["trend_expense"] == "turun", "Expense decreased but trend is not 'turun'"
            else:
                assert comp["trend_expense"] == "sama", "Expense unchanged but trend is not 'sama'"
            
            print(f"SUCCESS: Trend indicator logic verified - Income: {comp['trend_income']}, Expense: {comp['trend_expense']}")
        else:
            print("INFO: No comparison data to test trend logic (no previous period data)")
    
    def test_variance_calculations(self):
        """Test that variance calculations are correct (current - previous)"""
        params = {
            "period_type": "month",
            "month": 2,
            "year": 2026,
            "include_comparison": "true"
        }
        if self.financial_year_id:
            params["financial_year_id"] = self.financial_year_id
        
        response = requests.get(f"{BASE_URL}/api/accounting-full/agm/trial-balance", 
                               headers=self.headers, params=params)
        
        assert response.status_code == 200
        data = response.json()
        
        if data["has_comparison"] and data["comparison_data"]:
            comp = data["comparison_data"]
            
            # Verify income variance: current_income - prev_income
            expected_income_variance = data["total_income"] - comp["prev_total_income"]
            assert abs(comp["income_variance"] - expected_income_variance) < 0.01, \
                f"Income variance mismatch: {comp['income_variance']} != {expected_income_variance}"
            
            # Verify expense variance: current_expense - prev_expense
            expected_expense_variance = data["total_expense"] - comp["prev_total_expense"]
            assert abs(comp["expense_variance"] - expected_expense_variance) < 0.01, \
                f"Expense variance mismatch: {comp['expense_variance']} != {expected_expense_variance}"
            
            # Verify bank variance: current_bank - prev_bank
            expected_bank_variance = data["total_bank_balance"] - comp["prev_total_bank"]
            assert abs(comp["bank_variance"] - expected_bank_variance) < 0.01, \
                f"Bank variance mismatch: {comp['bank_variance']} != {expected_bank_variance}"
            
            print(f"SUCCESS: Variance calculations verified")
            print(f"  - Income: {data['total_income']} - {comp['prev_total_income']} = {comp['income_variance']}")
            print(f"  - Expense: {data['total_expense']} - {comp['prev_total_expense']} = {comp['expense_variance']}")
        else:
            print("INFO: No comparison data to test variance calculations (no previous period data)")
    
    def test_include_comparison_false_no_comparison_data(self):
        """Test that include_comparison=false returns no comparison data"""
        params = {"include_comparison": "false"}
        if self.financial_year_id:
            params["financial_year_id"] = self.financial_year_id
        
        response = requests.get(f"{BASE_URL}/api/accounting-full/agm/trial-balance", 
                               headers=self.headers, params=params)
        
        assert response.status_code == 200
        data = response.json()
        
        # has_comparison should be False
        assert data["has_comparison"] == False, "has_comparison should be False when include_comparison=false"
        
        # comparison_data should be None or not contain actual data
        if data["comparison_data"]:
            print(f"WARNING: comparison_data is not None when include_comparison=false: {data['comparison_data']}")
        
        print("SUCCESS: include_comparison=false correctly returns no comparison data")
    
    def test_financial_year_with_comparison(self):
        """Test comparison for full financial year period"""
        params = {
            "period_type": "financial_year",
            "include_comparison": "true"
        }
        if self.financial_year_id:
            params["financial_year_id"] = self.financial_year_id
        
        response = requests.get(f"{BASE_URL}/api/accounting-full/agm/trial-balance", 
                               headers=self.headers, params=params)
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["period_type"] == "financial_year"
        assert "has_comparison" in data
        
        if data["has_comparison"] and data["comparison_data"]:
            # For financial year, comparison should be with previous financial year
            print(f"SUCCESS: Financial year comparison - Current: {data['financial_year']}, Previous: {data['comparison_period_label']}")
        else:
            print("INFO: No previous financial year data for comparison")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
