<?php

namespace App\Commands;

use App\Services\TenantDatabaseProvisioningService;
use App\Services\TenantDatabaseService;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;

class DropTenantCompanyIdColumns extends BaseCommand
{
    protected $group = 'Tenant';
    protected $name = 'tenant:drop-company-id';
    protected $description = 'Drop company_id foreign keys, indexes, and columns from a dedicated tenant database.';
    protected $usage = 'tenant:drop-company-id <company-route-slug>';

    public function run(array $params): void
    {
        $slug = trim((string) ($params[0] ?? ''));
        if ($slug === '') {
            CLI::error('Company route slug wajib diisi. Contoh: php83 spark tenant:drop-company-id IFressoCoffee');
            return;
        }

        $tenant = (new TenantDatabaseService())->connectionForCompanySlug($slug);
        if (! $tenant) {
            CLI::error('Tenant database tidak ditemukan untuk slug: ' . $slug);
            return;
        }

        $dropped = (new TenantDatabaseProvisioningService())->dropTenantCompanyIdColumns($tenant);
        if (! $dropped) {
            CLI::write('Tidak ada kolom company_id yang perlu dihapus.', 'yellow');
            return;
        }

        CLI::write('Kolom company_id dihapus dari tenant ' . $slug . ':', 'green');
        foreach ($dropped as $table) {
            CLI::write('- ' . $table);
        }
    }
}
