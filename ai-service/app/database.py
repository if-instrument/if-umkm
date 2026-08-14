import pymysql
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings

def ensure_mysql_db_exists(url: str):
    """Automatically create MySQL database if_instrument_aiservice if connecting to MySQL."""
    if "mysql" in url:
        try:
            clean_url = url.split("?")[0]
            parts = clean_url.replace("mysql+pymysql://", "").replace("mysql://", "").split("/")
            db_name = parts[-1]
            user_pass_host = parts[0].split("@")
            user_pass = user_pass_host[0].split(":")
            host_port = user_pass_host[1].split(":")
            
            user = user_pass[0]
            password = user_pass[1] if len(user_pass) > 1 else ""
            host = host_port[0]
            port = int(host_port[1]) if len(host_port) > 1 else 3306
            
            conn = pymysql.connect(host=host, port=port, user=user, password=password)
            with conn.cursor() as cursor:
                cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[AI DB] Database check warning: {e}")

ensure_mysql_db_exists(settings.DATABASE_URL)

connect_args = {"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
