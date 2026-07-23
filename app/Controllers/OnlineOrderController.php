<?php

namespace App\Controllers;

use App\Presenters\Page\OnlineOrderPagePresenter;
use App\Services\Api\OnlineOrderApiService;
use App\Services\TenantDatabaseService;

class OnlineOrderController extends BaseController
{
    private TenantDatabaseService $tenantDb;
    private OnlineOrderApiService $onlineOrderApi;
    private OnlineOrderPagePresenter $presenter;

    public function __construct(
        ?TenantDatabaseService $tenantDb = null,
        ?OnlineOrderApiService $onlineOrderApi = null,
        ?OnlineOrderPagePresenter $presenter = null
    ) {
        $this->tenantDb = $tenantDb ?? service('tenantDatabaseService');
        $this->onlineOrderApi = $onlineOrderApi ?? service('onlineOrderApiService');
        $this->presenter = $presenter ?? service('onlineOrderPagePresenter');
    }

    public function show()
    {
        return $this->renderOrderPage();
    }

    public function tenant(string $slug)
    {
        $company = $this->tenantDb->companyBySlug($slug);
        $response = $this->response ?? response();
        if (! $company) {
            return $response->setStatusCode(404)->setBody('Company route tidak ditemukan.');
        }

        return $this->renderOrderPage((string) ($company['route_slug'] ?? $slug));
    }

    public function bootstrap()
    {
        return $this->jsonAction(fn () => $this->presenter->bootstrap(
            $this->onlineOrderApi->bootstrap($this->request->getGet())
        ));
    }

    public function member()
    {
        return $this->jsonAction(fn () => $this->onlineOrderApi->member($this->request->getGet()));
    }

    public function status()
    {
        return $this->jsonAction(fn () => $this->onlineOrderApi->status($this->request->getGet()));
    }

    public function submit()
    {
        return $this->jsonAction(fn () => $this->onlineOrderApi->submit($this->request->getJSON(true) ?: []));
    }

    private function renderOrderPage(string $companySlug = ''): \CodeIgniter\HTTP\ResponseInterface
    {
        $target = realpath(FCPATH . 'pages/order.html');
        $publicRoot = realpath(FCPATH);
        $response = $this->response ?? response();
        if (! $target || ! $publicRoot || ! str_starts_with($target, $publicRoot) || ! is_file($target)) {
            return $response->setStatusCode(404)->setBody('Halaman order online tidak ditemukan.');
        }

        $html = file_get_contents($target) ?: '';
        $inject = '<base href="/">';
        if ($companySlug !== '') {
            $inject .= '<script>window.__COMPANY_SLUG__=' . json_encode($companySlug) . ';</script>';
        }
        return $this->renderHtmlResponse($html, $inject);
    }

    private function jsonAction(callable $action)
    {
        try {
            return $this->response->setJSON(['ok' => true, 'data' => $action()]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON([
                'ok' => false,
                'message' => $exception->getMessage(),
            ]);
        }
    }
}
