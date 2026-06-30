<?php

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Services\PublicOrderService;
use App\Services\TenantDatabaseService;

class PublicOrderController extends BaseController
{
    public function bootstrap()
    {
        return $this->jsonAction(function () {
            [$companyId] = $this->activateCompany();
            $outletId = $this->numericId($this->request->getGet('outlet_id') ?? $this->request->getGet('outletId'));
            return (new PublicOrderService())->bootstrap($companyId, $outletId ?: null);
        });
    }

    public function member()
    {
        return $this->jsonAction(function () {
            [$companyId] = $this->activateCompany();
            $outletId = $this->numericId($this->request->getGet('outlet_id') ?? $this->request->getGet('outletId'));
            return (new PublicOrderService())->memberLookup(
                $companyId,
                $outletId,
                (string) ($this->request->getGet('name') ?? ''),
                (string) ($this->request->getGet('email') ?? '')
            );
        });
    }

    public function submit()
    {
        return $this->jsonAction(function () {
            $payload = $this->request->getJSON(true) ?: [];
            [$companyId] = $this->activateCompany($payload);
            return (new PublicOrderService())->submit($payload, $companyId);
        });
    }

    private function activateCompany(array $payload = []): array
    {
        $slug = trim((string) ($payload['companySlug'] ?? $payload['company'] ?? $this->request->getGet('companySlug') ?? $this->request->getGet('company') ?? ''));
        $companyId = $this->numericId($payload['companyId'] ?? $payload['company_id'] ?? $this->request->getGet('company_id') ?? '');
        if ($slug !== '') {
            $tenantService = new TenantDatabaseService();
            $company = $tenantService->companyBySlug($slug);
            if (! $company) {
                throw new \InvalidArgumentException('Perusahaan tidak ditemukan.');
            }
            $tenantService->activateForCompanySlug($slug);
            return [(int) $company['id'], $slug];
        }

        return [$companyId ?: 1, ''];
    }

    private function numericId(string|int|null $value): int
    {
        if (! $value) return 0;
        if (is_numeric($value)) return (int) $value;
        $aliases = ['outlet-main' => 1, 'outlet-north' => 2, 'outlet-south' => 3];
        if (isset($aliases[(string) $value])) return $aliases[(string) $value];
        if (preg_match('/(\d+)$/', (string) $value, $matches)) return (int) $matches[1];
        return 0;
    }

    private function jsonAction(callable $action)
    {
        try {
            return $this->response->setJSON(['ok' => true, 'data' => $action()]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }
}
