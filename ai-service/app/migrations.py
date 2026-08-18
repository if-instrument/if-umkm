"""
Standalone Migration Manager for AI Platform Microservice.
Ensures zero-dependency, self-contained database migrations for MySQL / SQLite.
"""

import logging
from sqlalchemy import inspect, text
from sqlalchemy.orm import sessionmaker
from app.database import engine, Base

# Import all ORM models so Base.metadata knows about them
from app.models.biometrics import FaceEmbedding, FingerprintTemplate
from app.models.platform import (
    Application, Company, User, AICapability, AIPlan,
    CompanyAISubscription, CompanyAIQuota, UserAIQuota, CompanyAIProviderKey,
    AIUsageLedger, AIUsageReservation, AIToolRegistry, AIModelPricing, AIAuditLog,
    AIConversation, AIMessage, AIDataAccessLog
)

logger = logging.getLogger("ai_migrations")
SessionLocal = sessionmaker(bind=engine)

def seed_initial_data():
    db = SessionLocal()
    try:
        # Seed AI Capabilities if empty
        if db.query(AICapability).count() == 0:
            capabilities = [
                AICapability(code="biometric.face", name="Face Recognition Biometrics", category="biometric"),
                AICapability(code="biometric.fingerprint", name="Fingerprint Biometrics", category="biometric"),
                AICapability(code="business.assistant", name="AI Conversational Assistant", category="business"),
                AICapability(code="business.analyst", name="AI Deep Business Analyst", category="business"),
                AICapability(code="business.web_search", name="External Knowledge Web Search", category="business"),
                AICapability(code="business.action", name="AI Propose & Action Execution", category="business"),
            ]
            db.add_all(capabilities)
            logger.info("Seeded default AI capabilities.")

        # Seed AI Plans if empty
        if db.query(AIPlan).count() == 0:
            plans = [
                AIPlan(code="free", name="Free Plan", monthly_token_quota=100000, monthly_web_search_quota=50, price_monthly=0.0),
                AIPlan(code="basic", name="Basic Plan", monthly_token_quota=500000, monthly_web_search_quota=200, price_monthly=15.0),
                AIPlan(code="professional", name="Professional Plan", monthly_token_quota=2000000, monthly_web_search_quota=1000, price_monthly=50.0),
                AIPlan(code="enterprise", name="Enterprise Plan", monthly_token_quota=20000000, monthly_web_search_quota=10000, price_monthly=200.0),
            ]
            db.add_all(plans)
            logger.info("Seeded default AI plans.")

        # Seed or Update AI Model Pricing
        default_pricings = [
            ("openai", "gpt-4o", 2.50, 10.00, "OpenAI GPT-4o Flagship"),
            ("openai", "gpt-4o-mini", 0.15, 0.60, "OpenAI GPT-4o Mini"),
            ("anthropic", "claude-3-5-sonnet-20241022", 3.00, 15.00, "Claude 3.5 Sonnet"),
            ("anthropic", "claude-3-5-haiku", 0.80, 4.00, "Claude 3.5 Haiku"),
            ("gemini", "gemini-3.6-flash", 0.075, 0.30, "Google Gemini 3.6 Flash (Interactions API)"),
            ("gemini", "gemini-3.1-pro", 1.25, 5.00, "Google Gemini 3.1 Pro (Interactions API)"),
            ("gemini", "gemini-1.5-flash", 0.075, 0.30, "Google Gemini 1.5 Flash"),
            ("gemini", "gemini-1.5-pro", 1.25, 5.00, "Google Gemini 1.5 Pro"),
        ]
        for prov, mdl, in_cost, out_cost, _ in default_pricings:
            existing = db.query(AIModelPricing).filter(AIModelPricing.provider == prov, AIModelPricing.model == mdl).first()
            if not existing:
                db.add(AIModelPricing(provider=prov, model=mdl, input_cost_per_1m=in_cost, output_cost_per_1m=out_cost))
        db.commit()
        logger.info("Ensured default AI model pricings.")

        # Seed Default Application if empty
        if db.query(Application).count() == 0:
            app_rec = Application(
                app_id="umkm-pos",
                name="UMKM POS & Retail Application",
                description="Default registered application adapter for UMKM POS SaaS"
            )
            db.add(app_rec)
            logger.info("Seeded default application 'umkm-pos'.")

        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Error seeding initial data: {str(e)}")
    finally:
        db.close()

def run_migrations():
    logger.info("Running standalone AI Platform database migrations...")
    
    # 1. Ensure all tables exist in MySQL
    Base.metadata.create_all(bind=engine)
    
    # 2. Column-level migrations for legacy biometric schema
    inspector = inspect(engine)
    
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
