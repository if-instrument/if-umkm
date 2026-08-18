<?php

namespace App\Libraries;

class AIService
{
    private string $baseUrl;
    private string $apiKey;
    private string $hmacSecret;
    private int $timeout;

    public function __construct()
    {
        $this->baseUrl = trim((string) env('AI_SERVICE_URL', 'http://127.0.0.1:8000'), " \t\n\r\0\x0B'\"");
        if ($this->baseUrl === '') {
            $this->baseUrl = 'http://127.0.0.1:8000';
        }

        $this->apiKey = trim((string) env('AI_SERVICE_API_KEY', 'pos_ai_secret_key_2026'), " \t\n\r\0\x0B'\"");
        if ($this->apiKey === '') {
            $this->apiKey = 'pos_ai_secret_key_2026';
        }

        $this->hmacSecret = trim((string) env('AI_SERVICE_HMAC_SECRET', 'pos_ai_hmac_secret_2026'), " \t\n\r\0\x0B'\"");
        if ($this->hmacSecret === '') {
            $this->hmacSecret = 'pos_ai_hmac_secret_2026';
        }

        $envTimeout = (int) env('AI_SERVICE_TIMEOUT');
        $this->timeout = $envTimeout > 0 ? $envTimeout : 60;
    }

    public function registerFace(string $companyKey, string $userKey, string $image): array
    {
        return $this->post('/api/v1/face/register', [
            'company_key' => $companyKey,
            'user_key' => $userKey,
            'image' => $image,
        ]);
    }

    public function verifyFace(string $companyKey, string $userKey, string $image): array
    {
        return $this->post('/api/v1/face/verify', [
            'company_key' => $companyKey,
            'user_key' => $userKey,
            'image' => $image,
            'threshold' => 0.72,
        ]);
    }

    public function identifyFace(string $image, string $companyKey = ''): array
    {
        $payload = ['image' => $image, 'threshold' => 0.72];
        if ($companyKey !== '') {
            $payload['company_key'] = $companyKey;
        }
        return $this->post('/api/v1/face/identify', $payload);
    }

    public function getFaceStatus(string $userKey, string $companyKey = ''): array
    {
        $payload = ['user_key' => $userKey];
        if ($companyKey !== '') {
            $payload['company_key'] = $companyKey;
        }
        return $this->post('/api/v1/face/status', $payload);
    }

    public function deleteFace(string $userKey, string $companyKey = ''): array
    {
        $payload = ['user_key' => $userKey];
        if ($companyKey !== '') {
            $payload['company_key'] = $companyKey;
        }
        return $this->post('/api/v1/face/delete', $payload);
    }

    public function verifyFacePose(string $image, string $targetPose): array
    {
        return $this->post('/api/v1/face/verify-pose', [
            'image' => $image,
            'target_pose' => $targetPose,
        ]);
    }

    public function registerFingerprint(string $companyKey, string $userKey, string $fingerprintData, string $vendor = 'Generic'): array
    {
        return $this->post('/api/v1/fingerprint/register', [
            'company_key' => $companyKey,
            'user_key' => $userKey,
            'vendor' => $vendor,
            'template_data' => $fingerprintData,
        ]);
    }

    public function verifyFingerprint(string $companyKey, string $userKey, string $fingerprintData, string $vendor = 'Generic', float $threshold = 0.70): array
    {
        return $this->post('/api/v1/fingerprint/verify', [
            'company_key' => $companyKey,
            'user_key' => $userKey,
            'vendor' => $vendor,
            'template_data' => $fingerprintData,
            'threshold' => $threshold,
        ]);
    }

    public function identifyFingerprint(string $fingerprintData, string $vendor = 'Generic', string $companyKey = ''): array
    {
        $payload = [
            'vendor' => $vendor,
            'template_data' => $fingerprintData,
            'threshold' => 0.70,
        ];
        if ($companyKey !== '') {
            $payload['company_key'] = $companyKey;
        }
        return $this->post('/api/v1/fingerprint/identify', $payload);
    }

    public function getFingerprintStatus(string $userKey, string $companyKey = ''): array
    {
        $payload = ['user_key' => $userKey];
        if ($companyKey !== '') {
            $payload['company_key'] = $companyKey;
        }
        return $this->post('/api/v1/fingerprint/status', $payload);
    }

    public function deleteFingerprint(string $userKey, string $companyKey = ''): array
    {
        $payload = ['user_key' => $userKey];
        if ($companyKey !== '') {
            $payload['company_key'] = $companyKey;
        }
        return $this->post('/api/v1/fingerprint/delete', $payload);
    }

    public function verifyFingerprintStep(int $currentStep, string $templateData, string $vendor = 'Generic', array $previousSamples = []): array
    {
        return $this->post('/api/v1/fingerprint/verify-step', [
            'current_step' => $currentStep,
            'template_data' => $templateData,
            'vendor' => $vendor,
            'previous_samples' => $previousSamples,
        ]);
    }

    public function listFingerprintDevices(): array
    {
        return $this->get('/api/v1/fingerprint/list-devices');
    }

    public function openFingerprintDevice(string $vendor = 'Generic', int $deviceIndex = 0): array
    {
        return $this->post('/api/v1/fingerprint/open-device', [
            'vendor' => $vendor,
            'device_index' => $deviceIndex,
        ]);
    }

    public function closeFingerprintDevice(string $sessionId): array
    {
        return $this->post('/api/v1/fingerprint/close-device', [
            'session_id' => $sessionId,
        ]);
    }

    public function captureFingerprintFrame(string $sessionId): array
    {
        // Touch ID blocking prompt can take up to 30s — use extended timeout
        $url = rtrim($this->baseUrl, '/') . '/api/v1/fingerprint/capture-frame';
        $payload = json_encode(['session_id' => $sessionId]);
        $headers = [
            'Content-Type: application/json',
            'X-API-Key: ' . $this->apiKey,
        ];

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 35); // extended for real Touch ID
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error    = curl_error($ch);
        curl_close($ch);

        if ($error || $httpCode >= 500 || $response === false) {
            return ['ok' => false, 'message' => 'Gagal membaca frame dari device: ' . $error];
        }

        $decoded = json_decode((string) $response, true);
        return is_array($decoded) ? $decoded : ['ok' => false, 'message' => 'Respon tidak valid dari driver.'];
    }

    public function hasFingerprint(string $tenantId, string $userId): bool
    {
        $res = $this->getFingerprintStatus($tenantId, $userId);
        return (bool) ($res['registered'] ?? false);
    }

    public function openCameraDevice(int $cameraIndex = 0): array
    {
        return $this->post('/api/v1/face/open-device', [
            'camera_index' => $cameraIndex,
            'width' => 640,
            'height' => 640,
        ]);
    }

    public function closeCameraDevice(string $sessionId): array
    {
        return $this->post('/api/v1/face/close-device', [
            'session_id' => $sessionId,
        ]);
    }

    public function analyze(string $applicationId, string $companyId, string $userId, string $prompt, string $provider = 'openai', string $model = 'gpt-4o-mini', ?string $conversationId = null): array
    {
        $context = [
            'application_id' => $applicationId,
            'company_id' => $companyId,
            'user_id' => $userId,
            'capability' => 'business.analyst',
        ];
        if ($conversationId) {
            $context['conversation_id'] = $conversationId;
        }

        return $this->post('/api/v1/ai/analyze', [
            'context' => $context,
            'prompt' => $prompt,
            'provider' => $provider,
            'model' => $model,
        ]);
    }

    public function chat(string $applicationId, string $companyId, string $userId, string $prompt, string $provider = 'openai', string $model = 'gpt-4o-mini', ?string $conversationId = null): array
    {
        $context = [
            'application_id' => $applicationId,
            'company_id' => $companyId,
            'user_id' => $userId,
            'capability' => 'business.assistant',
        ];
        if ($conversationId) {
            $context['conversation_id'] = $conversationId;
        }

        return $this->post('/api/v1/ai/chat', [
            'context' => $context,
            'prompt' => $prompt,
            'provider' => $provider,
            'model' => $model,
        ]);
    }

    public function getAiQuota(string $applicationId, string $companyId): array
    {
        return $this->post('/api/v1/ai/quota', [
            'application_id' => $applicationId,
            'company_id' => $companyId,
        ]);
    }

    public function getAiCapabilities(): array
    {
        return $this->get('/api/v1/ai/capabilities');
    }

    public function getAiProviders(): array
    {
        return $this->get('/api/v1/ai/providers');
    }

    public function syncTenantPlan(string $companySlug, string $planCode = 'professional', string $applicationId = 'umkm-pos'): array
    {
        return $this->post('/api/v1/ai/quota', [
            'application_id' => $applicationId,
            'company_id' => $companySlug,
            'plan_code' => strtolower($planCode),
        ]);
    }

    public function getAiDataLogs(string $applicationId = 'umkm-pos', string $companySlug = 'IFresso-Coffee', int $limit = 50): array
    {
        return $this->get('/api/v1/ai/data-logs?application_id=' . urlencode($applicationId) . '&company_id=' . urlencode($companySlug) . '&limit=' . $limit);
    }

    public function listConversations(string $applicationId = 'umkm-pos', string $companySlug = 'IFresso-Coffee', string $userId = 'user_mgr_1'): array
    {
        return $this->get('/api/v1/ai/conversations?application_id=' . urlencode($applicationId) . '&company_id=' . urlencode($companySlug) . '&user_id=' . urlencode($userId));
    }

    public function getConversationMessages(string $conversationId): array
    {
        return $this->get('/api/v1/ai/conversations/' . urlencode($conversationId) . '/messages');
    }

    public function deleteConversation(string $conversationId): array
    {
        return $this->post('/api/v1/ai/conversations/' . urlencode($conversationId) . '/delete', [
            'conversation_id' => $conversationId,
        ]);
    }

    public function isOnline(): bool
    {
        $res = $this->get('/api/v1/health');
        return ($res['status'] ?? '') === 'online';
    }

    private function post(string $endpoint, array $payload): array
    {
        $url = rtrim($this->baseUrl, '/') . '/' . ltrim($endpoint, '/');
        $jsonPayload = json_encode($payload, JSON_UNESCAPED_SLASHES);
        $signature = hash_hmac('sha256', $jsonPayload, $this->hmacSecret);

        $headers = [
            'Content-Type: application/json',
            'X-API-Key: ' . $this->apiKey,
            'X-Signature: ' . $signature,
        ];

        return $this->curlRequest('POST', $url, $jsonPayload, $headers);
    }

    private function get(string $endpoint): array
    {
        $url = rtrim($this->baseUrl, '/') . '/' . ltrim($endpoint, '/');
        $headers = [
            'X-API-Key: ' . $this->apiKey,
        ];

        return $this->curlRequest('GET', $url, null, $headers);
    }

    private function curlRequest(string $method, string $url, ?string $body, array $headers): array
    {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            if ($body !== null) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
            }
        } elseif ($method !== 'GET') {
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
            if ($body !== null) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
            }
        }

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error || $response === false) {
            return [
                'ok' => false,
                'offline' => true,
                'status' => $httpCode ?: 503,
                'message' => 'AI Microservice tidak dapat dihubungi (' . ($error ?: 'Timeout/Connection Error') . '). Menggunakan mode standar.',
            ];
        }

        $decoded = json_decode((string) $response, true);
        if (! is_array($decoded)) {
            return [
                'ok' => false,
                'status' => $httpCode,
                'message' => 'Respon AI Microservice tidak valid.',
            ];
        }

        if ($httpCode >= 400) {
            return [
                'ok' => false,
                'status' => $httpCode,
                'message' => $decoded['detail'] ?? $decoded['message'] ?? 'Gagal memproses permintaan AI.',
            ];
        }

        return $decoded;
    }
}
