import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Index
from app.database import Base

class FaceEmbedding(Base):
    __tablename__ = "face_embeddings"

    id = Column(Integer, primary_key=True, index=True)
    company_key = Column(String(120), nullable=False, index=True)
    user_key = Column(String(120), nullable=False, index=True)
    embedding = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    __table_args__ = (
        Index("idx_company_user_face", "company_key", "user_key"),
    )

class FingerprintTemplate(Base):
    __tablename__ = "fingerprint_templates"

    id = Column(Integer, primary_key=True, index=True)
    company_key = Column(String(120), nullable=False, index=True)
    user_key = Column(String(120), nullable=False, index=True)
    vendor = Column(String(64), nullable=False, default="Generic", index=True)
    template_data = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    __table_args__ = (
        Index("idx_company_user_vendor_fp", "company_key", "user_key", "vendor"),
    )
