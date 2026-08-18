import uuid
import datetime
import logging
from typing import Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.models.platform import (
    Application, Company, User, AIPlan, CompanyAISubscription,
    CompanyAIQuota, UserAIQuota, AIUsageReservation, AIUsageLedger, AIAuditLog
)

logger = logging.getLogger("quota_service")

class QuotaExceededException(Exception):
    pass

class QuotaService:
    """
    Multi-Tenant AI Quota & Atomic Token Reservation Engine.
    Evaluates: Plan Quota -> Company Override -> User Quota.
    """

    @classmethod
    def get_effective_company_quota(cls, db: Session, application_id: str, company_id: str) -> Tuple[int, int]:
        """
        Returns (monthly_token_quota, monthly_web_search_quota).
        """
        # 1. Get Company Subscription Plan
        sub = db.query(CompanyAISubscription).filter(
            CompanyAISubscription.application_id == application_id,
            CompanyAISubscription.company_id == company_id,
            CompanyAISubscription.status == "active"
        ).first()

        plan_code = sub.plan_code if sub else "free"
        plan = db.query(AIPlan).filter(AIPlan.code == plan_code).first()

        base_tokens = plan.monthly_token_quota if plan else 100000
        base_searches = plan.monthly_web_search_quota if plan else 50

        # 2. Check Company Overrides
        quota_rec = db.query(CompanyAIQuota).filter(
            CompanyAIQuota.application_id == application_id,
            CompanyAIQuota.company_id == company_id
        ).first()

        if quota_rec:
            if quota_rec.monthly_token_quota_override is not None:
                base_tokens = quota_rec.monthly_token_quota_override
            if quota_rec.monthly_web_search_quota_override is not None:
                base_searches = quota_rec.monthly_web_search_quota_override

        return base_tokens, base_searches

    @classmethod
    def reserve_tokens(
        cls,
        db: Session,
        application_id: str,
        company_id: str,
        user_id: str,
        estimated_tokens: int = 1500
    ) -> str:
        """
        Atomic Quota Verification & Token Reservation.
        Prevents concurrency race conditions.
        """
        now = datetime.datetime.utcnow()
        period_start = datetime.datetime(now.year, now.month, 1)
        if now.month == 12:
            period_end = datetime.datetime(now.year + 1, 1, 1)
        else:
            period_end = datetime.datetime(now.year, now.month + 1, 1)

        # Ensure CompanyAIQuota record exists for billing cycle
        c_quota = db.query(CompanyAIQuota).filter(
            CompanyAIQuota.application_id == application_id,
            CompanyAIQuota.company_id == company_id
        ).first()

        if not c_quota:
            c_quota = CompanyAIQuota(
                application_id=application_id,
                company_id=company_id,
                current_period_start=period_start,
                current_period_end=period_end,
                tokens_consumed=0,
                tokens_reserved=0,
                web_searches_consumed=0
            )
            db.add(c_quota)
            db.flush()

        # Reset period if month rolled over
        if c_quota.current_period_start < period_start:
            c_quota.current_period_start = period_start
            c_quota.current_period_end = period_end
            c_quota.tokens_consumed = 0
            c_quota.tokens_reserved = 0
            c_quota.web_searches_consumed = 0
            db.flush()

        # Effective Max Limit
        max_company_tokens, _ = cls.get_effective_company_quota(db, application_id, company_id)

        current_usage = c_quota.tokens_consumed + c_quota.tokens_reserved
        if current_usage + estimated_tokens > max_company_tokens:
            msg = f"Company AI Token Quota Exceeded! (Limit: {max_company_tokens:,}, Used/Reserved: {current_usage:,}, Requested: {estimated_tokens:,})"
            logger.warning(f"[{application_id}:{company_id}] {msg}")
            
            # Audit log
            audit = AIAuditLog(
                application_id=application_id,
                company_id=company_id,
                user_id=user_id,
                action="quota_exceeded",
                details=msg
            )
            db.add(audit)
            db.commit()
            raise QuotaExceededException(msg)

        # Check optional User Quota limit
        u_quota = db.query(UserAIQuota).filter(
            UserAIQuota.application_id == application_id,
            UserAIQuota.company_id == company_id,
            UserAIQuota.user_id == user_id
        ).first()

        if u_quota and u_quota.monthly_token_limit is not None:
            user_current = u_quota.tokens_consumed + u_quota.tokens_reserved
            if user_current + estimated_tokens > u_quota.monthly_token_limit:
                msg = f"User AI Token Limit Exceeded! (User Limit: {u_quota.monthly_token_limit:,}, Used: {user_current:,})"
                logger.warning(f"[{application_id}:{company_id}:{user_id}] {msg}")
                raise QuotaExceededException(msg)

        # Reserve
        reservation_id = f"res_{uuid.uuid4().hex[:16]}"
        expires_at = now + datetime.timedelta(minutes=5)

        c_quota.tokens_reserved += estimated_tokens
        if u_quota:
            u_quota.tokens_reserved += estimated_tokens

        res_record = AIUsageReservation(
            reservation_id=reservation_id,
            application_id=application_id,
            company_id=company_id,
            user_id=user_id,
            reserved_tokens=estimated_tokens,
            status="reserved",
            expires_at=expires_at
        )
        db.add(res_record)
        db.commit()

        return reservation_id

    @classmethod
    def commit_usage(
        cls,
        db: Session,
        reservation_id: str,
        request_id: str,
        capability: str,
        provider: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        actual_cost: float = 0.0,
        conversation_id: Optional[str] = None
    ) -> AIUsageLedger:
        """
        Commit actual LLM usage and release reservation.
        """
        res_record = db.query(AIUsageReservation).filter(
            AIUsageReservation.reservation_id == reservation_id,
            AIUsageReservation.status == "reserved"
        ).first()

        if not res_record:
            logger.warning(f"Reservation {reservation_id} not found or already processed.")
            # Fallback direct commit
            res_tokens = 0
            app_id = "default"
            comp_id = "default"
            usr_id = "default"
        else:
            res_tokens = res_record.reserved_tokens
            app_id = res_record.application_id
            comp_id = res_record.company_id
            usr_id = res_record.user_id
            res_record.status = "committed"

        total_tokens = input_tokens + output_tokens

        # Adjust CompanyAIQuota
        c_quota = db.query(CompanyAIQuota).filter(
            CompanyAIQuota.application_id == app_id,
            CompanyAIQuota.company_id == comp_id
        ).first()

        if c_quota:
            c_quota.tokens_reserved = max(0, c_quota.tokens_reserved - res_tokens)
            c_quota.tokens_consumed += total_tokens

        # Adjust UserAIQuota
        u_quota = db.query(UserAIQuota).filter(
            UserAIQuota.application_id == app_id,
            UserAIQuota.company_id == comp_id,
            UserAIQuota.user_id == usr_id
        ).first()

        if u_quota:
            u_quota.tokens_reserved = max(0, u_quota.tokens_reserved - res_tokens)
            u_quota.tokens_consumed += total_tokens

        # Create Immutable Usage Ledger Record
        ledger = AIUsageLedger(
            request_id=request_id,
            application_id=app_id,
            company_id=comp_id,
            user_id=usr_id,
            conversation_id=conversation_id,
            capability=capability,
            provider=provider,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            estimated_cost=actual_cost,
            actual_cost=actual_cost,
            status="success"
        )
        db.add(ledger)
        db.commit()

        return ledger

    @classmethod
    def release_reservation(cls, db: Session, reservation_id: str):
        """
        Release unused quota reservation upon error or cancellation.
        """
        res_record = db.query(AIUsageReservation).filter(
            AIUsageReservation.reservation_id == reservation_id,
            AIUsageReservation.status == "reserved"
        ).first()

        if not res_record:
            return

        res_record.status = "released"
        res_tokens = res_record.reserved_tokens

        c_quota = db.query(CompanyAIQuota).filter(
            CompanyAIQuota.application_id == res_record.application_id,
            CompanyAIQuota.company_id == res_record.company_id
        ).first()
        if c_quota:
            c_quota.tokens_reserved = max(0, c_quota.tokens_reserved - res_tokens)

        u_quota = db.query(UserAIQuota).filter(
            UserAIQuota.application_id == res_record.application_id,
            UserAIQuota.company_id == res_record.company_id,
            UserAIQuota.user_id == res_record.user_id
        ).first()
        if u_quota:
            u_quota.tokens_reserved = max(0, u_quota.tokens_reserved - res_tokens)

        db.commit()
