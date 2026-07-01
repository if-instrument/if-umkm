<?php

namespace App\Services\Api;

use App\Services\SettingsService;

class SettingsApiService
{
    public function outletContext(int $companyId, int $outletId): array
    {
        return (new SettingsService())->data($companyId, $outletId);
    }
}
