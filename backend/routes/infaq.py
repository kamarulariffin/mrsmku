"""
Infaq Slot Module - Sistem Derma Slot
Modul ini menguruskan kempen infaq berasaskan slot
"""
from datetime import datetime, timezone
from typing import Optional, List
from bson import ObjectId
import uuid


# ============ HELPER FUNCTIONS ============

def serialize_doc(doc):
    """Convert MongoDB document to JSON serializable format"""
    if doc is None:
        return None
    doc["id"] = str(doc.pop("_id"))
    return doc


# ============ CAMPAIGN MANAGEMENT ============

async def create_campaign(data: dict, db, current_user: dict):
    """Create a new infaq campaign"""
    campaign = {
        "title": data["title"],
        "description": data.get("description", ""),
        "image_url": data.get("image_url", ""),
        "total_slots": data["total_slots"],
        "slots_sold": 0,
        "price_per_slot": data["price_per_slot"],
        "min_slots": data.get("min_slots", 1),
        "max_slots": data.get("max_slots", 5000),
        "start_date": data.get("start_date"),
        "end_date": data.get("end_date"),
        "status": "active",  # active, paused, completed, cancelled
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    result = await db.infaq_campaigns.insert_one(campaign)
    campaign["id"] = str(result.inserted_id)
    if "_id" in campaign:
        del campaign["_id"]
    return campaign


async def get_campaigns(db, status: Optional[str] = None, limit: int = 50):
    """Get all infaq campaigns"""
    query = {}
    if status:
        query["status"] = status
    
    campaigns = []
    cursor = db.infaq_campaigns.find(query).sort("created_at", -1).limit(limit)
    
    async for doc in cursor:
        campaign = serialize_doc(doc)
        campaign["slots_available"] = campaign["total_slots"] - campaign["slots_sold"]
        campaign["total_collected"] = campaign["slots_sold"] * campaign["price_per_slot"]
        campaign["progress_percent"] = (campaign["slots_sold"] / campaign["total_slots"] * 100) if campaign["total_slots"] > 0 else 0
        campaigns.append(campaign)
    
    return campaigns


async def get_campaign(campaign_id: str, db):
    """Get single campaign with details"""
    campaign = await db.infaq_campaigns.find_one({"_id": ObjectId(campaign_id)})
    if not campaign:
        return None
    
    campaign = serialize_doc(campaign)
    campaign["slots_available"] = campaign["total_slots"] - campaign["slots_sold"]
    campaign["total_collected"] = campaign["slots_sold"] * campaign["price_per_slot"]
    campaign["progress_percent"] = (campaign["slots_sold"] / campaign["total_slots"] * 100) if campaign["total_slots"] > 0 else 0
    
    # Get recent donors
    recent_donors = []
    cursor = db.infaq_donations.find(
        {"campaign_id": campaign_id}
    ).sort("created_at", -1).limit(10)
    
    async for doc in cursor:
        donor = {
            "donor_name": doc.get("donor_name", "Tanpa Nama"),
            "slots": doc["slots"],
            "amount": doc["amount"],
            "message": doc.get("message"),
            "created_at": doc["created_at"].isoformat()
        }
        recent_donors.append(donor)
    
    campaign["recent_donors"] = recent_donors
    
    # Get total donor count
    donor_count = await db.infaq_donations.count_documents({"campaign_id": campaign_id})
    campaign["donor_count"] = donor_count
    
    return campaign


async def update_campaign(campaign_id: str, data: dict, db):
    """Update campaign"""
    update_data = {
        "updated_at": datetime.now(timezone.utc)
    }
    
    allowed_fields = ["title", "description", "image_url", "total_slots", "price_per_slot", 
                      "min_slots", "max_slots", "start_date", "end_date", "status"]
    
    for field in allowed_fields:
        if field in data:
            update_data[field] = data[field]
    
    result = await db.infaq_campaigns.update_one(
        {"_id": ObjectId(campaign_id)},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        return None
    
    return await get_campaign(campaign_id, db)


async def delete_campaign(campaign_id: str, db):
    """Delete campaign (soft delete by changing status)"""
    result = await db.infaq_campaigns.update_one(
        {"_id": ObjectId(campaign_id)},
        {"$set": {"status": "cancelled", "updated_at": datetime.now(timezone.utc)}}
    )
    return result.modified_count > 0


# ============ DONATION MANAGEMENT ============

async def make_donation(data: dict, db, current_user: dict):
    """Process a slot donation"""
    campaign_id = data["campaign_id"]
    slots = data["slots"]
    
    # Get campaign
    campaign = await db.infaq_campaigns.find_one({"_id": ObjectId(campaign_id)})
    if not campaign:
        raise ValueError("Kempen tidak dijumpai")
    
    if campaign["status"] != "active":
        raise ValueError("Kempen tidak aktif")
    
    slots_available = campaign["total_slots"] - campaign["slots_sold"]
    if slots > slots_available:
        raise ValueError(f"Slot tidak mencukupi. Baki: {slots_available}")
    
    if slots < campaign.get("min_slots", 1):
        raise ValueError(f"Minimum {campaign.get('min_slots', 1)} slot")
    
    if slots > campaign.get("max_slots", 5000):
        raise ValueError(f"Maksimum {campaign.get('max_slots', 5000)} slot")
    
    # Calculate amount
    amount = slots * campaign["price_per_slot"]
    
    # Determine donor name
    is_anonymous = data.get("is_anonymous", False)
    if is_anonymous:
        donor_name = "Penderma Tanpa Nama"
    else:
        # Get user's name
        user = await db.users.find_one({"_id": ObjectId(current_user["id"])})
        donor_name = user.get("full_name", "Penderma") if user else "Penderma"
    
    # Create donation record
    donation = {
        "campaign_id": campaign_id,
        "campaign_title": campaign["title"],
        "user_id": current_user["id"],
        "donor_name": donor_name,
        "is_anonymous": is_anonymous,
        "slots": slots,
        "price_per_slot": campaign["price_per_slot"],
        "amount": amount,
        "payment_method": data.get("payment_method", "fpx"),
        "payment_status": "completed",  # Mock payment
        "message": data.get("message"),
        "receipt_number": f"INF-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}",
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await db.infaq_donations.insert_one(donation)
    
    # Update campaign slots_sold
    await db.infaq_campaigns.update_one(
        {"_id": ObjectId(campaign_id)},
        {
            "$inc": {"slots_sold": slots},
            "$set": {"updated_at": datetime.now(timezone.utc)}
        }
    )
    
    # Check if campaign is now complete
    updated_campaign = await db.infaq_campaigns.find_one({"_id": ObjectId(campaign_id)})
    if updated_campaign["slots_sold"] >= updated_campaign["total_slots"]:
        await db.infaq_campaigns.update_one(
            {"_id": ObjectId(campaign_id)},
            {"$set": {"status": "completed"}}
        )
    
    donation["id"] = str(result.inserted_id)
    if "_id" in donation:
        del donation["_id"]
    return donation


async def get_my_donations(db, current_user: dict):
    """Get user's donation history"""
    donations = []
    cursor = db.infaq_donations.find(
        {"user_id": current_user["id"]}
    ).sort("created_at", -1)
    
    async for doc in cursor:
        donations.append(serialize_doc(doc))
    
    return donations


async def get_all_donations(db, campaign_id: Optional[str] = None):
    """Get all donations (admin)"""
    query = {}
    if campaign_id:
        query["campaign_id"] = campaign_id
    
    donations = []
    cursor = db.infaq_donations.find(query).sort("created_at", -1)
    
    async for doc in cursor:
        donations.append(serialize_doc(doc))
    
    return donations


async def get_infaq_stats(db):
    """Get overall infaq statistics"""
    # Total campaigns
    total_campaigns = await db.infaq_campaigns.count_documents({})
    active_campaigns = await db.infaq_campaigns.count_documents({"status": "active"})
    completed_campaigns = await db.infaq_campaigns.count_documents({"status": "completed"})
    
    # Total donations and amount
    pipeline = [
        {
            "$group": {
                "_id": None,
                "total_donations": {"$sum": 1},
                "total_amount": {"$sum": "$amount"},
                "total_slots": {"$sum": "$slots"}
            }
        }
    ]
    
    result = await db.infaq_donations.aggregate(pipeline).to_list(1)
    
    stats = {
        "total_campaigns": total_campaigns,
        "active_campaigns": active_campaigns,
        "completed_campaigns": completed_campaigns,
        "total_donations": result[0]["total_donations"] if result else 0,
        "total_amount": result[0]["total_amount"] if result else 0,
        "total_slots_sold": result[0]["total_slots"] if result else 0
    }
    
    # Unique donors
    unique_donors = await db.infaq_donations.distinct("user_id")
    stats["unique_donors"] = len(unique_donors)
    
    return stats


# ============ PUBLIC ENDPOINTS ============

async def get_public_campaigns(db, limit: int = 50):
    """Get public active campaigns"""
    campaigns = []
    cursor = db.infaq_campaigns.find({"status": "active"}).sort("created_at", -1).limit(limit)
    
    async for doc in cursor:
        campaign = serialize_doc(doc)
        campaign["slots_available"] = campaign["total_slots"] - campaign["slots_sold"]
        campaign["total_collected"] = campaign["slots_sold"] * campaign["price_per_slot"]
        campaign["progress_percent"] = (campaign["slots_sold"] / campaign["total_slots"] * 100) if campaign["total_slots"] > 0 else 0
        campaigns.append(campaign)
    
    return campaigns


async def get_public_campaign(campaign_id: str, db):
    """Get public campaign details"""
    return await get_campaign(campaign_id, db)


async def get_public_stats(db):
    """Get public statistics"""
    pipeline = [
        {"$match": {"status": {"$in": ["active", "completed"]}}},
        {
            "$group": {
                "_id": None,
                "total_collected": {"$sum": {"$multiply": ["$slots_sold", "$price_per_slot"]}},
                "total_slots_sold": {"$sum": "$slots_sold"}
            }
        }
    ]
    
    result = await db.infaq_campaigns.aggregate(pipeline).to_list(1)
    
    active_count = await db.infaq_campaigns.count_documents({"status": "active"})
    unique_donors = await db.infaq_donations.distinct("user_id")
    total_donations = await db.infaq_donations.count_documents({})
    
    return {
        "total_collected": result[0]["total_collected"] if result else 0,
        "total_slots_sold": result[0]["total_slots_sold"] if result else 0,
        "total_campaigns": active_count,
        "unique_donors": len(unique_donors),
        "total_donations": total_donations
    }
