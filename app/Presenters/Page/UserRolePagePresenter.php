<?php

namespace App\Presenters\Page;

class UserRolePagePresenter
{
    public function bootstrap(array $data): array
    {
        return [
            'activeCompanyId' => $data['activeCompanyId'] ?? 'company-main',
            'companies' => array_values($data['companies'] ?? []),
            'outlets' => array_values($data['outlets'] ?? []),
            'companyRoles' => array_values($data['companyRoles'] ?? []),
            'users' => array_values($data['users'] ?? []),
            'meta' => [
                'scope' => 'user_role_page',
                'payload' => 'access_management_bootstrap',
            ],
        ];
    }
}
