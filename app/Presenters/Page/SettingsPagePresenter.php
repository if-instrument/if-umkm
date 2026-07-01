<?php

namespace App\Presenters\Page;

class SettingsPagePresenter
{
    public function bootstrap(array $accessData, array $settingsData, array $ingredientPage): array
    {
        $settings = $settingsData['settings'] ?? [];

        return [
            'activeCompanyId' => $accessData['activeCompanyId'] ?? 'company-main',
            'companies' => array_values($accessData['companies'] ?? []),
            'outlets' => array_values($accessData['outlets'] ?? []),
            'settings' => [
                ...$settings,
                'diningTables' => array_values($settings['diningTables'] ?? []),
                'paymentMethods' => array_values($settings['paymentMethods'] ?? []),
                'packagingRules' => array_values($settings['packagingRules'] ?? []),
            ],
            'ingredients' => array_values($ingredientPage['items'] ?? []),
            'meta' => [
                'ingredients' => $ingredientPage['meta'] ?? [],
                'scope' => 'settings_page',
                'payload' => 'settings_bootstrap',
            ],
        ];
    }
}
