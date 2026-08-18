import pytest
from app.database import SessionLocal
from app.services.quota_service import QuotaService, QuotaExceededException

def test_quota_reservation_and_commit():
    db = SessionLocal()
    app_id = "test_app_pos"
    comp_id = "test_comp_001"
    user_id = "test_user_mgr"

    try:
        # Reserve 500 tokens
        res_id = QuotaService.reserve_tokens(
            db=db,
            application_id=app_id,
            company_id=comp_id,
            user_id=user_id,
            estimated_tokens=500
        )
        assert res_id.startswith("res_")

        # Commit usage
        ledger = QuotaService.commit_usage(
            db=db,
            reservation_id=res_id,
            request_id="req_test_99",
            capability="business.assistant",
            provider="openai",
            model="gpt-4o-mini",
            input_tokens=100,
            output_tokens=50,
            actual_cost=0.0001
        )
        assert ledger.total_tokens == 150
        assert ledger.status == "success"
    finally:
        db.close()
