<?php

namespace App\Services\Api;

use App\Services\InventoryService;
use App\Services\ProductSuiteService;

class ProductApiService
{
    public function outletCatalog(int $companyId, int $outletId): array
    {
        return (new ProductSuiteService())->data($companyId, $outletId);
    }

    public function pageData(int $companyId, int $outletId, array $filters = []): array
    {
        $suite = (new ProductSuiteService())->data($companyId, $outletId);
        $templates = (new InventoryService())->templatePage($companyId, [
            'status' => 'active',
            'per_page' => min(200, max(50, (int) ($filters['template_per_page'] ?? 100))),
        ]);

        return $suite + [
            'ingredientTemplates' => $templates['items'] ?? [],
        ];
    }
}
