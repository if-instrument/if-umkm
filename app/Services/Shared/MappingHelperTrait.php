<?php

namespace App\Services\Shared;

trait MappingHelperTrait
{
    protected function companyCode(int $id): string
    {
        return $id === 1 ? 'company-main' : 'company-' . $id;
    }

    protected function outletCode(int $id): string
    {
        switch ($id) {
            case 1:
                return 'outlet-main';
            case 2:
                return 'outlet-north';
            case 3:
                return 'outlet-south';
            default:
                return 'outlet-' . $id;
        }
    }

    protected function userCode(array $row): string
    {
        switch ($row['email'] ?? '') {
            case 'superadmin@app.test':
                return 'usr-super-admin';
            case 'admin@ifresso.id':
                return 'usr-company-admin';
            case 'area@ifresso.id':
                return 'usr-area-manager';
            case 'manager@ifresso.id':
                return 'usr-outlet-manager';
            case 'kasir@ifresso.id':
                return 'usr-kasir';
            case 'kitchen@ifresso.id':
                return 'usr-kitchen';
            case 'inventory@ifresso.id':
                return 'usr-inventory';
            default:
                return 'usr-' . ($row['id'] ?? uniqid());
        }
    }

    protected function rowBelongsToCompany(array $row, int $companyId): bool
    {
        return ! array_key_exists('company_id', $row) || (int) $row['company_id'] === $companyId;
    }
}
