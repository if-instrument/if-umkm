<?php

namespace App\Commands;

use App\Database\TenantMigrationRunner;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;
use Config\Database as DatabaseConfig;
use Config\Migrations;

class RunTenantMigrations extends BaseCommand
{
    protected $group = 'migrations';
    protected $name = 'tenant:run-migrations';
    protected $description = 'Run tenant migrations for an existing dedicated tenant database.';

    public function run(array $params): void
    {
        $centralDB = DatabaseConfig::connect();

        $companies = $centralDB->table('companies')
            ->select('id, route_slug, db_name')
            ->where('db_mode', 'dedicated')
            ->where('db_name IS NOT NULL')
            ->where('db_name !=', '')
            ->orderBy('id', 'ASC')
            ->get()
            ->getResultArray();

        if (empty($companies)) {
            CLI::error('Tidak ada tenant dedicated.');
            return;
        }

        $databaseConfig = config(DatabaseConfig::class);

        foreach ($companies as $company) {

            $databaseName = trim((string) $company['db_name']);

            if ($databaseName === '') {
                continue;
            }

            $group = 'tenant_' . strtolower(
                preg_replace('/[^A-Za-z0-9_]+/', '_', $databaseName)
            );

            CLI::write('');
            CLI::write('========================================');
            CLI::write('Tenant   : ' . $company['route_slug']);
            CLI::write('Database : ' . $databaseName);
            CLI::write('Group    : ' . $group);

            $dbConfig = [
                'hostname' => $databaseConfig->default['hostname'],
                'username' => $databaseConfig->default['username'],
                'password' => $databaseConfig->default['password'],
                'database' => $databaseName,
                'DBDriver' => $databaseConfig->default['DBDriver'],
                'DBPrefix' => '',
                'pConnect' => false,
                'DBDebug'  => true,
                'charset'  => 'utf8mb4',
                'DBCollat' => 'utf8mb4_general_ci',
                'port'     => $databaseConfig->default['port'],
            ];

            $tenantDB = db_connect($dbConfig);

            CLI::write('Connected : ' . $tenantDB->getDatabase());

            $runner = new TenantMigrationRunner(
                config(Migrations::class),
                $dbConfig,
                APPPATH . 'Database/TenantMigrations'
            );

            $runner->setNamespace('App');

            // Debug history
            $history = $runner->getHistory($group);

            CLI::write('History : ' . count($history));

            if (! $runner->latest($group)) {
                CLI::error('Migrasi gagal untuk ' . $databaseName);
                return;
            }

            CLI::write('Migrasi selesai.');
        }
    }
}