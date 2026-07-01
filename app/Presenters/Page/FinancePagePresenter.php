<?php

namespace App\Presenters\Page;

class FinancePagePresenter
{
    public function bootstrap(array $data, array $meta = []): array
    {
        return [
            'report' => $data['report'] ?? null,
            'expenses' => $data['expenses']['items'] ?? [],
            'expenseMeta' => $data['expenses']['meta'] ?? null,
            'gatewayLogs' => $data['gatewayLogs']['items'] ?? [],
            'gatewayLogMeta' => $data['gatewayLogs']['meta'] ?? null,
            'meta' => [
                'scope' => 'finance_page',
                'payload' => 'finance_bootstrap',
                'view' => $meta['view'] ?? 'dashboard',
            ],
        ];
    }
}
