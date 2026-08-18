import json
import datetime
from typing import Optional
from PIL import Image
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import numpy as np

from app.database import get_db
from app.models.biometrics import FaceEmbedding
from app.services.face_engine import (
    extract_face_embedding,
    compute_cosine_similarity,
    check_liveness,
    verify_face_pose,
    decode_image_base64
)
from app.services.python_camera_driver import PythonCameraDriver
from app.config import settings

router = APIRouter(tags=["Face Biometrics"])

# ==================== REQUEST SCHEMAS ====================

class RegisterFaceRequest(BaseModel):
    company_key: str = Field(..., description="Company slug (e.g. IFresso-Coffee)", examples=["IFresso-Coffee"])
    user_key: str = Field(..., description="Globally unique user GUID", examples=["usr-101"])
    image: str = Field(..., description="Base64 encoded camera snapshot")

class VerifyFaceRequest(BaseModel):
    company_key: Optional[str] = Field(None, description="Company slug", examples=["IFresso-Coffee"])
    user_key: str = Field(..., description="Globally unique user GUID", examples=["usr-101"])
    image: str = Field(..., description="Base64 encoded camera snapshot")
    threshold: Optional[float] = Field(0.72, description="Similarity score threshold", examples=[0.72])

class DeleteFaceRequest(BaseModel):
    company_key: Optional[str] = Field(None, description="Company slug", examples=["IFresso-Coffee"])
    user_key: str = Field(..., description="Globally unique user GUID", examples=["usr-101"])

class VerifyFacePoseRequest(BaseModel):
    image: str = Field(..., description="Base64 encoded camera snapshot")
    target_pose: str = Field("center", description="Target face pose: center, left, right, smile", examples=["center"])

class IdentifyFaceRequest(BaseModel):
    company_key: Optional[str] = Field(None, description="Company slug to narrow search scope", examples=["IFresso-Coffee"])
    image: str = Field(..., description="Base64 encoded camera snapshot")
    threshold: Optional[float] = Field(0.72, description="Similarity score threshold", examples=[0.72])

class FaceStatusRequest(BaseModel):
    company_key: Optional[str] = Field(None, description="Company slug", examples=["IFresso-Coffee"])
    user_key: str = Field(..., description="Globally unique user GUID", examples=["usr-101"])

class OpenCameraDeviceRequest(BaseModel):
    camera_index: Optional[int] = Field(0, description="Camera device index", examples=[0])
    width: Optional[int] = Field(640, description="Frame width", examples=[640])
    height: Optional[int] = Field(640, description="Frame height", examples=[640])

class CloseCameraDeviceRequest(BaseModel):
    session_id: str = Field(..., description="Camera session ID", examples=["cam_session_123"])

# ==================== RESPONSE SCHEMAS ====================

class VerifyFacePoseResponse(BaseModel):
    ok: bool = Field(True, examples=[True])
    target_pose: str = Field("center", examples=["center"])
    pose_matched: bool = Field(True, examples=[True])
    confidence: float = Field(0.95, examples=[0.95])
    guidance_message: str = Field("Pose wajah sesuai.", examples=["Pose wajah sesuai."])

class FaceStatusResponse(BaseModel):
    ok: bool = Field(True, examples=[True])
    user_key: str = Field("usr-101", examples=["usr-101"])
    company_key: str = Field("IFresso-Coffee", examples=["IFresso-Coffee"])
    registered: bool = Field(True, examples=[True])
    sample_count: int = Field(3, examples=[3])

class RegisterFaceResponse(BaseModel):
    ok: bool = Field(True, examples=[True])
    message: str = Field("Foto wajah berhasil didaftarkan!", examples=["Foto wajah berhasil didaftarkan!"])
    company_key: str = Field("IFresso-Coffee", examples=["IFresso-Coffee"])
    user_key: str = Field("usr-101", examples=["usr-101"])
    sample_count: int = Field(1, examples=[1])
    liveness_score: float = Field(0.99, examples=[0.99])

class VerifyFaceResponse(BaseModel):
    verified: bool = Field(True, examples=[True])
    similarity: float = Field(0.94, examples=[0.94])
    matched_sample: str = Field("Sampel #1", examples=["Sampel #1"])
    sample_count: int = Field(3, examples=[3])
    threshold: float = Field(0.72, examples=[0.72])
    liveness_score: float = Field(0.99, examples=[0.99])
    message: str = Field("Wajah terverifikasi cocok.", examples=["Wajah terverifikasi cocok."])

class IdentifyFaceResponse(BaseModel):
    verified: bool = Field(True, examples=[True])
    user_key: str = Field("usr-101", examples=["usr-101"])
    similarity: float = Field(0.94, examples=[0.94])
    matched_sample: str = Field("Sampel #1", examples=["Sampel #1"])
    sample_count: int = Field(3, examples=[3])
    threshold: float = Field(0.72, examples=[0.72])
    liveness_score: float = Field(0.99, examples=[0.99])
    message: str = Field("Wajah teridentifikasi (94.0%)", examples=["Wajah teridentifikasi (94.0%)"])

class DeleteFaceResponse(BaseModel):
    ok: bool = Field(True, examples=[True])
    deleted_count: int = Field(1, examples=[1])
    message: str = Field("Berhasil menghapus 1 sampel foto wajah.", examples=["Berhasil menghapus 1 sampel foto wajah."])

class CameraDeviceResponse(BaseModel):
    ok: bool = Field(True, examples=[True])
    session_id: Optional[str] = Field(None, examples=["cam_sess_456"])
    status: Optional[str] = Field(None, examples=["opened"])
    message: Optional[str] = Field(None, examples=["Kamera berhasil dihubungkan."])

# ==================== ENDPOINT HANDLERS ====================

def get_user_key_variants(user_key: Optional[str]) -> list:
    if not user_key:
        return []
    raw = str(user_key).strip()
    clean = raw[4:] if raw.startswith("usr-") else raw
    return list({raw, clean, f"usr-{clean}"})

@router.post("/verify-pose", response_model=VerifyFacePoseResponse)
def verify_pose_endpoint(req: VerifyFacePoseRequest):
    try:
        img = decode_image_base64(req.image)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Format gambar tidak valid: {str(e)}")

    pose_matched, confidence, guidance_msg = verify_face_pose(img, req.target_pose)
    return {
        "ok": True,
        "target_pose": req.target_pose,
        "pose_matched": pose_matched,
        "confidence": confidence,
        "guidance_message": guidance_msg
    }

@router.post("/status", response_model=FaceStatusResponse)
def check_face_status(req: FaceStatusRequest, db: Session = Depends(get_db)):
    query = db.query(FaceEmbedding).filter(FaceEmbedding.user_key.in_(get_user_key_variants(req.user_key)))
    if req.company_key:
        query = query.filter(FaceEmbedding.company_key == req.company_key)
    records = query.all()
    count = len(records)
    return {
        "ok": True,
        "user_key": req.user_key,
        "company_key": req.company_key or "",
        "registered": count > 0,
        "sample_count": count
    }

@router.post("/register", response_model=RegisterFaceResponse)
def register_face(req: RegisterFaceRequest, db: Session = Depends(get_db)):
    try:
        img = decode_image_base64(req.image)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Format gambar tidak valid: {str(e)}")

    is_live, liveness_score = check_liveness(img)
    if not is_live:
        return {
            "ok": False,
            "message": "Pemeriksaan keaslian (liveness) gagal. Terdeteksi foto cetak atau layar HP/digital. Gunakan wajah asli secara langsung!",
            "company_key": req.company_key,
            "user_key": req.user_key,
            "sample_count": 0,
            "liveness_score": liveness_score
        }

    try:
        vector = extract_face_embedding(img)
        vector_json = json.dumps(vector)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengekstrak fitur wajah: {str(e)}")

    records = db.query(FaceEmbedding).filter(
        FaceEmbedding.user_key.in_(get_user_key_variants(req.user_key))
    ).order_by(FaceEmbedding.created_at.asc()).all()

    if len(records) >= 20:
        records[0].embedding = vector_json
        records[0].company_key = req.company_key
        records[0].updated_at = datetime.datetime.utcnow()
        sample_count = len(records)
        sample_num = 1
    else:
        record = FaceEmbedding(
            company_key=req.company_key,
            user_key=req.user_key,
            embedding=vector_json
        )
        db.add(record)
        sample_count = len(records) + 1
        sample_num = sample_count

    db.commit()

    return {
        "ok": True,
        "message": f"Foto wajah sampel #{sample_num} berhasil didaftarkan!",
        "company_key": req.company_key,
        "user_key": req.user_key,
        "sample_count": sample_count,
        "liveness_score": liveness_score
    }

@router.post("/verify", response_model=VerifyFaceResponse)
def verify_face(req: VerifyFaceRequest, db: Session = Depends(get_db)):
    query = db.query(FaceEmbedding).filter(FaceEmbedding.user_key.in_(get_user_key_variants(req.user_key)))
    if req.company_key:
        query = query.filter(FaceEmbedding.company_key == req.company_key)
    records = query.all()

    if not records:
        return {
            "verified": False,
            "similarity": 0.0,
            "matched_sample": "",
            "sample_count": 0,
            "threshold": req.threshold,
            "liveness_score": 0.0,
            "message": "Belum ada sampel foto wajah terdaftar untuk user_key ini."
        }

    try:
        img = decode_image_base64(req.image)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Format gambar tidak valid: {str(e)}")

    is_live, liveness_score = check_liveness(img)
    if not is_live:
        return {
            "verified": False,
            "similarity": 0.0,
            "matched_sample": "",
            "sample_count": len(records),
            "threshold": req.threshold,
            "liveness_score": liveness_score,
            "message": "Pemeriksaan keaslian (liveness) gagal. Terdeteksi foto cetak atau layar HP/digital. Gunakan wajah asli secara langsung!"
        }

    input_vector = extract_face_embedding(img)
    best_similarity = 0.0
    best_sample_index = 1

    for idx, rec in enumerate(records, 1):
        registered_vector = json.loads(rec.embedding)
        sim = compute_cosine_similarity(input_vector, registered_vector)
        if sim > best_similarity:
            best_similarity = sim
            best_sample_index = idx

    passed = best_similarity >= req.threshold

    return {
        "verified": passed,
        "similarity": best_similarity,
        "matched_sample": f"Sampel #{best_sample_index}",
        "sample_count": len(records),
        "threshold": req.threshold,
        "liveness_score": liveness_score,
        "message": f"Wajah terverifikasi cocok dengan Sampel #{best_sample_index} ({round(best_similarity * 100, 1)}%)" if passed else f"Verifikasi gagal. Tingkat kemiripan: {round(best_similarity * 100, 1)}%"
    }

@router.post("/identify", response_model=IdentifyFaceResponse)
def identify_face(req: IdentifyFaceRequest, db: Session = Depends(get_db)):
    query = db.query(FaceEmbedding)
    if req.company_key:
        query = query.filter(FaceEmbedding.company_key == req.company_key)
    records = query.all()

    if not records and req.company_key:
        records = db.query(FaceEmbedding).all()

    if not records:
        return {
            "verified": False,
            "user_key": "",
            "similarity": 0.0,
            "matched_sample": "",
            "sample_count": 0,
            "threshold": req.threshold,
            "liveness_score": 0.0,
            "message": "Belum ada sampel foto wajah terdaftar pada sistem."
        }

    try:
        img = decode_image_base64(req.image)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Format gambar tidak valid: {str(e)}")

    is_live, liveness_score = check_liveness(img)
    if not is_live:
        return {
            "verified": False,
            "user_key": "",
            "similarity": 0.0,
            "matched_sample": "",
            "sample_count": len(records),
            "threshold": req.threshold,
            "liveness_score": liveness_score,
            "message": "Pemeriksaan keaslian (liveness) gagal. Terdeteksi foto cetak atau layar HP/digital. Gunakan wajah asli secara langsung!"
        }

    input_vector = extract_face_embedding(img)

    best_similarity = 0.0
    best_user_key = ""
    best_sample_index = 1

    for idx, rec in enumerate(records, 1):
        registered_vector = json.loads(rec.embedding)
        sim = compute_cosine_similarity(input_vector, registered_vector)
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
        "liveness_score": liveness_score,
        "message": f"Wajah teridentifikasi ({round(best_similarity * 100, 1)}%)" if passed else f"Wajah tidak teridentifikasi ({round(best_similarity * 100, 1)}%)"
    }

@router.post("/open-device", response_model=CameraDeviceResponse)
def open_camera_device(req: OpenCameraDeviceRequest):
    res = PythonCameraDriver.open_camera_device(
        camera_index=req.camera_index or 0,
        width=req.width or 640,
        height=req.height or 640
    )
    return res

@router.post("/close-device", response_model=CameraDeviceResponse)
def close_camera_device(req: CloseCameraDeviceRequest):
    res = PythonCameraDriver.close_camera_device(session_id=req.session_id)
    return res

@router.post("/delete", response_model=DeleteFaceResponse)
def delete_face(req: DeleteFaceRequest, db: Session = Depends(get_db)):
    query = db.query(FaceEmbedding).filter(FaceEmbedding.user_key.in_(get_user_key_variants(req.user_key)))
    if req.company_key:
        query = query.filter(FaceEmbedding.company_key == req.company_key)

    deleted_count = query.delete(synchronize_session=False)
    db.commit()

    return {
        "ok": True,
        "deleted_count": deleted_count,
        "message": f"Berhasil menghapus {deleted_count} sampel foto wajah."
    }
