# Server.py Refactoring Guide

## Overview
This document provides guidance on the ongoing refactoring effort to break down the monolithic `server.py` file into smaller, more manageable route modules.

## Current State
- **server.py**: 8496 lines (original, all routes still active)
- **New route files created**: 7 files (1865 lines total, NOT ACTIVE yet)

## New Route Files (Prepared but NOT Active)

The following route files have been created in `/app/backend/routes/` and are ready for future activation:

| File | Description | Lines | Original Location |
|------|-------------|-------|-------------------|
| `users.py` | User management (CRUD) | 400 | Lines 2253-2422 in server.py |
| `dashboard.py` | Dashboard endpoints for all roles | 312 | Lines 4250-4499 in server.py |
| `fees.py` | Fee structure and management | 248 | Lines 3828-4010 in server.py |
| `payments.py` | Payment processing | 147 | Lines 4011-4090 in server.py |
| `reports.py` | Fee and collection reports | 86 | Lines 5626-5678 in server.py |
| `hostel.py` | Hostel module (checkout/checkin, pulang bermalam) | 483 | Lines 5679-6076 in server.py |
| `sickbay.py` | Sickbay management | 189 | Lines 6077-6218 in server.py |

## How to Activate New Routes

To activate a new route file (e.g., `users.py`):

### Step 1: Import the route in server.py
```python
from routes import users as users_routes
```

### Step 2: Initialize the router
Add after other router initializations:
```python
users_routes.init_router(
    get_db,           # Database getter function
    get_current_user, # Auth function (passes credentials)
    serialize_user,   # User serialization function
    log_audit,        # Audit logging function
    pwd_context,      # Password context
    ROLES,            # Role definitions
    generate_user_qr_code_data,  # QR code data generator
    generate_qr_code_image       # QR code image generator
)
app.include_router(users_routes.router)
```

### Step 3: Comment out/remove duplicate routes in server.py
Remove or comment out the corresponding routes in server.py (lines 2253-2422 for users).

### Step 4: Test thoroughly
Ensure all functionality works correctly before committing changes.

## Important Notes

1. **Dependency Injection Pattern**: New route files use the same pattern as existing routes (e.g., `yuran.py`):
   - HTTPBearer for authentication
   - Wrapper function `get_current_user` that calls the injected auth function
   - Global variables for dependencies set via `init_router()`

2. **Role Checking**: Each route performs its own role checking instead of using `require_roles()` wrapper.

3. **Backward Compatibility**: Routes maintain the same API endpoints and response formats.

## Recommended Migration Order

1. `reports.py` (smallest, lowest risk)
2. `payments.py` (simple, few dependencies)
3. `fees.py` (moderate complexity)
4. `sickbay.py` (standalone module)
5. `hostel.py` (includes pulang bermalam)
6. `dashboard.py` (multiple role dashboards)
7. `users.py` (core functionality, migrate last)

## Testing Checklist

Before activating each route:
- [ ] All API endpoints return correct responses
- [ ] Authentication works properly
- [ ] Role-based access control is enforced
- [ ] Database operations complete successfully
- [ ] Audit logging works
- [ ] No duplicate route conflicts

## Future Work

After all routes are migrated:
1. Remove empty/commented sections from server.py
2. server.py should contain only:
   - App configuration
   - Database connection
   - Authentication functions
   - Router initialization/includes
   - Health check endpoint

Estimated final server.py size: ~1500-2000 lines (down from 8496)
