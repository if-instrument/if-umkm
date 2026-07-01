<?php

namespace App\Controllers;

use App\Presenters\Page\UserRolePagePresenter;
use App\Services\Api\AccessApiService;
use App\Services\TenantDatabaseService;

class UserRoleController extends BaseController
{
    public function show()
    {
        return $this->renderPage();
    }

    public function tenant(string $slug)
    {
        $company = (new TenantDatabaseService())->companyBySlug($slug);
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
        $data = (new AccessApiService())->pageData($companyId, $isSuperAdmin);

        return $this->response->setJSON([
            'ok' => true,
            'data' => (new UserRolePagePresenter())->bootstrap($data),
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

        return $this->response->setContentType('text/html')->setBody(str_replace('<head>', '<head>' . $inject, $html));
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
