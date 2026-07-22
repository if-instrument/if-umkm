<?php

namespace App\Controllers;

use App\Presenters\Page\FinancePagePresenter;
use App\Services\Api\FinanceApiService;
use App\Services\TenantDatabaseService;

class FinancePageController extends BaseController
{
    private const PAGES = [
        'dashboard' => 'finance-dashboard.html',
        'profit-loss' => 'reports.html',
        'expenses' => 'finance-expenses.html',
        'settlement' => 'finance-settlement.html',
        'gateway-logs' => 'payment-gateway-logs.html',
    ];

    private TenantDatabaseService $tenantDb;
    private FinanceApiService $financeApi;
    private FinancePagePresenter $presenter;

    public function __construct(
        ?TenantDatabaseService $tenantDb = null,
        ?FinanceApiService $financeApi = null,
        ?FinancePagePresenter $presenter = null
    ) {
        $this->tenantDb = $tenantDb ?? service('tenantDatabaseService');
        $this->financeApi = $financeApi ?? service('financeApiService');
        $this->presenter = $presenter ?? service('financePagePresenter');
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
        $view = trim((string) ($this->request->getGet('view') ?? 'dashboard'));
        $claims = $this->request->jwt ?? [];
        if ($view === 'gateway-logs' && ($claims['authType'] ?? '') !== 'company_admin') {
            return $this->response->setStatusCode(403)->setJSON([
                'ok' => false,
                'message' => 'Log payment gateway hanya bisa dilihat admin perusahaan.',
            ]);
        }
        $data = $this->financeApi->pageData($companyId, $outletId, $this->request->getGet());

        return $this->response->setJSON([
            'ok' => true,
            'data' => $this->presenter->bootstrap($data, ['view' => $view]),
        ]);
    }

    private function renderPage(string $page, string $companySlug = ''): \CodeIgniter\HTTP\ResponseInterface
    {
        if (! isset(self::PAGES[$page])) {
            return $this->response->setStatusCode(404)->setBody('Halaman finance tidak ditemukan.');
        }

        $target = realpath(FCPATH . 'pages/' . self::PAGES[$page]);
        $publicRoot = realpath(FCPATH);
        if (! $target || ! $publicRoot || ! str_starts_with($target, $publicRoot) || ! is_file($target)) {
            return $this->response->setStatusCode(404)->setBody('Halaman finance tidak ditemukan.');
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
