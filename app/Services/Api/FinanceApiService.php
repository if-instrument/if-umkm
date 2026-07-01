<?php

namespace App\Services\Api;

use App\Services\PaymentGatewayService;
use App\Services\ProfitLossService;

class FinanceApiService
{
    public function pageData(int $companyId, int $outletId, array $filters = []): array
    {
        $view = (string) ($filters['view'] ?? 'dashboard');
        $reportFilters = [
            'company_id' => $companyId,
            'outlet_id' => $outletId,
            'period' => $filters['period'] ?? 'daily',
            'anchor_date' => $filters['anchor_date'] ?? date('Y-m-d'),
        ];
        $profitLoss = new ProfitLossService();

        if ($view === 'expenses') {
            return [
                'expenses' => $profitLoss->expensePage($reportFilters),
            ];
        }

        if ($view === 'gateway-logs') {
            return [
                'gatewayLogs' => (new PaymentGatewayService())->logPage($companyId, $filters),
            ];
        }

        return [
            'report' => $profitLoss->report($reportFilters),
        ];
    }
}
