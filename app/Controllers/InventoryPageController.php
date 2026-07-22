<?php

namespace App\Controllers;

use App\Presenters\Page\InventoryPagePresenter;
use App\Services\Api\InventoryApiService;
use App\Services\TenantDatabaseService;

class InventoryPageController extends BaseController
{
    private const PAGES = [
        'overview' => 'inventory.html',
        'list' => 'inventory-list.html',
        'purchase' => 'purchases.html',
        'finished-products' => 'finished-products.html',
    ];

    private TenantDatabaseService $tenantDb;
    private InventoryApiService $inventoryApi;
    private InventoryPagePresenter $presenter;

    public function __construct(
        ?TenantDatabaseService $tenantDb = null,
        ?InventoryApiService $inventoryApi = null,
        ?InventoryPagePresenter $presenter = null
    ) {
        $this->tenantDb = $tenantDb ?? service('tenantDatabaseService');
        $this->inventoryApi = $inventoryApi ?? service('inventoryApiService');
        $this->presenter = $presenter ?? service('inventoryPagePresenter');
    }

    public function show(string $page)
    {
        return $this->renderPage($page);
    }

    public function tenant(string $slug, string $page)
    {
        $company = $this->tenantDb->companyBySlug($slug);
        if (! $company) {
            return $this->response->setStatusCode(404)->setBody('Company route tidak ditemukan.');
        }

        return $this->renderPage($page, (string) ($company['route_slug'] ?? $slug));
    }

    public function bootstrap()
    {
        [$companyId, $outletId] = $this->scope();
        $view = trim((string) ($this->request->getGet('view') ?? 'overview'));
        $data = $this->inventoryApi->pageData($companyId, $outletId, $this->request->getGet());

        return $this->response->setJSON([
            'ok' => true,
            'data' => $this->presenter->bootstrap($data, ['view' => $view]),
        ]);
    }

    private function renderPage(string $page, string $companySlug = ''): \CodeIgniter\HTTP\ResponseInterface
    {
        if (! isset(self::PAGES[$page])) {
            return $this->response->setStatusCode(404)->setBody('Halaman inventory tidak ditemukan.');
        }

        $target = realpath(FCPATH . 'pages/' . self::PAGES[$page]);
        $publicRoot = realpath(FCPATH);
        if (! $target || ! $publicRoot || ! str_starts_with($target, $publicRoot) || ! is_file($target)) {
            return $this->response->setStatusCode(404)->setBody('Halaman inventory tidak ditemukan.');
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
