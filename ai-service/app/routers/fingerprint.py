import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database import get_db
from app.config import settings
from app.models.biometrics import FingerprintTemplate
from app.services.fingerprint_engine import compute_fingerprint_similarity, verify_enrollment_step

router = APIRouter(prefix="/fingerprint", tags=["Fingerprint Biometrics"])

class RegisterFingerprintRequest(BaseModel):
    company_key: str = Field(..., description="Company slug (e.g. IFresso-Coffee)")
    user_key: str = Field(..., description="Globally unique user GUID")
    vendor: str = Field("Generic", description="Hardware vendor")
    template_data: str = Field(..., description="Raw or base64 fingerprint template string")

class VerifyStepRequest(BaseModel):
    current_step: int = Field(..., description="Current enrollment step (1 to 6)")
    vendor: str = Field("Generic", description="Hardware vendor")
    template_data: str = Field(..., description="Scanned fingerprint template string")
    previous_samples: Optional[list] = Field(default=[], description="List of previous recorded base64 templates")

class VerifyFingerprintRequest(BaseModel):
    company_key: Optional[str] = Field(None, description="Company slug")
    user_key: str = Field(..., description="Globally unique user GUID")
    vendor: str = Field("Generic", description="Hardware vendor")
    template_data: str = Field(..., description="Scanned fingerprint template string")
    threshold: Optional[float] = Field(0.70, description="Similarity score threshold")

class IdentifyFingerprintRequest(BaseModel):
    company_key: Optional[str] = Field(None, description="Company slug to narrow search scope")
    vendor: str = Field("Generic", description="Hardware vendor")
    template_data: str = Field(..., description="Scanned fingerprint template string")
    threshold: Optional[float] = Field(0.70, description="Similarity score threshold")

class DeleteFingerprintRequest(BaseModel):
    company_key: Optional[str] = Field(None, description="Company slug")
    user_key: str = Field(..., description="Globally unique user GUID")

class FingerprintStatusRequest(BaseModel):
    company_key: Optional[str] = Field(None, description="Company slug")
    user_key: str = Field(..., description="Globally unique user GUID")

def get_user_key_variants(user_key: Optional[str]) -> list:
    if not user_key:
        return []
    raw = str(user_key).strip()
    clean = raw[4:] if raw.startswith("usr-") else raw
    return list({raw, clean, f"usr-{clean}"})

@router.post("/status")
def check_fingerprint_status(req: FingerprintStatusRequest, db: Session = Depends(get_db)):
    query = db.query(FingerprintTemplate).filter(FingerprintTemplate.user_key.in_(get_user_key_variants(req.user_key)))
    if req.company_key:
        query = query.filter(FingerprintTemplate.company_key == req.company_key)
    records = query.all()
    count = len(records)
    return {
        "ok": True,
        "user_key": req.user_key,
        "company_key": req.company_key or "",
        "registered": count > 0,
        "sample_count": count
    }

@router.post("/register")
def register_fingerprint(req: RegisterFingerprintRequest, db: Session = Depends(get_db)):
    if not req.template_data.strip():
        raise HTTPException(status_code=400, detail="Data template sidik jari tidak boleh kosong.")

    records = db.query(FingerprintTemplate).filter(
        FingerprintTemplate.user_key.in_(get_user_key_variants(req.user_key))
    ).order_by(FingerprintTemplate.created_at.asc()).all()

    if len(records) >= 10:
        records[0].template_data = req.template_data
        records[0].company_key = req.company_key
        records[0].vendor = req.vendor
        records[0].updated_at = datetime.datetime.utcnow()
        sample_count = len(records)
        sample_num = 1
    else:
        record = FingerprintTemplate(
            company_key=req.company_key,
            user_key=req.user_key,
            vendor=req.vendor,
            template_data=req.template_data
        )
        db.add(record)
        sample_count = len(records) + 1
        sample_num = sample_count

    db.commit()

    return {
        "ok": True,
        "message": f"Template sidik jari ({req.vendor}) sampel #{sample_num} berhasil didaftarkan!",
        "company_key": req.company_key,
        "user_key": req.user_key,
        "vendor": req.vendor,
        "sample_count": sample_count
    }

@router.post("/verify")
def verify_fingerprint(req: VerifyFingerprintRequest, db: Session = Depends(get_db)):
    query = db.query(FingerprintTemplate).filter(FingerprintTemplate.user_key.in_(get_user_key_variants(req.user_key)))
    if req.company_key:
        query = query.filter(FingerprintTemplate.company_key == req.company_key)
    records = query.all()

    if not records:
        return {
            "verified": False,
            "message": "Belum ada sampel sidik jari terdaftar untuk pengguna ini.",
            "similarity": 0.0,
            "threshold": req.threshold,
            "sample_count": 0
        }

    best_similarity = 0.0
    best_sample_index = 1
    matched_vendor = req.vendor

    for idx, rec in enumerate(records, 1):
        sim = compute_fingerprint_similarity(req.template_data, rec.template_data, req.vendor)
        if sim > best_similarity:
            best_similarity = sim
            best_sample_index = idx
            matched_vendor = rec.vendor

    passed = best_similarity >= req.threshold

    return {
        "verified": passed,
        "similarity": best_similarity,
        "matched_sample": f"Sampel #{best_sample_index}",
        "sample_count": len(records),
        "threshold": req.threshold,
        "vendor": matched_vendor,
        "message": f"Sidik jari terverifikasi cocok dengan Sampel #{best_sample_index} ({round(best_similarity * 100, 1)}%)" if passed else f"Kemiripan ({round(best_similarity * 100, 1)}%) di bawah batas minimal ({round(req.threshold * 100, 1)}%)"
    }

@router.post("/identify")
def identify_fingerprint(req: IdentifyFingerprintRequest, db: Session = Depends(get_db)):
    query = db.query(FingerprintTemplate)
    if req.company_key:
        query = query.filter(FingerprintTemplate.company_key == req.company_key)
    records = query.all()

    if not records and req.company_key:
        records = db.query(FingerprintTemplate).all()

    if not records:
        return {
            "verified": False,
            "user_key": "",
            "message": "Belum ada sampel sidik jari terdaftar pada sistem.",
            "similarity": 0.0,
            "threshold": req.threshold,
            "sample_count": 0
        }

    best_similarity = 0.0
    best_user_key = ""
    best_sample_index = 1

    for idx, rec in enumerate(records, 1):
        sim = compute_fingerprint_similarity(req.template_data, rec.template_data, req.vendor)
        if sim > best_similarity:
            best_similarity = sim
            best_user_key = rec.user_key
            best_sample_index = idx

    passed = best_similarity >= req.threshold

    return {
        "verified": passed,
        "user_key": best_user_key if passed else "",
        "similarity": best_similarity,
        "matched_sample": f"Sampel #{best_sample_index}",
        "sample_count": len(records),
        "threshold": req.threshold,
        "message": f"Sidik jari teridentifikasi ({round(best_similarity * 100, 1)}%)" if passed else f"Sidik jari tidak teridentifikasi ({round(best_similarity * 100, 1)}%)"
    }

@router.post("/delete")
def delete_fingerprint(req: DeleteFingerprintRequest, db: Session = Depends(get_db)):
    query = db.query(FingerprintTemplate).filter(FingerprintTemplate.user_key == req.user_key)
    if req.company_key:
        query = query.filter(FingerprintTemplate.company_key == req.company_key)

    deleted_count = query.delete(synchronize_session=False)
    db.commit()

    # Clear driver memory cache and active device hardware session buffers
    driver_res = PythonHardwareDriver.clear_device_data(req.user_key)

    return {
        "ok": True,
        "deleted_count": deleted_count,
        "device_cleared": driver_res.get("ok", True),
        "message": f"Berhasil menghapus {deleted_count} sampel sidik jari dari database dan memori perangkat."
    }

from app.services.python_hardware_driver import PythonHardwareDriver

class OpenDeviceRequest(BaseModel):
    vendor: str = Field("Generic", description="Hardware vendor (ZKTeco, Suprema, DigitalPersona, TouchID, Generic)")
    device_index: Optional[int] = Field(0, description="USB Device Index")

class CloseDeviceRequest(BaseModel):
    session_id: str = Field(..., description="Device session ID")

class CaptureFrameRequest(BaseModel):
    session_id: str = Field(..., description="Device session ID")

@router.get("/list-devices")
def list_fingerprint_devices():
    """Scan and return all available fingerprint devices (Touch ID + USB)."""
    return PythonHardwareDriver.list_available_devices()

@router.post("/open-device")
def open_fingerprint_device(req: OpenDeviceRequest):
    """Open a fingerprint device and start a session."""
    res = PythonHardwareDriver.open_device(vendor=req.vendor, device_index=req.device_index)
    return res

@router.post("/close-device")
def close_fingerprint_device(req: CloseDeviceRequest):
    """Close the fingerprint device and release the session."""
    res = PythonHardwareDriver.close_device(session_id=req.session_id)
    return res

@router.post("/capture-frame")
def capture_fingerprint_frame(req: CaptureFrameRequest):
    """
    Read a real biometric frame from the active device session.
    
    - TouchID: triggers native macOS Touch ID prompt (blocking up to 30s).
    - USB scanner: reads raw minutiae bytes from USB endpoint.
    """
    res = PythonHardwareDriver.capture_frame(session_id=req.session_id)
    return res


@router.post("/verify-step")
def verify_fingerprint_step(req: VerifyStepRequest):
    res = verify_enrollment_step(
        current_step=req.current_step,
        template_data=req.template_data,
        vendor=req.vendor,
        previous_samples=req.previous_samples or []
    )
    return {
        "ok": True,
        "step_passed": res.get("step_passed", False),
        "repeat_step": res.get("repeat_step", None),
        "all_completed": res.get("all_completed", False),
        "similarity_score": res.get("similarity_score", 0.0),
        "message": res.get("message", "")
    }
