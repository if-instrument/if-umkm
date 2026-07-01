<?php

namespace App\Services;

use CodeIgniter\Database\BaseConnection;
use Config\Database as DatabaseConfig;

class TenantDatabaseService
{
    private array $centralConfig;

    public function __construct()
    {
        $this->centralConfig = config(DatabaseConfig::class)->default;
    }

    public function activateForClaims(array $claims): ?array
    {
        if (($claims['authType'] ?? '') === 'super_admin') {
            return null;
        }

        $company = $this->companyFromClaims($claims);
        if (! $company || ($company['db_mode'] ?? 'shared') !== 'dedicated' || empty($company['db_name'])) {
            return null;
        }

        $tenantConfig = $this->tenantConfigFromCompany($company);
        $databaseConfig = config(DatabaseConfig::class);
        $databaseConfig->default = $tenantConfig;
        service('request')->tenant = [
            'companyId' => (int) $company['id'],
            'companySlug' => $company['route_slug'] ?? '',
            'database' => $tenantConfig['database'],
        ];

        return service('request')->tenant;
    }

    public function activateForCompanySlug(string $slug): ?array
    {
        $company = $this->companyBySlug($slug);
        if (! $company || ($company['db_mode'] ?? 'shared') !== 'dedicated' || empty($company['db_name'])) {
            return null;
        }

        $tenantConfig = $this->tenantConfigFromCompany($company);
        $databaseConfig = config(DatabaseConfig::class);
        $databaseConfig->default = $tenantConfig;
        service('request')->tenant = [
            'companyId' => (int) $company['id'],
            'companySlug' => $company['route_slug'] ?? '',
            'database' => $tenantConfig['database'],
        ];

        return service('request')->tenant;
    }

    public function connectionForCompanySlug(string $slug): ?BaseConnection
    {
        $company = $this->companyBySlug($slug);
        if (! $company || ($company['db_mode'] ?? 'shared') !== 'dedicated' || empty($company['db_name'])) {
            return null;
        }

        return DatabaseConfig::connect($this->tenantConfigFromCompany($company), false);
    }

    public function companyBySlug(string $slug): ?array
    {
        $slug = trim($slug);
        if ($slug === '') {
            return null;
        }

        $company = $this->centralConnection()
            ->table('companies')
            ->where('route_slug', $slug)
            ->whereIn('status', [StatusCodeService::ACTIVE, 'active'])
            ->get()
            ->getRowArray();
        if ($company) {
            return $company;
        }

        $normalized = $this->normalizedSlug($slug);
        foreach ($this->centralConnection()
            ->table('companies')
            ->whereIn('status', [StatusCodeService::ACTIVE, 'active'])
            ->get()
            ->getResultArray() as $row) {
            if ($this->normalizedSlug((string) ($row['route_slug'] ?? '')) === $normalized) {
                return $row;
            }
        }

        return null;
    }

    public function companyFromClaims(array $claims): ?array
    {
        $companyId = $this->numericCompanyId((string) ($claims['companyId'] ?? ''));
        if ($companyId > 0) {
            $company = $this->centralConnection()
                ->table('companies')
                ->where('id', $companyId)
                ->whereIn('status', [StatusCodeService::ACTIVE, 'active'])
                ->get()
                ->getRowArray();
            if ($company) {
                return $company;
            }
        }

        return $this->companyBySlug((string) ($claims['companySlug'] ?? ''));
    }

    private function centralConnection(): BaseConnection
    {
        return DatabaseConfig::connect($this->centralConfig, false);
    }

    private function tenantConfigFromCompany(array $company): array
    {
        $config = $this->centralConfig;
        $config['hostname'] = $company['db_host'] ?: ($config['hostname'] ?? 'localhost');
        $config['database'] = $company['db_name'];
        $config['username'] = $company['db_username'] ?: ($config['username'] ?? 'root');
        $config['password'] = $company['db_password'] ?? ($config['password'] ?? '');
        $config['port'] = (int) ($company['db_port'] ?: ($config['port'] ?? 3306));

        return $config;
    }

    private function numericCompanyId(string $code): int
    {
        if ($code === 'company-main') {
            return 1;
        }
        if (preg_match('/^company-(\d+)$/', $code, $matches)) {
            return (int) $matches[1];
        }

        return ctype_digit($code) ? (int) $code : 0;
    }

    private function normalizedSlug(string $slug): string
    {
        return strtolower(preg_replace('/[^a-z0-9]+/i', '', $slug) ?? '');
    }
}
