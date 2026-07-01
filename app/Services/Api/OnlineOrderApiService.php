<?php

namespace App\Services\Api;

use App\Services\PublicOrderService;
use App\Services\TenantDatabaseService;

class OnlineOrderApiService
{
    public function bootstrap(array $filters): array
    {
        [$companyId] = $this->activateCompany($filters);
        $outletId = $this->numericId($filters['outlet_id'] ?? $filters['outletId'] ?? null);

        return (new PublicOrderService())->bootstrap($companyId, $outletId ?: null);
    }

    public function member(array $filters): array
    {
        [$companyId] = $this->activateCompany($filters);
        $outletId = $this->numericId($filters['outlet_id'] ?? $filters['outletId'] ?? null);

        return (new PublicOrderService())->memberLookup(
            $companyId,
            $outletId,
            (string) ($filters['name'] ?? ''),
            (string) ($filters['email'] ?? '')
        );
    }

    public function submit(array $payload): array
    {
        [$companyId] = $this->activateCompany($payload);

        return (new PublicOrderService())->submit($payload, $companyId);
    }

    private function activateCompany(array $payload = []): array
    {
        $slug = trim((string) ($payload['companySlug'] ?? $payload['company'] ?? ''));
        $companyId = $this->numericId($payload['companyId'] ?? $payload['company_id'] ?? null);
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
        if (! $value) {
            return 0;
        }
        if (is_numeric($value)) {
            return (int) $value;
        }

        $aliases = ['outlet-main' => 1, 'outlet-north' => 2, 'outlet-south' => 3];
        if (isset($aliases[(string) $value])) {
            return $aliases[(string) $value];
        }
        if (preg_match('/(\d+)$/', (string) $value, $matches)) {
            return (int) $matches[1];
        }

        return 0;
    }
}
