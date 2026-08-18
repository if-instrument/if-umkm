import base64
import io
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

client = TestClient(app)

headers = {
    "X-API-Key": settings.API_KEY
}

def generate_test_image_base64() -> str:
    img = Image.new("RGB", (200, 200), color=(120, 150, 180))
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("utf-8")

def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "online"

    res_v1 = client.get("/api/v1/health")
    assert res_v1.status_code == 200
    assert res_v1.json()["status"] == "online"

def test_unauthorized_without_api_key():
    res = client.post("/api/v1/face/register", json={
        "company_key": "test-company",
        "user_key": "test-user",
        "image": generate_test_image_base64()
    })
    assert res.status_code == 401

def test_face_register_and_verify(monkeypatch):
    img_data = generate_test_image_base64()
    
    # Mock liveness check to pass for dummy test image
    monkeypatch.setattr("app.routers.face.check_liveness", lambda img: (True, 0.99))
    monkeypatch.setattr("app.routers.face.extract_face_embedding", lambda img: [0.1] * 128)
    
    # 1. Register
    reg_res = client.post("/api/v1/face/register", json={
        "company_key": "company-test-01",
        "user_key": "usr-test-01",
        "image": img_data
    }, headers=headers)
    
    assert reg_res.status_code == 200
    assert reg_res.json()["ok"] is True
    
    # 2. Verify
    ver_res = client.post("/api/v1/face/verify", json={
        "company_key": "company-test-01",
        "user_key": "usr-test-01",
        "image": img_data
    }, headers=headers)
    
    assert ver_res.status_code == 200
    assert ver_res.json()["verified"] is True

def test_fingerprint_register_and_verify():
    template = "ZK_FP_SAMPLE_TEMPLATE_DATA_1234567890"
    
    # 1. Register
    reg_res = client.post("/api/v1/fingerprint/register", json={
        "company_key": "company-test-01",
        "user_key": "usr-test-01",
        "vendor": "ZKTeco",
        "template_data": template
    }, headers=headers)
    
    assert reg_res.status_code == 200
    assert reg_res.json()["ok"] is True
    
    # 2. Verify matching template
    ver_res = client.post("/api/v1/fingerprint/verify", json={
        "company_key": "company-test-01",
        "user_key": "usr-test-01",
        "vendor": "ZKTeco",
        "template_data": template
    }, headers=headers)
    
    assert ver_res.status_code == 200
    assert ver_res.json()["verified"] is True
