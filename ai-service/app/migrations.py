"""
Standalone Migration Manager for AI Biometrics Microservice.
Ensures zero-dependency, self-contained database migrations for standalone cloud deployments.
"""

import logging
from sqlalchemy import inspect, text
from app.database import engine, Base
from app.models.biometrics import FaceEmbedding, FingerprintTemplate

logger = logging.getLogger("ai_migrations")

def run_migrations():
    logger.info("Running standalone AI Service database migrations...")
    
    # 1. Ensure tables exist
    Base.metadata.create_all(bind=engine)
    
    # 2. Dynamic Inspector for Column Schema Syncing
    inspector = inspect(engine)
    
    with engine.begin() as conn:
        for table_name in ["face_embeddings", "fingerprint_templates"]:
            if not inspector.has_table(table_name):
                continue
                
            columns = {col["name"] for col in inspector.get_columns(table_name)}
            
            # Add company_key if missing
            if "company_key" not in columns:
                logger.info(f"Adding column company_key to table {table_name}")
                conn.execute(text(f"ALTER TABLE `{table_name}` ADD COLUMN `company_key` VARCHAR(120) NULL DEFAULT 'IFresso-Coffee' AFTER `id`;"))
            
            # Add user_key if missing
            if "user_key" not in columns:
                logger.info(f"Adding column user_key to table {table_name}")
                conn.execute(text(f"ALTER TABLE `{table_name}` ADD COLUMN `user_key` VARCHAR(120) NULL DEFAULT NULL AFTER `company_key`;"))
            
            # Drop legacy columns if still existing
            for legacy_col in ["tenant_id", "company_id", "user_id"]:
                if legacy_col in columns:
                    logger.info(f"Dropping legacy column {legacy_col} from table {table_name}")
                    try:
                        conn.execute(text(f"ALTER TABLE `{table_name}` DROP COLUMN `{legacy_col}`;"))
                    except Exception as e:
                        logger.warning(f"Could not drop legacy column {legacy_col}: {str(e)}")

    logger.info("Standalone AI Service database migrations completed successfully.")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_migrations()
