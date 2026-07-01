<?php

namespace App\Presenters\Page;

class ProductPagePresenter
{
    public function bootstrap(array $data, array $meta = []): array
    {
        return [
            'categories' => array_values($data['categories'] ?? []),
            'products' => array_values($data['products'] ?? []),
            'modifiers' => array_values($data['modifiers'] ?? []),
            'ingredients' => array_values($data['ingredients'] ?? []),
            'ingredientTemplates' => array_values($data['ingredientTemplates'] ?? []),
            'meta' => [
                'scope' => 'product_suite_page',
                'payload' => 'product_suite_bootstrap',
                'view' => $meta['view'] ?? 'products',
            ],
        ];
    }
}
