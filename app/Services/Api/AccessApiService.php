<?php

namespace App\Services\Api;

use App\Services\AccessManagementService;

class AccessApiService
{
    public function pageData(int $companyId = 0, bool $superAdmin = false): array
    {
        $data = (new AccessManagementService())->data();
        if ($superAdmin) {
            return [
                'activeCompanyId' => $data['companies'][0]['id'] ?? 'company-main',
                'companies' => $data['companies'] ?? [],
                'outlets' => [],
                'companyRoles' => [],
                'users' => [],
            ];
        }

        $companyCode = $companyId <= 1 ? 'company-main' : 'company-' . $companyId;

        return [
            'activeCompanyId' => $companyCode,
            'companies' => array_values(array_filter($data['companies'] ?? [], fn ($row) => ($row['id'] ?? '') === $companyCode)),
            'outlets' => array_values(array_filter($data['outlets'] ?? [], fn ($row) => ($row['companyId'] ?? '') === $companyCode)),
            'companyRoles' => array_values(array_filter($data['companyRoles'] ?? [], fn ($row) => ($row['companyId'] ?? '') === $companyCode)),
            'users' => array_values(array_filter($data['users'] ?? [], fn ($row) => ($row['companyId'] ?? '') === $companyCode)),
        ];
    }
}
