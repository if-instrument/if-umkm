<?php

namespace App\Controllers;

use App\Presenters\Page\UserRolePagePresenter;
use App\Services\Api\AccessApiService;
use App\Services\TenantDatabaseService;

class UserRoleController extends BaseController
{
    private TenantDatabaseService $tenantDb;
    private AccessApiService $accessApi;
    private UserRolePagePresenter $presenter;

    public function __construct(
        ?TenantDatabaseService $tenantDb = null,
        ?AccessApiService $accessApi = null,
        ?UserRolePagePresenter $presenter = null
    ) {
        $this->tenantDb = $tenantDb ?? service('tenantDatabaseService');
        $this->accessApi = $accessApi ?? service('accessApiService');
        $this->presenter = $presenter ?? service('userRolePagePresenter');
    }

    public function show()
    {
        return $this->renderPage();
    }

    public function tenant(string $slug)
    {
        $company = $this->tenantDb->companyBySlug($slug);
        if (! $company) {
            return $this->response->setStatusCode(404)->setBody('Company route tidak ditemukan.');
        }

        return $this->renderPage((string) ($company['route_slug'] ?? $slug));
    }

    public function bootstrap()
    {
        $claims = (array) ($this->request->jwt ?? []);
        $isSuperAdmin = ($claims['authType'] ?? '') === 'super_admin';
        $companyId = $this->numericCompanyId((string) ($claims['companyId'] ?? $this->request->getGet('company_id') ?? 'company-main'));
        $data = $this->accessApi->pageData($companyId, $isSuperAdmin);

        return $this->response->setJSON([
            'ok' => true,
            'data' => $this->presenter->bootstrap($data),
        ]);
    }

    private function renderPage(string $companySlug = ''): \CodeIgniter\HTTP\ResponseInterface
    {
        $target = realpath(FCPATH . 'pages/users.html');
        $publicRoot = realpath(FCPATH);
        if (! $target || ! $publicRoot || ! str_starts_with($target, $publicRoot) || ! is_file($target)) {
            return $this->response->setStatusCode(404)->setBody('Halaman user role tidak ditemukan.');
        }

        $html = file_get_contents($target) ?: '';
        $inject = '<base href="/">';
        if ($companySlug !== '') {
            $inject .= '<script>window.__COMPANY_SLUG__=' . json_encode($companySlug) . ';</script>';
        }
        return $this->renderHtmlResponse($html, $inject);
    }

    private function numericCompanyId(string $companyId): int
    {
        if ($companyId === '' || $companyId === 'company-main') {
            return 1;
        }
        if (is_numeric($companyId)) {
            return (int) $companyId;
        }
        if (preg_match('/(\d+)$/', $companyId, $matches)) {
            return (int) $matches[1];
        }

        return 1;
    }
}
