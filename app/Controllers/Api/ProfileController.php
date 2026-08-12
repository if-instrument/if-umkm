<?php

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Libraries\AIService;
use App\Models\UserModel;

class ProfileController extends BaseController
{
    private AIService $aiService;

    public function __construct(?AIService $aiService = null)
    {
        $this->aiService = $aiService ?? service('aiService');
    }

    private function resolveSessionTenantAndUser(): array
    {
        $session = (array) (service('request')->jwt ?? []);
        $rawUserId = (string) ($session['sub'] ?? $session['userId'] ?? $session['id'] ?? '1');
        $numericId = (int) str_replace('usr-', '', $rawUserId) ?: 1;

        $companySlug = (string) ($session['companySlug'] ?? '');
        $companyId   = (string) ($session['companyId'] ?? '');
        $cleanCompanyId = str_replace('company-', '', $companyId);

        $db        = \Config\Database::connect();
        $userModel = new UserModel();
        $user      = null;

        if ($db->tableExists('users')) {
            $user = $userModel->find($numericId);
        }

        if (! $user && $db->tableExists('users')) {
            $user = $userModel->whereIn('status', ['ACTIVE', 'active', '1', 1, '10', 10])->first();
        }

        if (! $user) {
            $numericId = 1;
            $userKey   = '8f92a1b4-3c9d-4e5f-b2a1-7c8d9e0f1a2b';
        } else {
            $numericId = (int) $user['id'];
            $userKey   = $userModel->ensureUserKey($user);
        }

        $resolvedCompanyId = (int) ((is_array($user) ? ($user['company_id'] ?? null) : null) ?: $cleanCompanyId ?: 1);

        // Resolve tenantId: always prefer companySlug from JWT.
        // If missing (e.g. Super Admin with no company_id), look up route_slug
        // from companies table so it matches what is stored in the AI service.
        if ($companySlug !== '') {
            $tenantId = $companySlug;
        } else {
            // Try to look up the company route_slug from the DB
            $resolvedSlug = '';
            try {
                if ($resolvedCompanyId > 0 && $db->tableExists('companies')) {
                    $company = $db->table('companies')
                        ->select('route_slug')
                        ->where('id', $resolvedCompanyId)
                        ->get()
                        ->getRowArray();
                    $resolvedSlug = (string) ($company['route_slug'] ?? '');
                }
                // Super Admin (company_id = NULL): fall back to first company
                if ($resolvedSlug === '' && $db->tableExists('companies')) {
                    $firstCompany = $db->table('companies')
                        ->select('route_slug')
                        ->orderBy('id', 'ASC')
                        ->get(1)
                        ->getRowArray();
                    $resolvedSlug = (string) ($firstCompany['route_slug'] ?? '');
                }
            } catch (\Throwable $e) {
                log_message('warning', '[ProfileController] Could not resolve company slug: ' . $e->getMessage());
            }

            $tenantId = $resolvedSlug !== '' ? $resolvedSlug : 'IFresso-Coffee';
        }

        return [
            'numericId'   => $numericId,
            'userId'      => (string) $numericId,
            'userKey'     => $userKey,
            'tenantId'    => $tenantId,
            'companySlug' => $companySlug ?: $tenantId,
            'user'        => $user,
        ];
    }

    public function getProfile()
    {
        try {
            $context = $this->resolveSessionTenantAndUser();
            $numericId = $context['numericId'];
            $userCode = $context['userId'];
            $userKey = $context['userKey'];
            $tenantId = $context['tenantId'];
            $companySlug = $context['companySlug'];
            $user = $context['user'];

            $userName = $user['name'] ?? 'Pengguna';
            $userEmail = $user['email'] ?? '';
            $userType = $user['type'] ?? 'company_admin';

            $aiOnline = false;
            $faceRegistered = false;
            $faceCount = 0;
            $fingerprintRegistered = false;
            $fingerprintCount = 0;

            try {
                log_message('debug', "[ProfileController::getProfile] Checking face status: userKey={$userKey}, tenantId={$tenantId}");
                $faceStatus = $this->aiService->getFaceStatus($userKey, $tenantId);
                log_message('debug', '[ProfileController::getProfile] Face status response: ' . json_encode($faceStatus));

                // Detect if AI service returned an offline/error response
                $isOffline = ($faceStatus['offline'] ?? false) || ($faceStatus['ok'] === false && isset($faceStatus['offline']));

                if (! $isOffline) {
                    $faceRegistered = (bool) ($faceStatus['registered'] ?? false);
                    $faceCount = (int) ($faceStatus['sample_count'] ?? ($faceRegistered ? 1 : 0));

                    $fpStatus = $this->aiService->getFingerprintStatus($userKey, $tenantId);
                    $fingerprintRegistered = (bool) ($fpStatus['registered'] ?? false);
                    $fingerprintCount = (int) ($fpStatus['sample_count'] ?? ($fingerprintRegistered ? 1 : 0));

                    $aiOnline = true;
                } else {
                    log_message('warning', '[ProfileController] AI Service reported offline for face/fingerprint status check.');
                    $aiOnline = false;
                }
            } catch (\Throwable $e) {
                log_message('warning', '[ProfileController] AI Service status check warning: ' . $e->getMessage());
                $aiOnline = false;
            }

            return $this->response->setJSON([
                'ok' => true,
                'data' => [
                    'user' => [
                        'id' => $userCode,
                        'userKey' => $userKey,
                        'numericId' => $numericId,
                        'name' => $userName,
                        'email' => $userEmail,
                        'type' => $userType,
                        'companyId' => $tenantId,
                        'companySlug' => $companySlug,
                    ],
                    'biometrics' => [
                        'aiServiceOnline' => $aiOnline,
                        'faceRegistered' => $faceRegistered,
                        'faceCount' => $faceCount,
                        'fingerprintRegistered' => $fingerprintRegistered,
                        'fingerprintCount' => $fingerprintCount,
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            log_message('error', '[ProfileController] getProfile error: ' . $e->getMessage());
            return $this->response->setStatusCode(500)->setJSON([
                'ok' => false,
                'message' => 'Gagal memuat profil: ' . $e->getMessage(),
            ]);
        }
    }

    public function updateProfile()
    {
        try {
            $context = $this->resolveSessionTenantAndUser();
            $numericId = $context['numericId'];

            $payload = $this->request->getJSON(true) ?: [];
            $name = trim((string) ($payload['name'] ?? ''));
            $currentPassword = (string) ($payload['currentPassword'] ?? '');
            $newPassword = (string) ($payload['newPassword'] ?? '');

            if ($name === '') {
                return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => 'Nama tidak boleh kosong.']);
            }

            $userModel = new UserModel();
            $user = $userModel->find($numericId);
            if (! $user) {
                return $this->response->setStatusCode(404)->setJSON(['ok' => false, 'message' => 'Pengguna tidak ditemukan.']);
            }

            $updateData = ['name' => $name, 'updated_at' => date('Y-m-d H:i:s')];

            if ($newPassword !== '') {
                if (! password_verify($currentPassword, $user['password_hash'])) {
                    return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => 'Password saat ini tidak sesuai.']);
                }
                if (strlen($newPassword) < 8) {
                    return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => 'Password baru minimal 8 karakter.']);
                }
                $updateData['password_hash'] = password_hash($newPassword, PASSWORD_DEFAULT);
            }

            $userModel->update($numericId, $updateData);

            return $this->response->setJSON([
                'ok' => true,
                'message' => 'Profil berhasil diperbarui.',
            ]);
        } catch (\Throwable $e) {
            log_message('error', '[ProfileController] updateProfile error: ' . $e->getMessage());
            return $this->response->setStatusCode(500)->setJSON([
                'ok' => false,
                'message' => 'Gagal memperbarui profil: ' . $e->getMessage(),
            ]);
        }
    }

    public function registerFace()
    {
        try {
            $context = $this->resolveSessionTenantAndUser();
            $userKey = $context['userKey'];
            $tenantId = $context['tenantId'];

            $payload = $this->request->getJSON(true) ?: [];
            $image = (string) ($payload['image'] ?? '');

            if ($image === '') {
                return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => 'Gambar kamera wajib disertakan.']);
            }

            $result = $this->aiService->registerFace($tenantId, $userKey, $image);

            if (! ($result['ok'] ?? false)) {
                return $this->response->setStatusCode(400)->setJSON([
                    'ok' => false,
                    'message' => $result['detail'] ?? $result['message'] ?? 'Gagal memproses pendaftaran wajah.',
                ]);
            }

            return $this->response->setJSON([
                'ok' => true,
                'message' => $result['message'] ?? 'Foto wajah berhasil didaftarkan!',
                'sampleCount' => $result['sample_count'] ?? 1,
                'livenessScore' => $result['liveness_score'] ?? 100,
            ]);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(500)->setJSON([
                'ok' => false,
                'message' => 'Gagal mendaftarkan foto wajah: ' . $e->getMessage(),
            ]);
        }
    }

    public function testFace()
    {
        try {
            $context = $this->resolveSessionTenantAndUser();
            $userKey = $context['userKey'];
            $tenantId = $context['tenantId'];

            $payload = $this->request->getJSON(true) ?: [];
            $image = (string) ($payload['image'] ?? '');

            if ($image === '') {
                return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => 'Gambar kamera untuk pengujian wajib disertakan.']);
            }

            $result = $this->aiService->verifyFace($tenantId, $userKey, $image);

            return $this->response->setJSON([
                'ok' => true,
                'verified' => (bool) ($result['verified'] ?? false),
                'similarity' => (float) ($result['similarity'] ?? 0),
                'similarityPercent' => round(((float) ($result['similarity'] ?? 0)) * 100, 1),
                'matchedSample' => $result['matched_sample'] ?? 'Sampel #1',
                'sampleCount' => $result['sample_count'] ?? 1,
                'message' => $result['message'] ?? 'Pengujian pengenalan wajah selesai.',
            ]);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(500)->setJSON([
                'ok' => false,
                'message' => 'Gagal menguji verifikasi wajah: ' . $e->getMessage(),
            ]);
        }
    }

    public function verifyFacePose()
    {
        try {
            $payload = $this->request->getJSON(true) ?: [];
            $image = (string) ($payload['image'] ?? '');
            $targetPose = (string) ($payload['targetPose'] ?? 'center');

            if ($image === '') {
                return $this->response->setStatusCode(422)->setJSON([
                    'ok' => false,
                    'poseMatched' => false,
                    'message' => 'Gambar kamera wajib disertakan.',
                ]);
            }

            $result = $this->aiService->verifyFacePose($image, $targetPose);

            return $this->response->setJSON([
                'ok' => true,
                'targetPose' => $targetPose,
                'poseMatched' => (bool) ($result['pose_matched'] ?? false),
                'confidence' => (float) ($result['confidence'] ?? 0),
                'guidanceMessage' => $result['guidance_message'] ?? 'Memverifikasi pose wajah...',
            ]);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(500)->setJSON([
                'ok' => false,
                'targetPose' => 'center',
                'poseMatched' => false,
                'confidence' => 0.0,
                'guidanceMessage' => 'Gagal memverifikasi pose: ' . $e->getMessage(),
            ]);
        }
    }

    public function deleteFace()
    {
        try {
            $context = $this->resolveSessionTenantAndUser();
            $userKey = $context['userKey'];
            $tenantId = $context['tenantId'];

            $result = $this->aiService->deleteFace($userKey, $tenantId);

            return $this->response->setJSON([
                'ok' => true,
                'message' => $result['message'] ?? 'Semua foto sampel wajah berhasil dihapus.',
            ]);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(500)->setJSON([
                'ok' => false,
                'message' => 'Gagal menghapus data wajah: ' . $e->getMessage(),
            ]);
        }
    }

    public function openCameraDevice()
    {
        try {
            $json = $this->request->getJSON(true) ?? [];
            $cameraIndex = (int) ($json['cameraIndex'] ?? 0);

            $res = $this->aiService->openCameraDevice($cameraIndex);
            return $this->response->setJSON($res);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(500)->setJSON([
                'ok' => false,
                'message' => 'Gagal membuka device kamera di Python: ' . $e->getMessage(),
            ]);
        }
    }

    public function closeCameraDevice()
    {
        try {
            $json = $this->request->getJSON(true) ?? [];
            $sessionId = $json['sessionId'] ?? '';

            $res = $this->aiService->closeCameraDevice($sessionId);
            return $this->response->setJSON($res);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(500)->setJSON([
                'ok' => false,
                'message' => 'Gagal menutup device kamera di Python: ' . $e->getMessage(),
            ]);
        }
    }

    public function openFingerprintDevice()
    {
        try {
            $json = $this->request->getJSON(true) ?? [];
            $vendor = (string) ($json['vendor'] ?? 'Generic');
            $deviceIndex = (int) ($json['deviceIndex'] ?? 0);

            $res = $this->aiService->openFingerprintDevice($vendor, $deviceIndex);
            if (isset($res['session_id']) && ! isset($res['sessionId'])) {
                $res['sessionId'] = $res['session_id'];
            }
            return $this->response->setJSON($res);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(500)->setJSON([
                'ok' => false,
                'message' => 'Gagal membuka device sidik jari di Python: ' . $e->getMessage(),
            ]);
        }
    }

    public function closeFingerprintDevice()
    {
        try {
            $json = $this->request->getJSON(true) ?? [];
            $sessionId = (string) ($json['sessionId'] ?? $json['session_id'] ?? '');

            $res = $this->aiService->closeFingerprintDevice($sessionId);
            if (isset($res['session_id']) && ! isset($res['sessionId'])) {
                $res['sessionId'] = $res['session_id'];
            }
            return $this->response->setJSON($res);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(500)->setJSON([
                'ok' => false,
                'message' => 'Gagal menutup device sidik jari di Python: ' . $e->getMessage(),
            ]);
        }
    }

    public function captureFingerprintFrame()
    {
        try {
            $json = $this->request->getJSON(true) ?? [];
            $sessionId = (string) ($json['sessionId'] ?? $json['session_id'] ?? '');

            $res = $this->aiService->captureFingerprintFrame($sessionId);
            if (isset($res['session_id']) && ! isset($res['sessionId'])) {
                $res['sessionId'] = $res['session_id'];
            }
            return $this->response->setJSON($res);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(500)->setJSON([
                'ok' => false,
                'message' => 'Gagal membaca data frame sidik jari di Python: ' . $e->getMessage(),
            ]);
        }
    }

    public function registerFingerprint()
    {
        try {
            $context = $this->resolveSessionTenantAndUser();
            $userKey = $context['userKey'];
            $tenantId = $context['tenantId'];

            $payload = $this->request->getJSON(true) ?: [];
            $templateData = (string) ($payload['templateData'] ?? $payload['template_data'] ?? '');
            $vendor = (string) ($payload['vendor'] ?? 'Generic');

            if ($templateData === '') {
                return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => 'Data template sidik jari wajib disertakan.']);
            }

            $result = $this->aiService->registerFingerprint($tenantId, $userKey, $templateData, $vendor);

            if (! ($result['ok'] ?? false)) {
                return $this->response->setStatusCode(400)->setJSON([
                    'ok' => false,
                    'message' => $result['detail'] ?? $result['message'] ?? 'Gagal memproses pendaftaran sidik jari.',
                ]);
            }

            return $this->response->setJSON([
                'ok' => true,
                'message' => $result['message'] ?? 'Template sidik jari berhasil didaftarkan!',
                'sampleCount' => $result['sample_count'] ?? 1,
            ]);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(500)->setJSON([
                'ok' => false,
                'message' => 'Gagal mendaftarkan template sidik jari: ' . $e->getMessage(),
            ]);
        }
    }

    public function testFingerprint()
    {
        try {
            $context = $this->resolveSessionTenantAndUser();
            $userKey = $context['userKey'];
            $tenantId = $context['tenantId'];

            $payload = $this->request->getJSON(true) ?: [];
            $templateData = (string) ($payload['templateData'] ?? $payload['template_data'] ?? '');
            $vendor = (string) ($payload['vendor'] ?? 'Generic');

            if ($templateData === '') {
                return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => 'Data template sidik jari wajib disertakan.']);
            }

            $result = $this->aiService->verifyFingerprint($tenantId, $userKey, $templateData, $vendor);

            $similarity = (float) ($result['similarity'] ?? 0);
            $similarityPercent = round($similarity * 100, 1);
            $thresholdPercent = round(((float) ($result['threshold'] ?? 0.70)) * 100, 1);

            return $this->response->setJSON([
                'ok' => true,
                'verified' => (bool) ($result['verified'] ?? false),
                'similarity' => $similarity,
                'similarityPercent' => $similarityPercent,
                'thresholdPercent' => $thresholdPercent,
                'matchedSample' => $result['matched_sample'] ?? 'Sampel #1',
                'sampleCount' => $result['sample_count'] ?? 1,
                'vendor' => $result['vendor'] ?? $vendor,
                'testedTemplateSnippet' => substr($templateData, 0, 32) . '...',
                'message' => $result['message'] ?? 'Pengujian verifikasi sidik jari selesai.',
            ]);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(500)->setJSON([
                'ok' => false,
                'message' => 'Gagal menguji verifikasi sidik jari: ' . $e->getMessage(),
            ]);
        }
    }

    public function deleteFingerprint()
    {
        try {
            $context = $this->resolveSessionTenantAndUser();
            $userKey = $context['userKey'];
            $tenantId = $context['tenantId'];

            $result = $this->aiService->deleteFingerprint($userKey, $tenantId);

            return $this->response->setJSON([
                'ok' => true,
                'message' => $result['message'] ?? 'Semua template sidik jari berhasil dihapus.',
            ]);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(500)->setJSON([
                'ok' => false,
                'message' => 'Gagal menghapus data sidik jari: ' . $e->getMessage(),
            ]);
        }
    }

    public function verifyFingerprintStep()
    {
        try {
            $payload = $this->request->getJSON(true) ?? [];
            $currentStep = (int) ($payload['currentStep'] ?? $payload['current_step'] ?? 1);
            $templateData = (string) ($payload['templateData'] ?? $payload['template_data'] ?? '');
            $vendor = (string) ($payload['vendor'] ?? 'Generic');
            $previousSamples = (array) ($payload['previousSamples'] ?? $payload['previous_samples'] ?? []);

            if ($templateData === '') {
                return $this->response->setStatusCode(422)->setJSON([
                    'ok' => false,
                    'stepPassed' => false,
                    'message' => 'Data template sidik jari wajib disertakan.',
                ]);
            }

            $result = $this->aiService->verifyFingerprintStep($currentStep, $templateData, $vendor, $previousSamples);

            return $this->response->setJSON([
                'ok' => true,
                'currentStep' => $currentStep,
                'stepPassed' => (bool) ($result['step_passed'] ?? false),
                'repeatStep' => $result['repeat_step'] ?? null,
                'allCompleted' => (bool) ($result['all_completed'] ?? false),
                'similarityScore' => (float) ($result['similarity_score'] ?? 0.0),
                'message' => $result['message'] ?? 'Memverifikasi langkah pendaftaran...',
            ]);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(500)->setJSON([
                'ok' => false,
                'stepPassed' => false,
                'message' => 'Gagal memverifikasi langkah pendaftaran: ' . $e->getMessage(),
            ]);
        }
    }
}
