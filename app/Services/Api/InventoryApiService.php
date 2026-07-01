<?php

namespace App\Services\Api;

use App\Services\InventoryService;
use App\Services\ProductSuiteService;

class InventoryApiService
{
    public function ingredients(int $companyId, int $outletId, array $filters = []): array
    {
        return (new InventoryService())->ingredientPage($companyId, $outletId, $filters);
    }

    public function movements(int $companyId, int $outletId, array $filters = []): array
    {
        return (new InventoryService())->movementPage($companyId, $outletId, $filters);
    }

    public function pageData(int $companyId, int $outletId, array $filters = []): array
    {
        $view = (string) ($filters['view'] ?? 'overview');
        $inventory = new InventoryService();
        $ingredientLimit = min(150, max(20, (int) ($filters['ingredient_per_page'] ?? 100)));
        $movementLimit = min(150, max(20, (int) ($filters['movement_per_page'] ?? 100)));
        $data = [
            'ingredients' => [],
            'ingredientTemplates' => [],
            'stockMovements' => [],
            'products' => [],
        ];

        if (in_array($view, ['overview', 'list', 'purchase'], true)) {
            $ingredients = $inventory->ingredientPage($companyId, $outletId, ['per_page' => $ingredientLimit]);
            $data['ingredients'] = $ingredients['items'] ?? [];
        }

        if ($view === 'list') {
            $templates = $inventory->templatePage($companyId, ['status' => 'active', 'per_page' => 150]);
            $movements = $inventory->movementPage($companyId, $outletId, ['per_page' => $movementLimit]);
            $data['ingredientTemplates'] = $templates['items'] ?? [];
            $data['stockMovements'] = $movements['items'] ?? [];
        }

        if ($view === 'purchase') {
            $movements = $inventory->movementPage($companyId, $outletId, ['type' => 'purchase', 'per_page' => $movementLimit]);
            $data['stockMovements'] = $movements['items'] ?? [];
        }

        if (in_array($view, ['overview', 'finished-products'], true)) {
            $suite = (new ProductSuiteService())->data($companyId, $outletId);
            $data['products'] = array_values($suite['products'] ?? []);
            if ($view === 'finished-products') {
                $data['ingredients'] = array_values($suite['ingredients'] ?? []);
            }
        }

        return $data;
    }
}
