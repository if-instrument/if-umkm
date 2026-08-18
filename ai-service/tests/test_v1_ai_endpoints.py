import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

client = TestClient(app)
headers = {"X-API-Key": settings.API_KEY}

def test_ai_health_endpoint():
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert "supported_providers" in data

def test_ai_capabilities_endpoint():
    res = client.get("/api/v1/ai/capabilities", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert len(data["data"]) >= 6

def test_ai_providers_endpoint():
    res = client.get("/api/v1/ai/providers", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert "openai" in data["data"]

def test_ai_chat_endpoint():
    payload = {
        "context": {
            "application_id": "umkm-pos",
            "company_id": "comp_test_1",
            "user_id": "user_mgr_1",
            "capability": "business.assistant"
        },
        "prompt": "Hello AI platform",
        "provider": "openai",
        "model": "gpt-4o-mini"
    }
    res = client.post("/api/v1/ai/chat", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert "answer" in data["data"]
    assert "usage" in data["meta"]
