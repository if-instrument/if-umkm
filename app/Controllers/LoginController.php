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
            $rawCompany = $this->tenantDb->rawCompanyBySlug($slug);
            if ($rawCompany) {
                $status = (string) ($rawCompany['status'] ?? '');
                if ($status !== '10' && strtolower($status) !== 'active') {
                    return $this->renderAccessBlockedPage(
                        $rawCompany['name'] ?? 'Perusahaan',
                        'Akses Ditolak: Perusahaan Tidak Aktif',
                        'Status perusahaan ini saat ini sedang tidak aktif atau belum disetujui. Silakan hubungi Administrator Super Admin.'
                    );
                }
                if (! empty($rawCompany['expires_at'])) {
                    $expiryTime = strtotime(substr((string) $rawCompany['expires_at'], 0, 10));
                    if ($expiryTime < strtotime(date('Y-m-d'))) {
                        return $this->renderAccessBlockedPage(
                            $rawCompany['name'] ?? 'Perusahaan',
                            'Akses Ditolak: Masa Aktif Lisensi Kadaluarsa',
                            'Masa berlaku lisensi perusahaan ini telah berakhir pada ' . date('d-m-Y', $expiryTime) . '. Silakan hubungi Super Admin untuk memperbarui langganan SaaS Anda.'
                        );
                    }
                }
            }
            return $this->response->setStatusCode(404)->setBody('Company route tidak ditemukan.');
        }

        return $this->renderLoginPage((string) ($company['route_slug'] ?? $slug));
    }

    private function renderAccessBlockedPage(string $companyName, string $title, string $message): \CodeIgniter\HTTP\ResponseInterface
    {
        $html = '<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: "Plus Jakarta Sans", sans-serif; }
        body { background: #f8fafc; color: #1e293b; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
        .card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); max-width: 480px; width: 100%; padding: 32px; text-align: center; }
        .icon-box { width: 64px; height: 64px; background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 28px; }
        .company-tag { background: #f1f5f9; color: #475569; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 20px; display: inline-block; margin-bottom: 12px; }
        h1 { font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 10px; }
        p { font-size: 14px; color: #64748b; line-height: 1.6; margin-bottom: 24px; }
        .btn { display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 10px 20px; border-radius: 8px; transition: all 0.2s; }
        .btn:hover { background: #1d4ed8; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon-box">🔒</div>
        <span class="company-tag">' . htmlspecialchars($companyName, ENT_QUOTES, 'UTF-8') . '</span>
        <h1>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</h1>
        <p>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p>
        <a href="/" class="btn">Kembali ke Portal Utama</a>
    </div>
</body>
</html>';

        return $this->response->setStatusCode(403)->setBody($html);
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

    public function publicRegistrationResubmitData()
    {
        return $this->jsonAction(function () {
            $token = trim((string) ($this->request->getGet('token') ?? ''));
            return (new \App\Services\AccessManagementService())->getRegistrationResubmitData($token);
        });
    }

    public function publicRegistrationResubmitSubmit()
    {
        return $this->jsonAction(function () {
            $payload = $this->request->getJSON(true) ?: [];
            return (new \App\Services\AccessManagementService())->submitRegistrationResubmit($payload);
        });
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
