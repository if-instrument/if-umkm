<?php

namespace App\Controllers\Api;

use App\Controllers\BaseController;

class AiBusinessController extends BaseController
{

    protected $format = 'json';

    /**
     * Frontend API Endpoint: AI Business Analyst Execution
     * Route: POST /api/page/ai/analyze
     */
    public function analyze()
    {
        @set_time_limit(120);
        $payload = $this->request->getJSON(true) ?: [];
        $prompt = trim((string) ($payload['prompt'] ?? ''));
        $companySlug = trim((string) ($payload['companySlug'] ?? $payload['company_id'] ?? 'IFresso-Coffee'));
        $userId = trim((string) ($payload['userId'] ?? $payload['user_id'] ?? 'user_mgr_1'));
        $provider = trim((string) ($payload['provider'] ?? 'openai'));
        $model = trim((string) ($payload['model'] ?? 'gpt-4o-mini'));
        $conversationId = trim((string) ($payload['conversation_id'] ?? $payload['conversationId'] ?? ''));

        if ($prompt === '') {
            return $this->failValidationError('Pertanyaan / instruksi analisis tidak boleh kosong.');
        }

        $ai = service('aiService');
        $res = $ai->analyze('umkm-pos', $companySlug, $userId, $prompt, $provider, $model, $conversationId ?: null);

        if (! ($res['ok'] ?? false)) {
            return $this->respond([
                'ok' => false,
                'message' => $res['message'] ?? $res['detail'] ?? 'Gagal memproses analisis AI.',
            ], 400);
        }

        return $this->respond($res);
    }

    /**
     * Frontend API Endpoint: AI Assistant Chat Completion
     * Route: POST /api/page/ai/chat
     */
    public function chat()
    {
        $payload = $this->request->getJSON(true) ?: [];
        $prompt = trim((string) ($payload['prompt'] ?? ''));
        $companySlug = trim((string) ($payload['companySlug'] ?? $payload['company_id'] ?? 'IFresso-Coffee'));
        $userId = trim((string) ($payload['userId'] ?? $payload['user_id'] ?? 'user_mgr_1'));
        $provider = trim((string) ($payload['provider'] ?? 'openai'));
        $model = trim((string) ($payload['model'] ?? 'gpt-4o-mini'));

        if ($prompt === '') {
            return $this->failValidationError('Pesan tidak boleh kosong.');
        }

        $ai = service('aiService');
        $res = $ai->chat('umkm-pos', $companySlug, $userId, $prompt, $provider, $model);

        if (! ($res['ok'] ?? false)) {
            return $this->respond([
                'ok' => false,
                'message' => $res['message'] ?? $res['detail'] ?? 'Gagal memproses AI assistant.',
            ], 400);
        }

        return $this->respond($res);
    }

    /**
     * Frontend API Endpoint: Check Company AI Quota & Capabilities
     * Route: GET /api/page/ai/quota
     */
    public function quota()
    {
        $companySlug = (string) ($this->request->getGet('companySlug') ?: 'IFresso-Coffee');
        $ai = service('aiService');
        $res = $ai->getAiQuota('umkm-pos', $companySlug);
        return $this->respond($res);
    }

    /**
     * Frontend API Endpoint: Get Active Configured LLM Providers & Models
     * Route: GET /api/page/ai/providers
     */
    public function providers()
    {
        $ai = service('aiService');
        $res = $ai->getAiProviders();
        return $this->respond($res);
    }

    /**
     * Frontend API Endpoint: Get Data Access Audit Logs (Internal vs External)
     * Route: GET /api/page/ai/data-logs
     */
    public function dataLogs()
    {
        $companySlug = (string) ($this->request->getGet('companySlug') ?: 'IFresso-Coffee');
        $limit = (int) ($this->request->getGet('limit') ?: 50);
        $ai = service('aiService');
        $res = $ai->getAiDataLogs('umkm-pos', $companySlug, $limit);
        return $this->respond($res);
    }

    /**
     * Frontend API Endpoint: List Past Conversations for Current Tenant User
     * Route: GET /api/page/ai/conversations
     */
    public function conversations()
    {
        $companySlug = (string) ($this->request->getGet('companySlug') ?: 'IFresso-Coffee');
        $userId = (string) ($this->request->getGet('userId') ?: '');
        $ai = service('aiService');
        $res = $ai->listConversations('umkm-pos', $companySlug, $userId ?: null);
        return $this->respond($res);
    }

    /**
     * Frontend API Endpoint: Get Message History for a Specific Conversation
     * Route: GET /api/page/ai/conversations/(:segment)/messages
     */
    public function messages($conversationId = null)
    {
        if (! $conversationId) {
            return $this->failValidationError('Conversation ID required.');
        }
        $ai = service('aiService');
        $res = $ai->getConversationMessages($conversationId);
        return $this->respond($res);
    }

    /**
     * Frontend API Endpoint: Delete Conversation Session
     * Route: DELETE /api/page/ai/conversations/(:segment)
     * Route: POST   /api/page/ai/conversations/delete
     */
    public function deleteConversation($conversationId = null)
    {
        if (! $conversationId) {
            $payload = $this->request->getJSON(true) ?: [];
            $conversationId = trim((string) ($payload['conversation_id'] ?? $payload['conversationId'] ?? ''));
        }

        if (! $conversationId) {
            return $this->failValidationError('Conversation ID required.');
        }
        $ai = service('aiService');
        $res = $ai->deleteConversation($conversationId);
        return $this->respond($res);
    }
}
