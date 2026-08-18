import pytest
from app.database import SessionLocal
from app.models.platform import (
    Company, AIPlan, CompanyAISubscription, CompanyAIQuota
)

def test_seeded_data_exists():
    db = SessionLocal()
    try:
        plans = db.query(AIPlan).all()
        assert len(plans) >= 4
        plan_codes = [p.code for p in plans]
        assert "free" in plan_codes
        assert "professional" in plan_codes
    finally:
        db.close()

def test_company_onboarding_model():
    db = SessionLocal()
    try:
        comp = db.query(Company).filter(Company.company_id == "test-onboarding-comp").first()
        if not comp:
            comp = Company(
                application_id="umkm-pos",
                company_id="test-onboarding-comp",
                business_type="F&B / Coffee Shop",
                description="Test kafe kopi",
                is_onboarded=True
            )
            db.add(comp)
            db.commit()
            db.refresh(comp)

        assert comp.company_id == "test-onboarding-comp"
        assert comp.is_onboarded == True
        assert "Coffee Shop" in comp.business_type
    finally:
        db.close()
