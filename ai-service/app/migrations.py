"""
Standalone Migration Manager for AI Platform Microservice.
Ensures zero-dependency, self-contained database migrations for MySQL / SQLite.
"""

import logging
from sqlalchemy import inspect, text
from sqlalchemy.orm import sessionmaker
from app.database import engine, Base

# Import all active ORM models
from app.models.biometrics import FaceEmbedding, FingerprintTemplate
from app.models.platform import (
    Company, AIPlan, CompanyAISubscription, CompanyAIQuota,
    CompanyAIProviderKey, AIUsageLedger, AIUsageReservation,
    AIConversation, AIMessage, AIDataAccessLog
)

logger = logging.getLogger("ai_migrations")
SessionLocal = sessionmaker(bind=engine)

def seed_initial_data():
    db = SessionLocal()
    try:
        # Seed Standard AI Subscription Plans
        default_plans = [
            ("free", "Free Plan", 100000, 50, 0.0),
            ("basic", "Basic Plan", 500000, 200, 15.0),
            ("professional", "Professional Plan", 2000000, 1000, 50.0),
            ("enterprise", "Enterprise Plan", 20000000, 10000, 200.0),
        ]
        for code, name, t_quota, w_quota, price in default_plans:
            existing_plan = db.query(AIPlan).filter(AIPlan.code == code).first()
            if not existing_plan:
                db.add(AIPlan(code=code, name=name, monthly_token_quota=t_quota, monthly_web_search_quota=w_quota, price_monthly=price, is_active=True))
        db.commit()
        logger.info("Ensured AI plans seeded.")

    except Exception as e:
        db.rollback()
        logger.error(f"Error seeding initial data: {str(e)}")
    finally:
        db.close()

def run_migrations():
    logger.info("Running standalone AI Platform database migrations...")
    
    # 1. Clean up / drop obsolete tables if they exist
    inspector = inspect(engine)
    obsolete_tables = [
        "users", "user_ai_quotas", "ai_audit_logs", "ai_model_pricing",
        "applications", "ai_tool_registry", "ai_capabilities"
    ]
    
    with engine.begin() as conn:
        for t in obsolete_tables:
            if inspector.has_table(t):
                logger.info(f"Dropping obsolete table: {t}")
                conn.execute(text(f"DROP TABLE IF EXISTS `{t}`;"))
    
    # 2. Ensure all active tables exist in MySQL
    Base.metadata.create_all(bind=engine)
    
    # 3. Column-level migrations for biometrics & logs
    with engine.begin() as conn:
        for table_name in ["face_embeddings", "fingerprint_templates"]:
            if not inspector.has_table(table_name):
                continue
                
            columns = {col["name"] for col in inspector.get_columns(table_name)}
            
            if "company_key" not in columns:
                logger.info(f"Adding column company_key to table {table_name}")
                conn.execute(text(f"ALTER TABLE `{table_name}` ADD COLUMN `company_key` VARCHAR(120) NULL DEFAULT 'IFresso-Coffee' AFTER `id`;"))
            
            if "user_key" not in columns:
                logger.info(f"Adding column user_key to table {table_name}")
                conn.execute(text(f"ALTER TABLE `{table_name}` ADD COLUMN `user_key` VARCHAR(120) NULL DEFAULT NULL AFTER `company_key`;"))
            
            for legacy_col in ["tenant_id", "company_id", "user_id"]:
                if legacy_col in columns:
                    logger.info(f"Dropping legacy column {legacy_col} from table {table_name}")
                    try:
                        conn.execute(text(f"ALTER TABLE `{table_name}` DROP COLUMN `{legacy_col}`;"))
                    except Exception as e:
                        logger.warning(f"Could not drop legacy column {legacy_col}: {str(e)}")

        if inspector.has_table("ai_data_access_logs"):
            log_cols = {col["name"] for col in inspector.get_columns("ai_data_access_logs")}
            if "request_payload" not in log_cols:
                logger.info("Adding column request_payload to table ai_data_access_logs")
                conn.execute(text("ALTER TABLE `ai_data_access_logs` ADD COLUMN `request_payload` TEXT NULL AFTER `records_count`;"))
            if "response_content" not in log_cols:
                logger.info("Adding column response_content to table ai_data_access_logs")
                conn.execute(text("ALTER TABLE `ai_data_access_logs` ADD COLUMN `response_content` TEXT NULL AFTER `request_payload`;"))

    seed_initial_data()
    logger.info("Standalone AI Platform database migrations completed successfully.")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_migrations()
