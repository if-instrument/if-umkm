<?php

namespace App\Controllers;

use App\Presenters\Page\SettingsPagePresenter;
use App\Services\Api\AccessApiService;
use App\Services\Api\SettingsApiService;
use App\Services\TenantDatabaseService;

class SettingsPageController extends BaseController
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
        [$companyId, $outletId] = $this->scope();
        $settingsPage = (new SettingsApiService())->pageData($companyId, $outletId, $this->request->getGet());
        $accessData = (new AccessApiService())->pageData($companyId, false);

        return $this->response->setJSON([
            'ok' => true,
            'data' => (new SettingsPagePresenter())->bootstrap(
                $accessData,
                $settingsPage['settings'] ?? [],
                $settingsPage['ingredients'] ?? []
            ),
        ]);
    }

    private function renderPage(string $companySlug = ''): \CodeIgniter\HTTP\ResponseInterface
    {
        $target = realpath(FCPATH . 'pages/settings.html');
        $publicRoot = realpath(FCPATH);
        if (! $target || ! $publicRoot || ! str_starts_with($target, $publicRoot) || ! is_file($target)) {
            return $this->response->setStatusCode(404)->setBody('Halaman pengaturan tidak ditemukan.');
        }

        $html = file_get_contents($target) ?: '';
        $inject = '<base href="/">';
        if ($companySlug !== '') {
            $inject .= '<script>window.__COMPANY_SLUG__=' . json_encode($companySlug) . ';</script>';
        }

        return $this->response->setContentType('text/html')->setBody(str_replace('<head>', '<head>' . $inject, $html));
    }

    private function scope(): array
    {
        return [
            (int) ($this->request->getGet('company_id') ?? 1),
            (int) ($this->request->getGet('outlet_id') ?? 1),
        ];
    }
}
