import pytest
from app.database import SessionLocal
from app.models.platform import (
    Application, Company, User, AICapability, AIPlan,
    CompanyAISubscription, CompanyAIQuota, UserAIQuota, AIModelPricing
)

def test_seeded_data_exists():
    db = SessionLocal()
    try:
        caps = db.query(AICapability).all()
        assert len(caps) >= 6
        cap_codes = [c.code for c in caps]
        assert "biometric.face" in cap_codes
        assert "business.analyst" in cap_codes

        plans = db.query(AIPlan).all()
        assert len(plans) >= 4
        plan_codes = [p.code for p in plans]
        assert "free" in plan_codes
        assert "professional" in plan_codes

        pricings = db.query(AIModelPricing).all()
        assert len(pricings) >= 6
    finally:
        db.close()
