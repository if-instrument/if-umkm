import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database import get_db
from app.config import settings
from app.models.biometrics import FingerprintTemplate
from app.services.fingerprint_engine import compute_fingerprint_similarity, verify_enrollment_step
from app.services.python_hardware_driver import PythonHardwareDriver

router = APIRouter(tags=["Fingerprint Biometrics"])

# ==================== REQUEST SCHEMAS ====================

class RegisterFingerprintRequest(BaseModel):
    company_key: str = Field(..., description="Company slug (e.g. IFresso-Coffee)", examples=["IFresso-Coffee"])
    user_key: str = Field(..., description="Globally unique user GUID", examples=["usr-101"])
    vendor: str = Field("Generic", description="Hardware vendor", examples=["ZKTeco"])
    template_data: str = Field(..., description="Raw or base64 fingerprint template string")

class VerifyStepRequest(BaseModel):
    current_step: int = Field(..., description="Current enrollment step (1 to 6)", examples=[1])
    vendor: str = Field("Generic", description="Hardware vendor", examples=["ZKTeco"])
    template_data: str = Field(..., description="Scanned fingerprint template string")
    previous_samples: Optional[List[str]] = Field(default=[], description="List of previous recorded base64 templates")

class VerifyFingerprintRequest(BaseModel):
    company_key: Optional[str] = Field(None, description="Company slug", examples=["IFresso-Coffee"])
    user_key: str = Field(..., description="Globally unique user GUID", examples=["usr-101"])
    vendor: str = Field("Generic", description="Hardware vendor", examples=["ZKTeco"])
    template_data: str = Field(..., description="Scanned fingerprint template string")
    threshold: Optional[float] = Field(0.70, description="Similarity score threshold", examples=[0.70])

class IdentifyFingerprintRequest(BaseModel):
    company_key: Optional[str] = Field(None, description="Company slug to narrow search scope", examples=["IFresso-Coffee"])
    vendor: str = Field("Generic", description="Hardware vendor", examples=["ZKTeco"])
    template_data: str = Field(..., description="Scanned fingerprint template string")
    threshold: Optional[float] = Field(0.70, description="Similarity score threshold", examples=[0.70])

class DeleteFingerprintRequest(BaseModel):
    company_key: Optional[str] = Field(None, description="Company slug", examples=["IFresso-Coffee"])
    user_key: str = Field(..., description="Globally unique user GUID", examples=["usr-101"])

class FingerprintStatusRequest(BaseModel):
    company_key: Optional[str] = Field(None, description="Company slug", examples=["IFresso-Coffee"])
    user_key: str = Field(..., description="Globally unique user GUID", examples=["usr-101"])

class OpenDeviceRequest(BaseModel):
    vendor: str = Field("Generic", description="Hardware vendor (ZKTeco, Suprema, DigitalPersona, TouchID, Generic)", examples=["ZKTeco"])
    device_index: Optional[int] = Field(0, description="USB Device Index", examples=[0])

class CloseDeviceRequest(BaseModel):
    session_id: str = Field(..., description="Device session ID", examples=["fp_sess_123"])

class CaptureFrameRequest(BaseModel):
    session_id: str = Field(..., description="Device session ID", examples=["fp_sess_123"])

# ==================== RESPONSE SCHEMAS ====================

class FingerprintStatusResponse(BaseModel):
    ok: bool = Field(True, examples=[True])
    user_key: str = Field("usr-101", examples=["usr-101"])
    company_key: str = Field("IFresso-Coffee", examples=["IFresso-Coffee"])
    registered: bool = Field(True, examples=[True])
    sample_count: int = Field(1, examples=[1])

class RegisterFingerprintResponse(BaseModel):
    ok: bool = Field(True, examples=[True])
    message: str = Field("Template sidik jari berhasil didaftarkan!", examples=["Template sidik jari berhasil didaftarkan!"])
    company_key: str = Field("IFresso-Coffee", examples=["IFresso-Coffee"])
    user_key: str = Field("usr-101", examples=["usr-101"])
    vendor: str = Field("ZKTeco", examples=["ZKTeco"])
    sample_count: int = Field(1, examples=[1])

class VerifyFingerprintResponse(BaseModel):
    verified: bool = Field(True, examples=[True])
    similarity: float = Field(0.92, examples=[0.92])
    matched_sample: str = Field("Sampel #1", examples=["Sampel #1"])
    sample_count: int = Field(1, examples=[1])
    threshold: float = Field(0.70, examples=[0.70])
    vendor: str = Field("ZKTeco", examples=["ZKTeco"])
    message: str = Field("Sidik jari terverifikasi cocok.", examples=["Sidik jari terverifikasi cocok."])

class IdentifyFingerprintResponse(BaseModel):
    verified: bool = Field(True, examples=[True])
    user_key: str = Field("usr-101", examples=["usr-101"])
    similarity: float = Field(0.92, examples=[0.92])
    matched_sample: str = Field("Sampel #1", examples=["Sampel #1"])
    sample_count: int = Field(1, examples=[1])
    threshold: float = Field(0.70, examples=[0.70])
    message: str = Field("Sidik jari teridentifikasi (92.0%)", examples=["Sidik jari teridentifikasi (92.0%)"])

class DeleteFingerprintResponse(BaseModel):
    ok: bool = Field(True, examples=[True])
    deleted_count: int = Field(1, examples=[1])
    device_cleared: bool = Field(True, examples=[True])
    message: str = Field("Berhasil menghapus sampel sidik jari.", examples=["Berhasil menghapus sampel sidik jari."])

class VerifyStepResponse(BaseModel):
    ok: bool = Field(True, examples=[True])
    step_passed: bool = Field(True, examples=[True])
    repeat_step: Optional[int] = Field(None, examples=[None])
    all_completed: bool = Field(False, examples=[False])
    similarity_score: float = Field(0.88, examples=[0.88])
    message: str = Field("Sampel langkah 1 valid.", examples=["Sampel langkah 1 valid."])

class HardwareDeviceResponse(BaseModel):
    ok: bool = Field(True, examples=[True])
    session_id: Optional[str] = Field(None, examples=["fp_sess_123"])
    status: Optional[str] = Field(None, examples=["opened"])
    message: Optional[str] = Field(None, examples=["Device connected successfully."])
    template: Optional[str] = Field(None, description="Scanned template string")

# ==================== ENDPOINT HANDLERS ====================

def get_user_key_variants(user_key: Optional[str]) -> list:
    if not user_key:
        return []
    raw = str(user_key).strip()
    clean = raw[4:] if raw.startswith("usr-") else raw
    return list({raw, clean, f"usr-{clean}"})

@router.post("/status", response_model=FingerprintStatusResponse)
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

@router.post("/register", response_model=RegisterFingerprintResponse)
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

@router.post("/verify", response_model=VerifyFingerprintResponse)
def verify_fingerprint(req: VerifyFingerprintRequest, db: Session = Depends(get_db)):
    query = db.query(FingerprintTemplate).filter(FingerprintTemplate.user_key.in_(get_user_key_variants(req.user_key)))
    if req.company_key:
        query = query.filter(FingerprintTemplate.company_key == req.company_key)
    records = query.all()

    if not records:
        return {
            "verified": False,
            "similarity": 0.0,
            "matched_sample": "",
            "sample_count": 0,
            "threshold": req.threshold,
            "vendor": req.vendor,
            "message": "Belum ada sampel sidik jari terdaftar untuk pengguna ini."
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

@router.post("/identify", response_model=IdentifyFingerprintResponse)
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
            "similarity": 0.0,
            "matched_sample": "",
            "sample_count": 0,
            "threshold": req.threshold,
            "message": "Belum ada sampel sidik jari terdaftar pada sistem."
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

@router.post("/delete", response_model=DeleteFingerprintResponse)
@router.delete("/{user_key}", response_model=DeleteFingerprintResponse)
def delete_fingerprint(req: Optional[DeleteFingerprintRequest] = None, user_key: Optional[str] = None, company_key: Optional[str] = None, db: Session = Depends(get_db)):
    target_user_key = user_key or (req.user_key if req else "")
    target_company_key = company_key or (req.company_key if req else None)

    if not target_user_key:
        raise HTTPException(status_code=400, detail="user_key wajib diisi.")

    query = db.query(FingerprintTemplate).filter(FingerprintTemplate.user_key == target_user_key)
    if target_company_key:
        query = query.filter(FingerprintTemplate.company_key == target_company_key)

    deleted_count = query.delete(synchronize_session=False)
    db.commit()

    driver_res = PythonHardwareDriver.clear_device_data(target_user_key)

    return {
        "ok": True,
        "deleted_count": deleted_count,
        "device_cleared": driver_res.get("ok", True),
        "message": f"Berhasil menghapus {deleted_count} sampel sidik jari dari database dan memori perangkat."
    }


@router.get("/list-devices")
def list_fingerprint_devices():
    """Scan and return all available fingerprint devices (Touch ID + USB)."""
    return PythonHardwareDriver.list_available_devices()

@router.post("/open-device")
def open_fingerprint_device(req: OpenDeviceRequest):
    """Open a fingerprint device and start a session."""
    return PythonHardwareDriver.open_device(vendor=req.vendor, device_index=req.device_index)

@router.post("/close-device")
def close_fingerprint_device(req: CloseDeviceRequest):
    """Close the fingerprint device and release the session."""
    return PythonHardwareDriver.close_device(session_id=req.session_id)

@router.post("/capture-frame")
def capture_fingerprint_frame(req: CaptureFrameRequest):
    """Read a real biometric frame from the active device session."""
    return PythonHardwareDriver.capture_frame(session_id=req.session_id)

@router.post("/verify-step", response_model=VerifyStepResponse)
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
