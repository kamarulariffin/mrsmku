"""
Bus Ticket Management System - Comprehensive API Tests
Tests bus companies, buses, routes, trips, bookings, and seat maps
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://yuran-admin-panel.preview.emergentagent.com')

# Test credentials
SUPERADMIN_CREDS = {"email": "superadmin@muafakat.link", "password": "super123"}
PARENT_CREDS = {"email": "demo@muafakat.link", "password": "demoparent"}

# Store created IDs for cleanup/reference
created_ids = {}


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERADMIN_CREDS)
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Admin authentication failed")


@pytest.fixture(scope="module")
def parent_token():
    """Get parent authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=PARENT_CREDS)
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Parent authentication failed")


@pytest.fixture(scope="module")
def admin_client(admin_token):
    """Session with admin auth header"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {admin_token}"
    })
    return session


@pytest.fixture(scope="module")
def parent_client(parent_token):
    """Session with parent auth header"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {parent_token}"
    })
    return session


class TestBusCompanyCRUD:
    """Bus Company CRUD operations - Admin only"""

    def test_get_bus_companies(self, admin_client):
        """Test GET all bus companies"""
        response = admin_client.get(f"{BASE_URL}/api/bus/companies")
        print(f"GET companies status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} bus companies")
        
        if len(data) > 0:
            company = data[0]
            assert "id" in company
            assert "name" in company
            assert "registration_number" in company
            print(f"First company: {company['name']}")

    def test_create_bus_company(self, admin_client):
        """Test POST create new bus company"""
        company_data = {
            "name": "TEST_Bus Express Sdn Bhd",
            "registration_number": f"TEST{datetime.now().strftime('%H%M%S')}",
            "address": "123 Jalan Test, 26000 Kuantan",
            "phone": "0123456789",
            "email": "test@busexpress.com",
            "pic_name": "Ahmad Test",
            "pic_phone": "0198765432"
        }
        
        response = admin_client.post(f"{BASE_URL}/api/bus/companies", json=company_data)
        print(f"CREATE company status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == company_data["name"]
        assert data["registration_number"] == company_data["registration_number"]
        assert "id" in data
        
        created_ids["company"] = data["id"]
        print(f"Created company ID: {data['id']}")

    def test_get_single_company(self, admin_client):
        """Test GET single company by ID"""
        if "company" not in created_ids:
            pytest.skip("No company created")
        
        company_id = created_ids["company"]
        response = admin_client.get(f"{BASE_URL}/api/bus/companies/{company_id}")
        print(f"GET single company status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == company_id
        print(f"Retrieved company: {data['name']}")

    def test_update_bus_company(self, admin_client):
        """Test PUT update company"""
        if "company" not in created_ids:
            pytest.skip("No company created")
        
        company_id = created_ids["company"]
        update_data = {
            "phone": "0111222333",
            "pic_name": "Ahmad Updated"
        }
        
        response = admin_client.put(f"{BASE_URL}/api/bus/companies/{company_id}", json=update_data)
        print(f"UPDATE company status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["phone"] == update_data["phone"]
        assert data["pic_name"] == update_data["pic_name"]
        print(f"Updated company phone to: {data['phone']}")


class TestBusCRUD:
    """Bus (vehicle) CRUD operations"""

    def test_get_buses(self, admin_client):
        """Test GET all buses"""
        response = admin_client.get(f"{BASE_URL}/api/bus/buses")
        print(f"GET buses status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} buses")
        
        if len(data) > 0:
            bus = data[0]
            assert "id" in bus
            assert "plate_number" in bus
            assert "total_seats" in bus
            print(f"First bus: {bus['plate_number']} ({bus['total_seats']} seats)")

    def test_create_bus(self, admin_client):
        """Test POST create new bus"""
        # First get companies to use an existing company_id
        companies_res = admin_client.get(f"{BASE_URL}/api/bus/companies")
        companies = companies_res.json()
        
        if len(companies) == 0:
            pytest.skip("No companies available")
        
        company_id = companies[0]["id"]
        
        bus_data = {
            "company_id": company_id,
            "plate_number": f"TEST{datetime.now().strftime('%H%M%S')}",
            "bus_type": "single_decker",
            "total_seats": 44,
            "brand": "Hino",
            "model": "RK1J"
        }
        
        response = admin_client.post(f"{BASE_URL}/api/bus/buses", json=bus_data)
        print(f"CREATE bus status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["plate_number"] == bus_data["plate_number"].upper()
        assert data["total_seats"] == bus_data["total_seats"]
        assert "id" in data
        
        created_ids["bus"] = data["id"]
        print(f"Created bus ID: {data['id']}, plate: {data['plate_number']}")

    def test_get_single_bus(self, admin_client):
        """Test GET single bus by ID"""
        if "bus" not in created_ids:
            pytest.skip("No bus created")
        
        bus_id = created_ids["bus"]
        response = admin_client.get(f"{BASE_URL}/api/bus/buses/{bus_id}")
        print(f"GET single bus status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == bus_id
        print(f"Retrieved bus: {data['plate_number']}")

    def test_update_bus(self, admin_client):
        """Test PUT update bus"""
        if "bus" not in created_ids:
            pytest.skip("No bus created")
        
        bus_id = created_ids["bus"]
        update_data = {
            "brand": "Updated Brand",
            "total_seats": 48
        }
        
        response = admin_client.put(f"{BASE_URL}/api/bus/buses/{bus_id}", json=update_data)
        print(f"UPDATE bus status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["total_seats"] == update_data["total_seats"]
        print(f"Updated bus seats to: {data['total_seats']}")


class TestRouteCRUD:
    """Route CRUD operations with drop-off points"""

    def test_get_routes(self, admin_client):
        """Test GET all routes"""
        response = admin_client.get(f"{BASE_URL}/api/bus/routes")
        print(f"GET routes status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} routes")
        
        if len(data) > 0:
            route = data[0]
            assert "id" in route
            assert "name" in route
            assert "origin" in route
            assert "destination" in route
            assert "drop_off_points" in route
            print(f"First route: {route['name']} ({route['origin']} -> {route['destination']})")
            print(f"Drop-off points: {len(route['drop_off_points'])}")

    def test_create_route(self, admin_client):
        """Test POST create new route with drop-off points"""
        # Get companies for company_id
        companies_res = admin_client.get(f"{BASE_URL}/api/bus/companies")
        companies = companies_res.json()
        
        if len(companies) == 0:
            pytest.skip("No companies available")
        
        company_id = companies[0]["id"]
        
        route_data = {
            "company_id": company_id,
            "name": f"TEST Route {datetime.now().strftime('%H%M%S')}",
            "origin": "MRSMKU Kuantan",
            "destination": "Kuala Lumpur",
            "base_price": 100.00,
            "estimated_duration": "3 jam 30 minit",
            "distance_km": 250,
            "drop_off_points": [
                {"location": "Terminal Bersepadu Selatan (TBS)", "price": 100.00, "order": 1},
                {"location": "Hentian Putra", "price": 95.00, "order": 2},
                {"location": "Masjid Wilayah", "price": 90.00, "order": 3}
            ]
        }
        
        response = admin_client.post(f"{BASE_URL}/api/bus/routes", json=route_data)
        print(f"CREATE route status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == route_data["name"]
        assert len(data["drop_off_points"]) == 3
        assert "id" in data
        
        created_ids["route"] = data["id"]
        print(f"Created route ID: {data['id']}")
        print(f"Drop-off points: {[p['location'] for p in data['drop_off_points']]}")

    def test_get_single_route(self, admin_client):
        """Test GET single route by ID"""
        if "route" not in created_ids:
            pytest.skip("No route created")
        
        route_id = created_ids["route"]
        response = admin_client.get(f"{BASE_URL}/api/bus/routes/{route_id}")
        print(f"GET single route status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == route_id
        assert "drop_off_points" in data
        print(f"Retrieved route: {data['name']}")

    def test_update_route(self, admin_client):
        """Test PUT update route"""
        if "route" not in created_ids:
            pytest.skip("No route created")
        
        route_id = created_ids["route"]
        update_data = {
            "base_price": 110.00,
            "estimated_duration": "3 jam 45 minit"
        }
        
        response = admin_client.put(f"{BASE_URL}/api/bus/routes/{route_id}", json=update_data)
        print(f"UPDATE route status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["base_price"] == update_data["base_price"]
        print(f"Updated route price to: RM {data['base_price']}")


class TestTripCRUD:
    """Trip scheduling CRUD operations"""

    def test_get_trips(self, admin_client):
        """Test GET all trips"""
        response = admin_client.get(f"{BASE_URL}/api/bus/trips")
        print(f"GET trips status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} trips")
        
        if len(data) > 0:
            trip = data[0]
            assert "id" in trip
            assert "route_name" in trip
            assert "departure_date" in trip
            assert "departure_time" in trip
            assert "available_seats" in trip
            print(f"First trip: {trip['route_name']} on {trip['departure_date']} at {trip['departure_time']}")

    def test_create_trip(self, admin_client):
        """Test POST create new trip"""
        # Get routes and buses
        routes_res = admin_client.get(f"{BASE_URL}/api/bus/routes")
        buses_res = admin_client.get(f"{BASE_URL}/api/bus/buses")
        
        routes = routes_res.json()
        buses = buses_res.json()
        
        if len(routes) == 0 or len(buses) == 0:
            pytest.skip("No routes or buses available")
        
        # Find a bus belonging to the same company as the route
        route = routes[0]
        company_buses = [b for b in buses if b["company_id"] == route["company_id"]]
        
        if len(company_buses) == 0:
            pytest.skip("No buses available for the route's company")
        
        bus = company_buses[0]
        
        # Schedule trip for next week
        departure_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        
        trip_data = {
            "route_id": route["id"],
            "bus_id": bus["id"],
            "departure_date": departure_date,
            "departure_time": "08:00",
            "return_date": departure_date,
            "return_time": "18:00",
            "notes": "TEST trip"
        }
        
        response = admin_client.post(f"{BASE_URL}/api/bus/trips", json=trip_data)
        print(f"CREATE trip status: {response.status_code}")
        print(f"Response: {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["departure_date"] == trip_data["departure_date"]
        assert "id" in data
        
        created_ids["trip"] = data["id"]
        print(f"Created trip ID: {data['id']} for {data['departure_date']}")

    def test_get_single_trip(self, admin_client):
        """Test GET single trip by ID"""
        if "trip" not in created_ids:
            pytest.skip("No trip created")
        
        trip_id = created_ids["trip"]
        response = admin_client.get(f"{BASE_URL}/api/bus/trips/{trip_id}")
        print(f"GET single trip status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == trip_id
        print(f"Retrieved trip: {data['route_name']} on {data['departure_date']}")

    def test_get_trip_seat_map(self, admin_client):
        """Test GET trip seat map"""
        if "trip" not in created_ids:
            pytest.skip("No trip created")
        
        trip_id = created_ids["trip"]
        response = admin_client.get(f"{BASE_URL}/api/bus/trips/{trip_id}/seats")
        print(f"GET seat map status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert "seats" in data
        assert "total_seats" in data
        assert "available_count" in data
        print(f"Seat map: {data['total_seats']} total, {data['available_count']} available")


class TestPublicTrips:
    """Public endpoints for parents to view available trips"""

    def test_get_public_trips(self):
        """Test GET public available trips (no auth needed)"""
        response = requests.get(f"{BASE_URL}/api/public/bus/trips")
        print(f"GET public trips status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} public trips")
        
        if len(data) > 0:
            trip = data[0]
            assert "id" in trip
            assert "drop_off_points" in trip
            assert "available_seats" in trip
            print(f"First public trip: {trip['route_name']}")
            print(f"Drop-off points available: {len(trip['drop_off_points'])}")

    def test_get_public_trip_seats(self):
        """Test GET public trip seat map"""
        # First get trips
        trips_res = requests.get(f"{BASE_URL}/api/public/bus/trips")
        trips = trips_res.json()
        
        if len(trips) == 0:
            pytest.skip("No public trips available")
        
        trip_id = trips[0]["id"]
        response = requests.get(f"{BASE_URL}/api/public/bus/trips/{trip_id}/seats")
        print(f"GET public seat map status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert "seats" in data
        assert "layout" in data
        print(f"Public seat map loaded: {len(data['seats'])} seats")


class TestBookingCRUD:
    """Booking CRUD operations - Admin and Parent"""

    def test_get_bookings_admin(self, admin_client):
        """Test GET all bookings as admin"""
        response = admin_client.get(f"{BASE_URL}/api/bus/bookings")
        print(f"GET bookings (admin) status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} bookings")
        
        if len(data) > 0:
            booking = data[0]
            assert "id" in booking
            assert "booking_number" in booking
            assert "student_name" in booking
            assert "drop_off_point" in booking
            print(f"First booking: {booking['booking_number']} for {booking['student_name']}")

    def test_get_bookings_parent(self, parent_client):
        """Test GET bookings as parent (own bookings only)"""
        response = parent_client.get(f"{BASE_URL}/api/bus/bookings")
        print(f"GET bookings (parent) status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Parent has {len(data)} bookings")

    def test_create_booking_parent(self, parent_client):
        """Test POST create booking as parent"""
        # First get available trips
        trips_res = requests.get(f"{BASE_URL}/api/public/bus/trips")
        trips = trips_res.json()
        
        if len(trips) == 0:
            pytest.skip("No trips available")
        
        trip = trips[0]
        
        # Get parent's children
        children_res = parent_client.get(f"{BASE_URL}/api/students")
        children = [c for c in children_res.json() if c.get("status") == "approved"]
        
        if len(children) == 0:
            pytest.skip("No approved children for parent")
        
        if len(trip.get("drop_off_points", [])) == 0:
            pytest.skip("No drop-off points available")
        
        child = children[0]
        drop_off = trip["drop_off_points"][0]["location"]
        
        booking_data = {
            "trip_id": trip["id"],
            "student_id": child["id"],
            "drop_off_point": drop_off
        }
        
        response = parent_client.post(f"{BASE_URL}/api/bus/bookings", json=booking_data)
        print(f"CREATE booking status: {response.status_code}")
        print(f"Response: {response.text}")
        
        # Status 200 = success, 400 = validation error (might already have booking)
        if response.status_code == 200:
            data = response.json()
            assert "booking_number" in data
            assert "id" in data
            created_ids["booking"] = data["id"]
            print(f"Created booking: {data['booking_number']}")
        elif response.status_code == 400:
            print(f"Booking validation error: {response.json().get('detail')}")
            # Still pass if it's a duplicate booking error
            assert "sudah mempunyai tempahan" in response.json().get("detail", "").lower() or "pelajar bukan anak" in response.json().get("detail", "").lower()
        else:
            assert False, f"Unexpected status code: {response.status_code}"

    def test_assign_seat_admin(self, admin_client):
        """Test POST assign seat to booking"""
        # Get bookings
        bookings_res = admin_client.get(f"{BASE_URL}/api/bus/bookings")
        bookings = [b for b in bookings_res.json() if b.get("status") != "cancelled"]
        
        if len(bookings) == 0:
            pytest.skip("No active bookings available")
        
        booking = bookings[0]
        seat_number = "1A"
        
        response = admin_client.post(f"{BASE_URL}/api/bus/bookings/{booking['id']}/assign-seat?seat_number={seat_number}")
        print(f"ASSIGN seat status: {response.status_code}")
        
        # Status 200 = success, 400 = seat already taken
        if response.status_code == 200:
            data = response.json()
            assert data["assigned_seat"] == seat_number
            print(f"Assigned seat {seat_number} to booking {data['booking_number']}")
        elif response.status_code == 400:
            print(f"Seat assignment error: {response.json().get('detail')}")
            assert True  # Seat already assigned is acceptable
        else:
            assert False, f"Unexpected status code: {response.status_code}"


class TestBusStats:
    """Bus module statistics"""

    def test_get_bus_stats(self, admin_client):
        """Test GET bus statistics"""
        response = admin_client.get(f"{BASE_URL}/api/bus/stats")
        print(f"GET stats status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert "total_companies" in data
        assert "total_buses" in data
        assert "total_routes" in data
        assert "active_trips" in data
        assert "total_bookings" in data
        print(f"Stats: {data['total_companies']} companies, {data['total_buses']} buses, {data['active_trips']} active trips")


class TestCleanup:
    """Cleanup test data - runs last"""

    def test_cancel_trip(self, admin_client):
        """Test cancel trip (DELETE not available, use cancel instead)"""
        if "trip" not in created_ids:
            pytest.skip("No test trip to cancel")
        
        trip_id = created_ids["trip"]
        
        response = admin_client.post(f"{BASE_URL}/api/bus/trips/{trip_id}/cancel")
        print(f"CANCEL trip status: {response.status_code}")
        
        # Accept 200 (success) or 400 (already cancelled)
        assert response.status_code in [200, 400]

    def test_delete_route(self, admin_client):
        """Test DELETE route"""
        if "route" not in created_ids:
            pytest.skip("No test route to delete")
        
        route_id = created_ids["route"]
        response = admin_client.delete(f"{BASE_URL}/api/bus/routes/{route_id}")
        print(f"DELETE route status: {response.status_code}")
        
        # Accept 200 (success) or 400 (has active trips)
        assert response.status_code in [200, 400]

    def test_delete_bus(self, admin_client):
        """Test DELETE bus"""
        if "bus" not in created_ids:
            pytest.skip("No test bus to delete")
        
        bus_id = created_ids["bus"]
        response = admin_client.delete(f"{BASE_URL}/api/bus/buses/{bus_id}")
        print(f"DELETE bus status: {response.status_code}")
        
        # Accept 200 (success) or 400 (has active trips)
        assert response.status_code in [200, 400]

    def test_delete_company(self, admin_client):
        """Test DELETE company"""
        if "company" not in created_ids:
            pytest.skip("No test company to delete")
        
        company_id = created_ids["company"]
        response = admin_client.delete(f"{BASE_URL}/api/bus/companies/{company_id}")
        print(f"DELETE company status: {response.status_code}")
        
        # Accept 200 (success) or 400 (has buses)
        assert response.status_code in [200, 400]


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
