<?php

namespace App\Presenters\Page;

class InventoryPagePresenter
{
    public function bootstrap(array $data, array $meta = []): array
    {
        return [
            'ingredients' => array_values($data['ingredients'] ?? []),
            'ingredientTemplates' => array_values($data['ingredientTemplates'] ?? []),
            'stockMovements' => array_values($data['stockMovements'] ?? []),
            'products' => array_values($data['products'] ?? []),
            'meta' => [
                'scope' => 'inventory_page',
                'payload' => 'inventory_bootstrap',
                'view' => $meta['view'] ?? 'overview',
            ],
        ];
    }
}
