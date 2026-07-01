<?php

namespace App\Services\Api;

use App\Services\InventoryService;
use App\Services\SettingsService;

class SettingsApiService
{
    public function outletContext(int $companyId, int $outletId): array
    {
        return (new SettingsService())->data($companyId, $outletId);
    }

    public function pageData(int $companyId, int $outletId, array $filters = []): array
    {
        $perPage = min(200, max(25, (int) ($filters['ingredient_per_page'] ?? $filters['per_page'] ?? 100)));

        return [
            'settings' => (new SettingsService())->data($companyId, $outletId),
            'ingredients' => (new InventoryService())->ingredientPage($companyId, $outletId, [
                'per_page' => $perPage,
            ]),
        ];
    }
}
