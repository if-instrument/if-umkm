<?php

namespace App\Controllers;

use App\Presenters\Page\SettingsPagePresenter;
use App\Services\Api\AccessApiService;
use App\Services\Api\SettingsApiService;
use App\Services\TenantDatabaseService;

class SettingsPageController extends BaseController
{
    private TenantDatabaseService $tenantDb;
    private SettingsApiService $settingsApi;
    private AccessApiService $accessApi;
    private SettingsPagePresenter $presenter;

    public function __construct(
        ?TenantDatabaseService $tenantDb = null,
        ?SettingsApiService $settingsApi = null,
        ?AccessApiService $accessApi = null,
        ?SettingsPagePresenter $presenter = null
    ) {
        $this->tenantDb = $tenantDb ?? service('tenantDatabaseService');
        $this->settingsApi = $settingsApi ?? service('settingsApiService');
        $this->accessApi = $accessApi ?? service('accessApiService');
        $this->presenter = $presenter ?? service('settingsPagePresenter');
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
        [$companyId, $outletId] = $this->scope();
        $settingsPage = $this->settingsApi->pageData($companyId, $outletId, $this->request->getGet());
        $accessData = $this->accessApi->pageData($companyId, false);

        return $this->response->setJSON([
            'ok' => true,
            'data' => $this->presenter->bootstrap(
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

        return $this->renderHtmlResponse($html, $inject);
    }

    private function scope(): array
    {
        return [
            (int) ($this->request->getGet('company_id') ?? 1),
            (int) ($this->request->getGet('outlet_id') ?? 1),
        ];
    }
}
