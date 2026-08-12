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

def test_unauthorized_without_api_key():
    res = client.post("/face/register", json={
        "tenant_id": "test-tenant",
        "user_id": "test-user",
        "image": generate_test_image_base64()
    })
    assert res.status_code == 401

def test_face_register_and_verify():
    img_data = generate_test_image_base64()
    
    # 1. Register
    reg_res = client.post("/face/register", json={
        "tenant_id": "tenant-test-01",
        "user_id": "usr-test-01",
        "image": img_data
    }, headers=headers)
    
    assert reg_res.status_code == 200
    assert reg_res.json()["ok"] is True
    
    # 2. Verify
    ver_res = client.post("/face/verify", json={
        "tenant_id": "tenant-test-01",
        "user_id": "usr-test-01",
        "image": img_data
    }, headers=headers)
    
    assert ver_res.status_code == 200
    assert ver_res.json()["verified"] is True
    assert ver_res.json()["similarity"] >= settings.FACE_SIMILARITY_THRESHOLD

def test_fingerprint_register_and_verify():
    template = "ZK_FP_SAMPLE_TEMPLATE_DATA_1234567890"
    
    # 1. Register
    reg_res = client.post("/fingerprint/register", json={
        "tenant_id": "tenant-test-01",
        "user_id": "usr-test-01",
        "vendor": "ZKTeco",
        "template_data": template
    }, headers=headers)
    
    assert reg_res.status_code == 200
    assert reg_res.json()["ok"] is True
    
    # 2. Verify matching template
    ver_res = client.post("/fingerprint/verify", json={
        "tenant_id": "tenant-test-01",
        "user_id": "usr-test-01",
        "vendor": "ZKTeco",
        "template_data": template
    }, headers=headers)
    
    assert ver_res.status_code == 200
    assert ver_res.json()["verified"] is True
