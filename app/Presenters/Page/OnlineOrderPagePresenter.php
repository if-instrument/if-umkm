<?php

namespace App\Presenters\Page;

class OnlineOrderPagePresenter
{
    public function bootstrap(array $data): array
    {
        return [
            'company' => $data['company'] ?? [],
            'outlets' => array_values($data['outlets'] ?? []),
            'activeOutletId' => $data['activeOutletId'] ?? '',
            'settings' => $data['settings'] ?? [],
            'categories' => array_values($data['categories'] ?? []),
            'products' => array_values($data['products'] ?? []),
            'modifiers' => array_values($data['modifiers'] ?? []),
            'ingredients' => array_values($data['ingredients'] ?? []),
            'meta' => [
                'scope' => 'public_online_order',
                'payload' => 'customer_menu_book',
            ],
        ];
    }
}
