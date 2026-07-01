<?php

namespace App\Services\Api;

use App\Services\InventoryService;

class InventoryApiService
{
    public function ingredients(int $companyId, int $outletId, array $filters = []): array
    {
        return (new InventoryService())->ingredientPage($companyId, $outletId, $filters);
    }

    public function movements(int $companyId, int $outletId, array $filters = []): array
    {
        return (new InventoryService())->data($companyId, $outletId, $filters);
    }
}
