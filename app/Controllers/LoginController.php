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
