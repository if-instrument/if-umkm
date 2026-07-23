<?php

namespace App\Controllers;

use App\Presenters\Page\ProductPagePresenter;
use App\Services\Api\ProductApiService;
use App\Services\TenantDatabaseService;

class ProductPageController extends BaseController
{
    private const PAGES = [
        'categories' => 'categories.html',
        'products' => 'products.html',
        'modifiers' => 'modifiers.html',
        'recipes' => 'recipes.html',
        'ingredient-mapping' => 'ingredient-mapping.html',
        'ingredient-templates' => 'ingredient-templates.html',
    ];

    private TenantDatabaseService $tenantDb;
    private ProductApiService $productApi;
    private ProductPagePresenter $presenter;

    public function __construct(
        ?TenantDatabaseService $tenantDb = null,
        ?ProductApiService $productApi = null,
        ?ProductPagePresenter $presenter = null
    ) {
        $this->tenantDb = $tenantDb ?? service('tenantDatabaseService');
        $this->productApi = $productApi ?? service('productApiService');
        $this->presenter = $presenter ?? service('productPagePresenter');
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
        $view = trim((string) ($this->request->getGet('view') ?? 'products'));
        $data = $this->productApi->pageData($companyId, $outletId, $this->request->getGet());

        return $this->response->setJSON([
            'ok' => true,
            'data' => $this->presenter->bootstrap($data, ['view' => $view]),
        ]);
    }

    private function renderPage(string $page, string $companySlug = ''): \CodeIgniter\HTTP\ResponseInterface
    {
        if (! isset(self::PAGES[$page])) {
            return $this->response->setStatusCode(404)->setBody('Halaman produk tidak ditemukan.');
        }

        $target = realpath(FCPATH . 'pages/' . self::PAGES[$page]);
        $publicRoot = realpath(FCPATH);
        if (! $target || ! $publicRoot || ! str_starts_with($target, $publicRoot) || ! is_file($target)) {
            return $this->response->setStatusCode(404)->setBody('Halaman produk tidak ditemukan.');
        }

        $html = file_get_contents($target) ?: '';
        $inject = '<base href="/">';
        if ($companySlug !== '') {
            $inject .= '<script>window.__COMPANY_SLUG__=' . json_encode($companySlug) . ';</script>';
        }
        $html = file_get_contents($target) ?: '';
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
