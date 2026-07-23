<?php

namespace App\Controllers;

use App\Services\TenantDatabaseService;

class AppPageController extends BaseController
{
    private TenantDatabaseService $tenantDb;

    public function __construct(?TenantDatabaseService $tenantDb = null)
    {
        $this->tenantDb = $tenantDb ?? service('tenantDatabaseService');
    }

    public function dashboard()
    {
        return $this->renderHtml('index.html');
    }

    public function tenantDashboard(string $slug)
    {
        return $this->renderTenantHtml($slug, 'index.html');
    }

    public function page(string $path)
    {
        return $this->renderHtml('pages/' . $path);
    }

    public function tenantPage(string $slug, string $path)
    {
        return $this->renderTenantHtml($slug, 'pages/' . $path);
    }

    public function cardPayment(string $reference)
    {
        return $this->renderHtml('pages/card-payment.html', [
            '__PAYMENT_REFERENCE__' => $reference,
        ]);
    }

    public function invitation(string $token)
    {
        return $this->renderHtml('pages/invitation.html', [
            '__INVITATION_TOKEN__' => $token,
        ]);
    }

    private function renderTenantHtml(string $slug, string $path): \CodeIgniter\HTTP\ResponseInterface
    {
        $company = $this->tenantDb->companyBySlug($slug);
        if (! $company) {
            return $this->response->setStatusCode(404)->setBody('Company route tidak ditemukan.');
        }

        return $this->renderHtml($path, [
            '__COMPANY_SLUG__' => (string) ($company['route_slug'] ?? $slug),
        ]);
    }

    private function renderHtml(string $path, array $globals = []): \CodeIgniter\HTTP\ResponseInterface
    {
        $target = realpath(FCPATH . ltrim($path, '/'));
        $publicRoot = realpath(FCPATH);
        if (! $target || ! $publicRoot || ! str_starts_with($target, $publicRoot) || ! is_file($target) || pathinfo($target, PATHINFO_EXTENSION) !== 'html') {
            return $this->response->setStatusCode(404)->setBody('Halaman tidak ditemukan.');
        }

        $inject = '<base href="/">';
        foreach ($globals as $name => $value) {
            $inject .= '<script>window.' . $name . '=' . json_encode($value) . ';</script>';
        }

        $html = file_get_contents($target) ?: '';
        return $this->renderHtmlResponse($html, $inject);
    }
}
