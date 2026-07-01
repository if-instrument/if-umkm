<?php

namespace App\Services\Api;

use App\Services\ProductSuiteService;

class ProductApiService
{
    public function outletCatalog(int $companyId, int $outletId): array
    {
        return (new ProductSuiteService())->data($companyId, $outletId);
    }
}
