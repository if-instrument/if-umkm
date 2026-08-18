# AI Platform Architecture Audit & Transformation Plan

## 1. Executive Summary

This document presents a comprehensive architectural audit of the existing `AIService` microservice and outlines the strategic plan to evolve it from a specialized biometrics service into an **Enterprise-Grade, Domain-Agnostic Global AI Platform**.

The platform is designed to serve multiple diverse SaaS applications (e.g., UMKM/POS, EV Charging, Healthcare, Logistics, HR, Finance) without coupling the core AI engine to any specific business application database or domain model.

---

## 2. Current Architecture Assessment

### 2.1 Existing Module Inventory

```
ai-service/
├── app/
│   ├── config.py           # Environment variables (DB URL, API Key, HMAC Secret, Thresholds)
│   ├── database.py         # SQLAlchemy engine setup & MySQL auto-database creation
│   ├── main.py             # FastAPI app initialization, middleware, router mounts
│   ├── migrations.py       # Standalone column-level migration script
│   ├── security.py         # X-API-Key and HMAC X-Signature header verification
│   ├── models/
│   │   └── biometrics.py   # FaceEmbedding and FingerprintTemplate models
│   ├── routers/
│   │   ├── face.py         # Endpoints: /face/register, /face/verify, /face/identify, /face/status, /face/verify-pose
│   │   └── fingerprint.py  # Endpoints: /fingerprint/register, /fingerprint/verify, /fingerprint/identify, /fingerprint/status, /fingerprint/verify-step
│   └── services/
│       ├── face_engine.py          # Liveness detection & facial feature extraction
│       ├── fingerprint_engine.py   # ISO/ANSI minutiae matching & platform biometrics
│       ├── python_camera_driver.py  # Open-device hardware bridge
│       └── python_hardware_driver.py# Sensor USB driver bridge
├── tests/
│   └── test_auth_endpoints.py # PyTest security verification
└── requirements.txt
```

### 2.2 Reusable Components

1. **Security & Authentication Layer (`security.py`)**:
   - Clean implementation of `X-API-Key` and `X-Signature` HMAC SHA-256 validation.
   - High reuse value for tenant-to-platform request authentication.

2. **Biometric Engines (`face_engine.py` & `fingerprint_engine.py`)**:
   - Robust feature extraction, cosine similarity, ISO minutiae template matching, and platform biometrics (`MobileBiometrics` / `TouchID`).
   - Fully operational; must be preserved with 100% backward compatibility.

3. **Database Infrastructure (`database.py` & `migrations.py`)**:
   - Auto-database provisioner (`ensure_mysql_db_exists`) and dynamic column schema inspector (`migrations.py`).
   - Highly suitable for expanding to new database tables via SQLAlchemy / Alembic migrations.

---

## 3. Identified Technical Debt & Risks

| Component | Identified Issue / Limitation | Risk Level | Architectural Mitigation |
| :--- | :--- | :--- | :--- |
| **Domain Coupling** | Legacy column names in early versions (e.g. `IFresso-Coffee` default keys). | Low | Abstract `company_key` to generic `application_id`, `company_id`, `user_id` context. |
| **LLM Provider Lack** | System currently lacks LLM client integrations (OpenAI, Anthropic, Gemini). | High | Build extensible `LLMProviderInterface` with vendor-specific adapters. |
| **Quota & Billing** | No token consumption tracking, usage ledger, or quota reservation. | Critical | Implement multi-level quota engine (Plan $\rightarrow$ Company $\rightarrow$ User) with atomic token reservations. |
| **Tool Calling** | No mechanism for applications to register external business tools or execute remote functions. | Critical | Build a domain-agnostic `Tool Registry` & JSON-RPC/REST Tool Contract protocol. |
| **Isolation** | Single-tenant assumption in early biometric queries. | Medium | Enforce strict multi-tenant context filters (`application_id`, `company_id`, `user_id`) on all queries. |

---

## 4. Target Architecture

```
                                 [ External Applications ]
                     (UMKM / POS, EV Charging, Healthcare, HR, Finance)
                                             │
                                   X-API-Key / X-Signature
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                 GLOBAL AI PLATFORM                                      │
│                                                                                         │
│  ┌───────────────────────┐   ┌───────────────────────┐   ┌──────────────────────────┐  │
│  │   Security & Auth     │   │   Capability Matrix   │   │  Multi-Tenant Identity   │  │
│  │ X-API-Key / HMAC / RBAC│   │ Biometric & Business  │   │ Application/Company/User │  │
│  └───────────┬───────────┘   └───────────┬───────────┘   └────────────┬─────────────┘  │
│              └───────────────────────────┼────────────────────────────┘                 │
│                                          ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │                           Orchestrator & Agent Engine                             │  │
│  │                    (Intent Recognition, Tool Selection, Guardrails)               │  │
│  └───────────┬───────────────────────────┬───────────────────────────┬───────────────┘  │
│              │                           │                           │                  │
│              ▼                           ▼                           ▼                  │
│  ┌───────────────────────┐   ┌───────────────────────┐   ┌──────────────────────────┐  │
│  │ Biometrics Subsystem   │   │  Tool & Action Engine │   │  Quota & Usage Engine    │  │
│  │  - Face Engine        │   │  - Remote Tool Exec   │   │  - Atomic Token Reserve  │  │
│  │  - Fingerprint Engine │   │  - Action Approval    │   │  - Cost & Token Ledger   │  │
│  └───────────────────────┘   └───────────┬───────────┘   └──────────────────────────┘  │
│                                          │                                              │
│                                          ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │                              Multi-LLM Provider Adapter                           │  │
│  │                     [ OpenAI ]   [ Anthropic ]   [ Google Gemini ]                │  │
│  └───────────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Global Domain-Agnostic Context Model

Every Business AI request requires the standardized Request Context:

```json
{
  "application_id": "app_umkm_pos_01",
  "company_id": "comp_ifresso_99",
  "user_id": "user_mgr_77",
  "conversation_id": "conv_883492",
  "capability": "business.analyst",
  "locale": "id-ID",
  "timezone": "Asia/Jakarta"
}
```

---

## 6. Implementation Strategy & Roadmap

### Phase 1: Core Foundation & Provider/Quota Abstractions (CURRENT PHASE)
- Define database entities: `Application`, `Company`, `User`, `AICapability`, `AIPlan`, `CompanyAISubscription`, `CompanyAIQuota`, `UserAIQuota`, `AIUsageLedger`, `AIUsageReservation`, `AIToolRegistry`, `AIModelPricing`.
- Build `LLMProviderInterface` and concrete provider drivers (`OpenAIProvider`, `AnthropicProvider`, `GeminiProvider`).
- Implement Quota Engine with atomic token reservation & consumption ledger.
- Create `/api/v1/ai/` core endpoints while guaranteeing 100% backward compatibility for `/face/*` and `/fingerprint/*`.

### Phase 2: Tool System, Agent Orchestration & Knowledge
- Build Tool Registry & Tool Contract execution protocol.
- Build Agent Reasoning Engine (Intent Parsing, Tool Execution Loop, Guardrails).
- Web Search capability integration & Scoped Memory storage.

### Phase 3: Business Analyst, Actions & UMKM Adapter Integration
- Implement deep analytical multi-signal reasoning (`business.analyst`).
- Implement Proposal/Action approval flow (`business.action`).
- Provide integration guide & UMKM adapter bridge.

---

## 7. Migration & Backward Compatibility Guarantee

1. **Zero Downtime Database Schema**:
   All existing tables (`face_embeddings`, `fingerprint_templates`) remain intact with existing columns (`company_key`, `user_key`, `vendor`, `template_data`).
2. **Endpoint Preservation**:
   All `/face/*` and `/fingerprint/*` endpoints continue to be served seamlessly with unchanged payload contracts.
3. **Automated Regression Suite**:
   PyTest suite covers existing biometric flows alongside new AI Platform endpoints.
