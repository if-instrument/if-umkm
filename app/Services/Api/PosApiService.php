<?php

namespace App\Services\Api;

use App\Services\SalesService;

class PosApiService
{
    public function activeOrders(int $companyId, int $outletId, array $filters = []): array
    {
        return (new SalesService())->orderPage($companyId, $outletId, $filters);
    }
}
