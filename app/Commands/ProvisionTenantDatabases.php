<?php

namespace App\Commands;

use App\Services\TenantDatabaseProvisioningService;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;
use Config\Database;

class ProvisionTenantDatabases extends BaseCommand
{
    protected $group = 'Tenant';
    protected $name = 'tenant:provision';
    protected $description = 'Create and migrate dedicated tenant databases for companies that do not have one yet.';

    public function run(array $params): void
    {
        $db = Database::connect();
        $provisioning = new TenantDatabaseProvisioningService();
        $companies = $db->table('companies')
            ->where('status', 'active')
            ->where('route_slug IS NOT NULL')
            ->orderBy('id')
            ->get()
            ->getResultArray();

        foreach ($companies as $company) {
            $databaseName = trim((string) ($company['db_name'] ?? ''));
            if ($databaseName === '') {
                $databaseName = $provisioning->databaseNameForSlug((string) $company['route_slug']);
                $config = $provisioning->tenantConfig($databaseName);
                $db->table('companies')->where('id', (int) $company['id'])->update($config);
                $company = array_merge($company, $config);
            }

            $admin = $db->table('users')
                ->where('company_id', (int) $company['id'])
                ->where('type', 'company_admin')
                ->orderBy('id')
                ->get()
                ->getRowArray() ?: [];

            $provisioning->provision($databaseName, $company, $admin);
            CLI::write(sprintf('Provisioned %s -> %s', $company['route_slug'], $databaseName), 'green');
        }
    }
}
