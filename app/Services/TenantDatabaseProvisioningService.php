<?php

namespace App\Services;

use CodeIgniter\Database\BaseConnection;
use CodeIgniter\Database\MigrationRunner;
use Config\Database as DatabaseConfig;
use Config\Migrations;

class TenantDatabaseProvisioningService
{
    private BaseConnection $central;

    public function __construct()
    {
        $this->central = DatabaseConfig::connect(config(DatabaseConfig::class)->default, false);
    }

    public function databaseNameForSlug(string $slug): string
    {
        $name = strtolower(trim(preg_replace('/[^a-zA-Z0-9]+/', '_', $slug), '_')) ?: 'company';
        return 'if_umkm_' . $name;
    }

    public function provision(string $databaseName, array $company, array $admin): array
    {
        $this->assertSafeIdentifier($databaseName);
        $this->createDatabase($databaseName);
        $this->runTenantMigrations($databaseName);
        $tenant = $this->tenantConnection($databaseName);
        $this->dropTenantCompanyIdColumns($tenant);
        $this->seedTenantCompany($tenant, $company);
        $this->seedTenantAdmin($tenant, $company, $admin);

        return $this->tenantConfig($databaseName);
    }

    public function tenantConfig(string $databaseName): array
    {
        $default = config(DatabaseConfig::class)->default;
        return [
            'db_mode' => 'dedicated',
            'db_host' => $default['hostname'] ?? 'localhost',
            'db_name' => $databaseName,
            'db_username' => $default['username'] ?? 'root',
            'db_password' => $default['password'] ?? '',
            'db_port' => (int) ($default['port'] ?? 3306),
        ];
    }

    private function createDatabase(string $databaseName): void
    {
        $this->central->query(sprintf(
            'CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
            $databaseName
        ));
    }

    private function runTenantMigrations(string $databaseName): void
    {
        $group = 'tenant_' . strtolower(preg_replace('/[^A-Za-z0-9_]+/', '_', $databaseName));
        $databaseConfig = config(DatabaseConfig::class);
        $databaseConfig->{$group} = $this->tenantConnectionParams($databaseName);
        $runner = new MigrationRunner(config(Migrations::class), $group);
        $runner->setNamespace('App');
        if (! $runner->latest($group)) {
            throw new \RuntimeException('Migrasi database tenant gagal dijalankan.');
        }
    }

    private function tenantConnection(string $databaseName): BaseConnection
    {
        return DatabaseConfig::connect($this->tenantConnectionParams($databaseName), false);
    }

    private function tenantConnectionParams(string $databaseName): array
    {
        $params = config(DatabaseConfig::class)->default;
        $params['database'] = $databaseName;
        return $params;
    }

    private function seedTenantCompany(BaseConnection $tenant, array $company): void
    {
        $companyId = (int) ($company['id'] ?? 0);
        if ($companyId <= 0) {
            throw new \InvalidArgumentException('ID perusahaan pusat wajib tersedia untuk database tenant.');
        }

        $now = date('Y-m-d H:i:s');
        $payload = [
            'id' => $companyId,
            'name' => $company['name'],
            'brand_name' => $company['brand_name'] ?: $company['name'],
            'route_slug' => $company['route_slug'],
            'tagline' => $company['tagline'] ?? 'UMKM Solution',
            'logo_path' => $company['logo_path'] ?? '',
            'theme_color' => $company['theme_color'] ?? '#6e3a16',
            'db_mode' => 'dedicated',
            'db_host' => $company['db_host'] ?? null,
            'db_name' => $company['db_name'] ?? null,
            'db_username' => $company['db_username'] ?? null,
            'db_password' => $company['db_password'] ?? null,
            'db_port' => $company['db_port'] ?? null,
            'status' => StatusCodeService::common($company['status'] ?? 'active'),
            'updated_at' => $now,
        ];

        if ($tenant->table('companies')->where('id', $companyId)->countAllResults()) {
            $tenant->table('companies')->where('id', $companyId)->update($payload);
            return;
        }

        $payload['created_at'] = $now;
        $tenant->table('companies')->insert($payload);
    }

    private function seedTenantAdmin(BaseConnection $tenant, array $company, array $admin): void
    {
        $email = strtolower(trim((string) ($admin['email'] ?? '')));
        if ($email === '' || $tenant->table('users')->where('email', $email)->countAllResults()) {
            return;
        }
        $companyId = (int) ($company['id'] ?? 0);
        if ($companyId <= 0) {
            throw new \InvalidArgumentException('ID perusahaan pusat wajib tersedia untuk admin tenant.');
        }
        $now = date('Y-m-d H:i:s');
        $tenant->table('users')->insert($this->withCompanyData($tenant, 'users', [
            'company_id' => $companyId,
            'name' => $admin['name'] ?? 'Admin Perusahaan',
            'email' => $email,
            'password_hash' => $admin['password_hash'] ?? password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT),
            'type' => 'company_admin',
            'status' => StatusCodeService::common($admin['status'] ?? 'invited', StatusCodeService::DRAFT),
            'created_at' => $now,
            'updated_at' => $now,
        ], $companyId));
    }

    public function dropTenantCompanyIdColumns(BaseConnection $tenant): array
    {
        $database = $tenant->getDatabase();
        $this->assertSafeIdentifier($database);
        $dropped = [];

        $foreignKeys = $tenant->query(
            "SELECT TABLE_NAME, CONSTRAINT_NAME
             FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = ?
               AND COLUMN_NAME = 'company_id'
               AND REFERENCED_TABLE_NAME IS NOT NULL",
            [$database]
        )->getResultArray();

        foreach ($foreignKeys as $row) {
            $table = (string) $row['TABLE_NAME'];
            $constraint = (string) $row['CONSTRAINT_NAME'];
            $this->assertSafeIdentifier($table);
            $this->assertSafeIdentifier($constraint);
            $tenant->query("ALTER TABLE `{$table}` DROP FOREIGN KEY `{$constraint}`");
        }

        $indexes = $tenant->query(
            "SELECT TABLE_NAME, INDEX_NAME
             FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = ?
               AND COLUMN_NAME = 'company_id'
               AND INDEX_NAME <> 'PRIMARY'
             GROUP BY TABLE_NAME, INDEX_NAME",
            [$database]
        )->getResultArray();

        foreach ($indexes as $row) {
            $table = (string) $row['TABLE_NAME'];
            $index = (string) $row['INDEX_NAME'];
            $this->assertSafeIdentifier($table);
            $this->assertSafeIdentifier($index);
            try {
                $tenant->query("ALTER TABLE `{$table}` DROP INDEX `{$index}`");
            } catch (\Throwable) {
                // Some engines remove supporting indexes when foreign keys are dropped.
            }
        }

        $columns = $tenant->query(
            "SELECT TABLE_NAME
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ?
               AND COLUMN_NAME = 'company_id'
             ORDER BY TABLE_NAME",
            [$database]
        )->getResultArray();

        foreach ($columns as $row) {
            $table = (string) $row['TABLE_NAME'];
            $this->assertSafeIdentifier($table);
            $tenant->query("ALTER TABLE `{$table}` DROP COLUMN `company_id`");
            $dropped[] = $table;
        }

        return $dropped;
    }

    private function assertSafeIdentifier(string $identifier): void
    {
        if (! preg_match('/^[A-Za-z0-9_]+$/', $identifier)) {
            throw new \InvalidArgumentException('Nama database tenant tidak valid.');
        }
    }

    private function withCompanyData(BaseConnection $db, string $table, array $data, int $companyId): array
    {
        if ($db->tableExists($table) && $db->fieldExists('company_id', $table)) {
            $data['company_id'] = $companyId;
        } else {
            unset($data['company_id']);
        }

        return $data;
    }
}
