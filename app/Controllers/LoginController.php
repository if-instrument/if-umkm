<?php

namespace App\Controllers;

use App\Presenters\Page\LoginPagePresenter;
use App\Services\Api\AuthApiService;
use App\Services\TenantDatabaseService;

class LoginController extends BaseController
{
    private TenantDatabaseService $tenantDb;
    private AuthApiService $authApi;
    private LoginPagePresenter $presenter;

    public function __construct(
        ?TenantDatabaseService $tenantDb = null,
        ?AuthApiService $authApi = null,
        ?LoginPagePresenter $presenter = null
    ) {
        $this->tenantDb = $tenantDb ?? service('tenantDatabaseService');
        $this->authApi = $authApi ?? service('authApiService');
        $this->presenter = $presenter ?? service('loginPagePresenter');
    }

    public function show()
    {
        return $this->renderLoginPage();
    }

    public function tenant(string $slug)
    {
        $company = $this->tenantDb->companyBySlug($slug);
        if (! $company) {
            return $this->response->setStatusCode(404)->setBody('Company route tidak ditemukan.');
        }

        return $this->renderLoginPage((string) ($company['route_slug'] ?? $slug));
    }

    public function bootstrap()
    {
        return $this->jsonAction(function () {
            $slug = trim((string) ($this->request->getGet('companySlug') ?? $this->request->getGet('company') ?? ''));
            $data = $this->authApi->bootstrap($slug);
            if ($slug !== '' && ! $data['company']) {
                return $this->response->setStatusCode(404)->setJSON([
                    'ok' => false,
                    'message' => 'Company route tidak ditemukan.',
                ]);
            }

            return $this->presenter->bootstrap($data);
        });
    }

    public function publicSaasPlans()
    {
        return $this->jsonAction(function () {
            $plans = (new \App\Services\AccessManagementService())->saasPlans();
            return array_values(array_filter($plans, fn ($p) => (string) ($p['status'] ?? '10') === '10'));
        });
    }

    public function publicCentralPaymentAccounts()
    {
        return $this->jsonAction(function () {
            $accounts = (new \App\Services\AccessManagementService())->centralPaymentAccounts();
            return array_values(array_filter($accounts, fn ($a) => (string) ($a['status'] ?? '10') === '10'));
        });
    }

    public function publicRegisterCompany()
    {
        return $this->jsonAction(function () {
            $payload = $this->request->getJSON(true) ?: [];
            return (new \App\Services\AccessManagementService())->publicRegisterCompany($payload);
        });
    }

    public function publicForgotPassword()
    {
        return $this->jsonAction(function () {
            $payload = $this->request->getJSON(true) ?: [];
            return (new \App\Services\AccessManagementService())->publicForgotPassword($payload);
        });
    }

    public function uploadPaymentProof()
    {
        return (new \App\Controllers\Api\AccessController())->uploadPaymentProof();
    }

    public function uploadCompanyLogo()
    {
        return (new \App\Controllers\Api\AccessController())->uploadLogo();
    }

    public function changePassword()
    {
        return $this->jsonAction(function () {
            $payload = $this->request->getJSON(true) ?: [];
            $email = strtolower(trim((string) ($payload['email'] ?? '')));
            $currentPassword = (string) ($payload['currentPassword'] ?? '');
            $newPassword = (string) ($payload['newPassword'] ?? '');
            $companySlug = trim((string) ($payload['companySlug'] ?? ''));

            if (! $email || ! $newPassword) {
                throw new \InvalidArgumentException('Email dan Password baru wajib diisi.');
            }
            if (strlen($newPassword) < 8) {
                throw new \InvalidArgumentException('Password baru minimal 8 karakter.');
            }

            $userModel = new \App\Models\UserModel();
            $user = $userModel->where('email', $email)->first();
            if (! $user) {
                throw new \InvalidArgumentException('User tidak ditemukan.');
            }

            if (! password_verify($currentPassword, $user['password_hash'])) {
                throw new \InvalidArgumentException('Password saat ini/sementara tidak sesuai.');
            }

            log_message('info', "Attempting password change for email: {$email}, companySlug: {$companySlug}");

            $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
            $userModel->update($user['id'], [
                'password_hash' => $newHash,
                'must_change_password' => 0,
                'updated_at' => date('Y-m-d H:i:s'),
            ]);

            if ($companySlug) {
                $tenantDb = (new \App\Services\TenantDatabaseService())->connectionForCompanySlug($companySlug);
                if ($tenantDb && $tenantDb->tableExists('users')) {
                    $tenantDb->table('users')->where('email', $email)->update([
                        'password_hash' => $newHash,
                        'must_change_password' => 0,
                        'updated_at' => date('Y-m-d H:i:s'),
                    ]);
                }
            }

            log_message('info', "Password successfully changed for email: {$email}. must_change_password set to 0 in both Central and Tenant DB.");
            (new \App\Services\AccessManagementService())->recordAuditLog((int) ($user['company_id'] ?? 0), (int) $user['id'], 'PASSWORD_CHANGED_FIRST_LOGIN', 'Pengguna berhasil mengganti password sementara.');

            return [
                'ok' => true,
                'message' => 'Password berhasil diperbarui. Silakan login dengan password baru Anda.',
            ];
        });
    }

    public function submit()
    {
        $payload = $this->request->getJSON(true) ?: [];
        $result = $this->authApi->login(
            (string) ($payload['email'] ?? ''),
            (string) ($payload['password'] ?? ''),
            (string) ($payload['companySlug'] ?? '')
        );

        if (! ($result['ok'] ?? false)) {
            $status = (int) ($result['status'] ?? 401);
            unset($result['status']);

            return $this->response->setStatusCode($status)->setJSON($result);
        }

        return $this->response->setJSON($result);
    }

    public function faceVerify()
    {
        try {
            $payload = $this->request->getJSON(true) ?: [];
            $imageBase64 = (string) ($payload['image'] ?? '');
            $email = strtolower(trim((string) ($payload['email'] ?? '')));
            $companySlug = (string) ($payload['companySlug'] ?? '');
            $userId = (string) ($payload['userId'] ?? '');
            $tenantId = (string) ($payload['companyId'] ?? $companySlug ?: 'company-main');

            if ($email !== '') {
                $userModel = new \App\Models\UserModel();
                $foundUser = $userModel->where('email', $email)->first();
                if ($foundUser) {
                    $userId = (string) ($foundUser['id'] ?? $userId);
                }
            }

            if (! $userId || $userId === 'usr-01' || $userId === '01') {
                $userModel = new \App\Models\UserModel();
                $foundUser = $userModel->whereIn('status', ['ACTIVE', 'active', '1', 1])->first();
                if ($foundUser) {
                    $userId = (string) ($foundUser['id'] ?? '1');
                }
            }

            $formattedUserId = (str_starts_with($userId, 'usr-') || $userId === '') ? $userId : ('usr-' . $userId);

            $ai = service('aiService');
            $verifyRes = $ai->verifyFace($tenantId, $formattedUserId, $imageBase64);

            $verified = (bool) ($verifyRes['verified'] ?? false);
            $similarity = (float) ($verifyRes['similarity'] ?? 0);
            $percent = round($similarity * 100, 1);
            $sampleName = $verifyRes['matched_sample'] ?? 'Sampel #1';

            if (! $verified) {
                return $this->response->setStatusCode(422)->setJSON([
                    'ok' => false,
                    'verified' => false,
                    'similarity' => $similarity,
                    'similarityPercent' => $percent,
                    'message' => $verifyRes['message'] ?? 'Verifikasi wajah belum memenuhi batas minimal.',
                ]);
            }

            return $this->response->setJSON([
                'ok' => true,
                'verified' => true,
                'similarity' => $similarity,
                'similarityPercent' => $percent,
                'matchedSample' => $sampleName,
                'sampleCount' => $verifyRes['sample_count'] ?? 1,
                'message' => $verifyRes['message'] ?? "Wajah terverifikasi cocok dengan {$sampleName} ({$percent}%)",
            ]);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(500)->setJSON([
                'ok' => false,
                'verified' => false,
                'message' => 'Gagal memverifikasi wajah: ' . $e->getMessage(),
            ]);
        }
    }

    public function faceIdentify()
    {
        try {
            $payload = $this->request->getJSON(true) ?: [];
            $imageBase64 = (string) ($payload['image'] ?? '');
            $companySlug = (string) ($payload['companySlug'] ?? '');

            $ai = service('aiService');
            $identifyRes = $ai->identifyFace($imageBase64, $companySlug);

            $verified = (bool) ($identifyRes['verified'] ?? false);
            $userKey = (string) ($identifyRes['user_key'] ?? '');
            $similarity = (float) ($identifyRes['similarity'] ?? 0);
            $percent = round($similarity * 100, 1);

            if (! $verified || $userKey === '') {
                return $this->response->setStatusCode(422)->setJSON([
                    'ok' => false,
                    'verified' => false,
                    'message' => 'Wajah tidak teridentifikasi pada sistem.',
                ]);
            }

            $userModel = new \App\Models\UserModel();
            $user = $userModel->where('user_key', $userKey)->first();

            if (! $user) {
                return $this->response->setStatusCode(404)->setJSON([
                    'ok' => false,
                    'verified' => false,
                    'message' => 'Pengguna biometrik tidak ditemukan di database.',
                ]);
            }

            $authResult = $this->authApi->loginByEmail((string) $user['email'], $companySlug);

            if (! ($authResult['ok'] ?? false)) {
                return $this->response->setStatusCode(422)->setJSON([
                    'ok' => false,
                    'verified' => false,
                    'message' => 'Gagal membuat sesi login biometrik.',
                ]);
            }

            return $this->response->setJSON([
                'ok' => true,
                'verified' => true,
                'user' => $authResult['user'],
                'accessContext' => $authResult['accessContext'],
                'token' => $authResult['token'],
                'similarity' => $similarity,
                'similarityPercent' => $percent,
                'matchedSample' => $identifyRes['matched_sample'] ?? 'Sampel #1',
                'message' => "Wajah teridentifikasi sebagai {$user['name']} ({$percent}%)",
            ]);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(500)->setJSON([
                'ok' => false,
                'verified' => false,
                'message' => 'Gagal mengidentifikasi wajah: ' . $e->getMessage(),
            ]);
        }
    }

    public function fingerprintVerify()
    {
        return $this->jsonAction(function () {
            $payload = $this->request->getJSON(true) ?: [];
            $templateData = (string) ($payload['templateData'] ?? '');
            $vendor = (string) ($payload['vendor'] ?? 'Generic');
            $companySlug = (string) ($payload['companySlug'] ?? '');
            $userId = (string) ($payload['userId'] ?? '');
            $tenantId = (string) ($payload['companyId'] ?? $companySlug ?: 'company-main');

            $formattedUserId = (str_starts_with($userId, 'usr-') || $userId === '') ? $userId : ('usr-' . $userId);

            $ai = service('aiService');
            $verifyRes = $ai->verifyFingerprint($tenantId, $formattedUserId, $templateData, $vendor);

            if (! ($verifyRes['verified'] ?? false)) {
                return $this->response->setStatusCode(422)->setJSON([
                    'ok' => false,
                    'message' => $verifyRes['message'] ?? 'Verifikasi sidik jari gagal.',
                ]);
            }

            return ['ok' => true, 'verified' => true, 'message' => 'Verifikasi sidik jari berhasil!'];
        });
    }

    public function fingerprintIdentify()
    {
        try {
            $payload = $this->request->getJSON(true) ?: [];
            $templateData = (string) ($payload['templateData'] ?? $payload['template_data'] ?? '');
            $vendor = (string) ($payload['vendor'] ?? 'Generic');
            $companySlug = (string) ($payload['companySlug'] ?? '');

            if ($templateData === '') {
                return $this->response->setStatusCode(422)->setJSON([
                    'ok' => false,
                    'verified' => false,
                    'message' => 'Data template sidik jari wajib disertakan.',
                ]);
            }

            $ai = service('aiService');
            $identifyRes = $ai->identifyFingerprint($templateData, $vendor, $companySlug);

            $verified = (bool) ($identifyRes['verified'] ?? false);
            $userKey = (string) ($identifyRes['user_key'] ?? '');
            $similarity = (float) ($identifyRes['similarity'] ?? 0);
            $percent = round($similarity * 100, 1);

            if (! $verified || $userKey === '') {
                return $this->response->setStatusCode(422)->setJSON([
                    'ok' => false,
                    'verified' => false,
                    'message' => 'Sidik jari tidak teridentifikasi pada sistem.',
                ]);
            }

            $userModel = new \App\Models\UserModel();
            $user = $userModel->where('user_key', $userKey)->first();

            if (! $user) {
                return $this->response->setStatusCode(404)->setJSON([
                    'ok' => false,
                    'verified' => false,
                    'message' => 'Pengguna biometrik sidik jari tidak ditemukan di database.',
                ]);
            }

            $authResult = $this->authApi->loginByEmail((string) $user['email'], $companySlug);

            if (! ($authResult['ok'] ?? false)) {
                return $this->response->setStatusCode(422)->setJSON([
                    'ok' => false,
                    'verified' => false,
                    'message' => 'Gagal membuat sesi login biometrik.',
                ]);
            }

            return $this->response->setJSON([
                'ok' => true,
                'verified' => true,
                'user' => $authResult['user'],
                'accessContext' => $authResult['accessContext'],
                'token' => $authResult['token'],
                'similarity' => $similarity,
                'similarityPercent' => $percent,
                'matchedSample' => $identifyRes['matched_sample'] ?? 'Sampel #1',
                'message' => "Sidik jari teridentifikasi sebagai {$user['name']} ({$percent}%)",
            ]);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(500)->setJSON([
                'ok' => false,
                'verified' => false,
                'message' => 'Gagal mengidentifikasi sidik jari: ' . $e->getMessage(),
            ]);
        }
    }

    public function openFingerprintDevice()
    {
        try {
            $json = $this->request->getJSON(true) ?? [];
            $vendor = (string) ($json['vendor'] ?? 'Generic');
            $deviceIndex = (int) ($json['deviceIndex'] ?? 0);

            $ai = service('aiService');
            $res = $ai->openFingerprintDevice($vendor, $deviceIndex);
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

    public function captureFingerprintFrame()
    {
        try {
            $json = $this->request->getJSON(true) ?? [];
            $sessionId = (string) ($json['sessionId'] ?? $json['session_id'] ?? '');

            $ai = service('aiService');
            $res = $ai->captureFingerprintFrame($sessionId);
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

    public function closeFingerprintDevice()
    {
        try {
            $json = $this->request->getJSON(true) ?? [];
            $sessionId = (string) ($json['sessionId'] ?? $json['session_id'] ?? '');

            $ai = service('aiService');
            $res = $ai->closeFingerprintDevice($sessionId);
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

    private function renderLoginPage(string $companySlug = ''): \CodeIgniter\HTTP\ResponseInterface
    {
        $target = realpath(FCPATH . 'login.html');
        $publicRoot = realpath(FCPATH);
        if (! $target || ! $publicRoot || ! str_starts_with($target, $publicRoot) || ! is_file($target)) {
            return $this->response->setStatusCode(404)->setBody('Halaman login tidak ditemukan.');
        }

        $html = file_get_contents($target) ?: '';
        $inject = '<base href="/">';
        if ($companySlug !== '') {
            $inject .= '<script>window.__COMPANY_SLUG__=' . json_encode($companySlug) . ';</script>';
        }
        return $this->renderHtmlResponse($html, $inject);
    }

    private function jsonAction(callable $action)
    {
        try {
            $result = $action();
            if ($result instanceof \CodeIgniter\HTTP\ResponseInterface) {
                return $result;
            }

            return $this->response->setJSON(['ok' => true, 'data' => $result]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON([
                'ok' => false,
                'message' => $exception->getMessage(),
            ]);
        }
    }
}
