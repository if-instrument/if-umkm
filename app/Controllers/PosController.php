<?php

namespace App\Controllers;

use App\Presenters\Page\PosPagePresenter;
use App\Services\Api\PosApiService;
use App\Services\Api\ProductApiService;
use App\Services\Api\SettingsApiService;
use App\Services\TenantDatabaseService;

class PosController extends BaseController
{
    public function show()
    {
        return $this->renderPosPage();
    }

    public function tenant(string $slug)
    {
        $company = (new TenantDatabaseService())->companyBySlug($slug);
        if (! $company) {
            return $this->response->setStatusCode(404)->setBody('Company route tidak ditemukan.');
        }

        return $this->renderPosPage((string) ($company['route_slug'] ?? $slug));
    }

    public function bootstrap()
    {
        [$companyId, $outletId] = $this->scope();
        $filters = $this->request->getGet();
        $date = trim((string) ($filters['date'] ?? '')) ?: date('Y-m-d');
        $perPage = min(200, max(25, (int) ($filters['per_page'] ?? $filters['perPage'] ?? 100)));

        $settingsData = (new SettingsApiService())->outletContext($companyId, $outletId);
        $productData = (new ProductApiService())->outletCatalog($companyId, $outletId);
        $orders = (new PosApiService())->activeOrders($companyId, $outletId, [
            'date' => $date,
            'include_open' => true,
            'per_page' => $perPage,
        ]);

        return $this->response->setJSON([
            'ok' => true,
            'data' => (new PosPagePresenter())->bootstrap($settingsData, $productData, $orders, [
                'date' => $date,
            ]),
        ]);
    }

    private function renderPosPage(string $companySlug = ''): \CodeIgniter\HTTP\ResponseInterface
    {
        $target = realpath(FCPATH . 'pages/pos.html');
        $publicRoot = realpath(FCPATH);
        if (! $target || ! $publicRoot || ! str_starts_with($target, $publicRoot) || ! is_file($target)) {
            return $this->response->setStatusCode(404)->setBody('Halaman POS tidak ditemukan.');
        }

        $html = file_get_contents($target) ?: '';
        $inject = '<base href="/">';
        if ($companySlug !== '') {
            $inject .= '<script>window.__COMPANY_SLUG__=' . json_encode($companySlug) . ';</script>';
        }
        $html = str_replace('<head>', '<head>' . $inject, $html);

        return $this->response->setContentType('text/html')->setBody($html);
    }

    private function scope(): array
    {
        return [
            (int) ($this->request->getGet('company_id') ?? 1),
            (int) ($this->request->getGet('outlet_id') ?? 1),
        ];
    }
}
