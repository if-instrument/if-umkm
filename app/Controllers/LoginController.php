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
        $html = str_replace('<head>', '<head>' . $inject, $html);

        return $this->response->setContentType('text/html')->setBody($html);
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
