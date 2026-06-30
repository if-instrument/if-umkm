<?php

namespace App\Commands;

use App\Services\TenantDatabaseProvisioningService;
use App\Services\TenantDatabaseService;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;
use CodeIgniter\Database\BaseConnection;
use Config\Database;

class MigrateMerchantDataToTenant extends BaseCommand
{
    protected $group = 'Tenant';
    protected $name = 'tenant:migrate-merchant-data';
    protected $description = 'Move existing merchant operational data from central DB into its dedicated tenant DB.';
    protected $usage = 'tenant:migrate-merchant-data <company-route-slug> [--cleanup-central]';

    private array $tenantTables = [
        'companies',
        'outlets',
        'roles',
        'users',
        'user_roles',
        'user_outlets',
        'user_invitations',
        'categories',
        'products',
        'modifiers',
        'modifier_options',
        'product_modifiers',
        'ingredient_templates',
        'outlet_ingredients',
        'outlet_ingredient_mappings',
        'product_recipe_items',
        'product_outlet_prices',
        'modifier_option_outlet_prices',
        'product_outlet_categories',
        'app_settings',
        'dining_tables',
        'payment_methods',
        'packaging_rules',
        'packaging_rule_items',
        'ingredient_lots',
        'stock_movements',
        'product_batches',
        'product_batch_movements',
        'orders',
        'order_items',
        'payment_transactions',
        'payment_transaction_logs',
        'operating_expenses',
    ];

    public function run(array $params): void
    {
        $slug = (string) ($params[0] ?? CLI::getOption('slug') ?? '');
        if ($slug === '') {
            CLI::error('Company route slug wajib diisi. Contoh: php83 spark tenant:migrate-merchant-data IFressoCoffee --cleanup-central');
            return;
        }

        $central = Database::connect(config(Database::class)->default, false);
        $company = $central->table('companies')->where('route_slug', $slug)->get()->getRowArray();
        if (! $company) {
            CLI::error('Company route slug tidak ditemukan: ' . $slug);
            return;
        }

        $provisioning = new TenantDatabaseProvisioningService();
        $databaseName = trim((string) ($company['db_name'] ?? '')) ?: $provisioning->databaseNameForSlug($slug);
        if (empty($company['db_name'])) {
            $tenantConfig = $provisioning->tenantConfig($databaseName);
            $central->table('companies')->where('id', (int) $company['id'])->update($tenantConfig);
            $company = array_merge($company, $tenantConfig);
        }

        $admin = $central->table('users')
            ->where('company_id', (int) $company['id'])
            ->where('type', 'company_admin')
            ->orderBy('id')
            ->get()
            ->getRowArray() ?: [];

        $provisioning->provision($databaseName, $company, $admin);
        $tenant = (new TenantDatabaseService())->connectionForCompanySlug($slug);
        if (! $tenant) {
            CLI::error('Koneksi tenant gagal dibuat.');
            return;
        }

        $ids = $this->collectIds($central, (int) $company['id']);
        $data = $this->collectRows($central, (int) $company['id'], $ids);
        $this->replaceTenantData($tenant, $data);

        CLI::write('Data merchant berhasil dipindahkan ke tenant: ' . $databaseName, 'green');
        foreach ($data as $table => $rows) {
            CLI::write(sprintf('  - %s: %d rows', $table, count($rows)));
        }

        if (CLI::getOption('cleanup-central') !== null) {
            $this->cleanupCentralOperationalData($central, (int) $company['id'], $ids);
            CLI::write('Database pusat sudah dibersihkan dari data operasional merchant. Config company dan user mirror tetap disimpan.', 'yellow');
        }
    }

    private function collectIds(BaseConnection $db, int $companyId): array
    {
        $ids = [
            'outlets' => $this->ids($db, 'outlets', 'id', ['company_id' => $companyId]),
            'users' => $this->ids($db, 'users', 'id', ['company_id' => $companyId]),
            'roles' => $this->ids($db, 'roles', 'id', ['company_id' => $companyId]),
            'products' => $this->ids($db, 'products', 'id', ['company_id' => $companyId]),
            'modifiers' => $this->ids($db, 'modifiers', 'id', ['company_id' => $companyId]),
            'orders' => $this->ids($db, 'orders', 'id', ['company_id' => $companyId]),
            'packagingRules' => $this->ids($db, 'packaging_rules', 'id', ['company_id' => $companyId]),
            'ingredients' => $this->ids($db, 'outlet_ingredients', 'id', ['company_id' => $companyId]),
            'paymentTransactions' => $this->ids($db, 'payment_transactions', 'id', ['company_id' => $companyId]),
        ];
        $ids['modifierOptions'] = $this->idsWhereIn($db, 'modifier_options', 'id', 'modifier_id', $ids['modifiers']);

        return $ids;
    }

    private function collectRows(BaseConnection $db, int $companyId, array $ids): array
    {
        return [
            'companies' => $this->rows($db, 'companies', ['id' => $companyId]),
            'outlets' => $this->rows($db, 'outlets', ['company_id' => $companyId]),
            'roles' => $this->rows($db, 'roles', ['company_id' => $companyId]),
            'users' => $this->rows($db, 'users', ['company_id' => $companyId]),
            'user_roles' => $this->rowsByAnyIn($db, 'user_roles', ['user_id' => $ids['users'], 'role_id' => $ids['roles']]),
            'user_outlets' => $this->rowsByAnyIn($db, 'user_outlets', ['user_id' => $ids['users'], 'outlet_id' => $ids['outlets']]),
            'user_invitations' => $this->rows($db, 'user_invitations', ['company_id' => $companyId]),
            'categories' => $this->rows($db, 'categories', ['company_id' => $companyId]),
            'products' => $this->rows($db, 'products', ['company_id' => $companyId]),
            'modifiers' => $this->rows($db, 'modifiers', ['company_id' => $companyId]),
            'modifier_options' => $this->rowsWhereIn($db, 'modifier_options', 'modifier_id', $ids['modifiers']),
            'product_modifiers' => $this->rowsByAnyIn($db, 'product_modifiers', ['product_id' => $ids['products'], 'modifier_id' => $ids['modifiers']]),
            'ingredient_templates' => $this->rows($db, 'ingredient_templates', ['company_id' => $companyId]),
            'outlet_ingredients' => $this->rows($db, 'outlet_ingredients', ['company_id' => $companyId]),
            'outlet_ingredient_mappings' => $this->rows($db, 'outlet_ingredient_mappings', ['company_id' => $companyId]),
            'product_recipe_items' => $this->rows($db, 'product_recipe_items', ['company_id' => $companyId]),
            'product_outlet_prices' => $this->rows($db, 'product_outlet_prices', ['company_id' => $companyId]),
            'modifier_option_outlet_prices' => $this->rows($db, 'modifier_option_outlet_prices', ['company_id' => $companyId]),
            'product_outlet_categories' => $this->rows($db, 'product_outlet_categories', ['company_id' => $companyId]),
            'app_settings' => $this->rows($db, 'app_settings', ['company_id' => $companyId]),
            'dining_tables' => $this->rows($db, 'dining_tables', ['company_id' => $companyId]),
            'payment_methods' => $this->rows($db, 'payment_methods', ['company_id' => $companyId]),
            'packaging_rules' => $this->rows($db, 'packaging_rules', ['company_id' => $companyId]),
            'packaging_rule_items' => $this->rowsWhereIn($db, 'packaging_rule_items', 'packaging_rule_id', $ids['packagingRules']),
            'ingredient_lots' => $this->rows($db, 'ingredient_lots', ['company_id' => $companyId]),
            'stock_movements' => $this->rows($db, 'stock_movements', ['company_id' => $companyId]),
            'product_batches' => $this->rows($db, 'product_batches', ['company_id' => $companyId]),
            'product_batch_movements' => $this->rows($db, 'product_batch_movements', ['company_id' => $companyId]),
            'orders' => $this->rows($db, 'orders', ['company_id' => $companyId]),
            'order_items' => $this->rowsWhereIn($db, 'order_items', 'order_id', $ids['orders']),
            'payment_transactions' => $this->rows($db, 'payment_transactions', ['company_id' => $companyId]),
            'payment_transaction_logs' => $this->rows($db, 'payment_transaction_logs', ['company_id' => $companyId]),
            'operating_expenses' => $this->rows($db, 'operating_expenses', ['company_id' => $companyId]),
        ];
    }

    private function replaceTenantData(BaseConnection $tenant, array $data): void
    {
        $tenant->query('SET FOREIGN_KEY_CHECKS=0');
        foreach (array_reverse($this->tenantTables) as $table) {
            if ($tenant->tableExists($table)) {
                $tenant->table($table)->emptyTable();
            }
        }

        foreach ($this->tenantTables as $table) {
            if (! empty($data[$table])) {
                foreach (array_chunk($data[$table], 200) as $chunk) {
                    $tenant->table($table)->insertBatch($chunk);
                }
            }
        }
        $tenant->query('SET FOREIGN_KEY_CHECKS=1');
    }

    private function cleanupCentralOperationalData(BaseConnection $central, int $companyId, array $ids): void
    {
        $central->query('SET FOREIGN_KEY_CHECKS=0');
        $this->deleteWhere($central, 'payment_transaction_logs', ['company_id' => $companyId]);
        $this->deleteWhere($central, 'payment_transactions', ['company_id' => $companyId]);
        $this->deleteWhereIn($central, 'order_items', 'order_id', $ids['orders']);
        $this->deleteWhere($central, 'orders', ['company_id' => $companyId]);
        $this->deleteWhere($central, 'operating_expenses', ['company_id' => $companyId]);
        $this->deleteWhere($central, 'product_batch_movements', ['company_id' => $companyId]);
        $this->deleteWhere($central, 'product_batches', ['company_id' => $companyId]);
        $this->deleteWhere($central, 'stock_movements', ['company_id' => $companyId]);
        $this->deleteWhere($central, 'ingredient_lots', ['company_id' => $companyId]);
        $this->deleteWhereIn($central, 'packaging_rule_items', 'packaging_rule_id', $ids['packagingRules']);
        $this->deleteWhere($central, 'packaging_rules', ['company_id' => $companyId]);
        $this->deleteWhere($central, 'payment_methods', ['company_id' => $companyId]);
        $this->deleteWhere($central, 'dining_tables', ['company_id' => $companyId]);
        $this->deleteWhere($central, 'app_settings', ['company_id' => $companyId]);
        $this->deleteWhere($central, 'product_outlet_categories', ['company_id' => $companyId]);
        $this->deleteWhere($central, 'modifier_option_outlet_prices', ['company_id' => $companyId]);
        $this->deleteWhere($central, 'product_outlet_prices', ['company_id' => $companyId]);
        $this->deleteWhere($central, 'product_recipe_items', ['company_id' => $companyId]);
        $this->deleteWhere($central, 'outlet_ingredient_mappings', ['company_id' => $companyId]);
        $this->deleteWhere($central, 'outlet_ingredients', ['company_id' => $companyId]);
        $this->deleteWhere($central, 'ingredient_templates', ['company_id' => $companyId]);
        $this->deleteByAnyIn($central, 'product_modifiers', ['product_id' => $ids['products'], 'modifier_id' => $ids['modifiers']]);
        $this->deleteWhereIn($central, 'modifier_options', 'modifier_id', $ids['modifiers']);
        $this->deleteWhere($central, 'modifiers', ['company_id' => $companyId]);
        $this->deleteWhere($central, 'products', ['company_id' => $companyId]);
        $this->deleteWhere($central, 'categories', ['company_id' => $companyId]);
        $this->deleteByAnyIn($central, 'user_outlets', ['user_id' => $ids['users'], 'outlet_id' => $ids['outlets']]);
        $this->deleteByAnyIn($central, 'user_roles', ['user_id' => $ids['users'], 'role_id' => $ids['roles']]);
        $this->deleteWhere($central, 'roles', ['company_id' => $companyId]);
        $this->deleteWhere($central, 'outlets', ['company_id' => $companyId]);
        $central->query('SET FOREIGN_KEY_CHECKS=1');
    }

    private function rows(BaseConnection $db, string $table, array $where): array
    {
        return $db->table($table)->where($where)->get()->getResultArray();
    }

    private function rowsWhereIn(BaseConnection $db, string $table, string $column, array $values): array
    {
        if ($values === []) {
            return [];
        }

        return $db->table($table)->whereIn($column, $values)->get()->getResultArray();
    }

    private function rowsByAnyIn(BaseConnection $db, string $table, array $columns): array
    {
        $builder = $db->table($table)->groupStart();
        $hasCondition = false;
        foreach ($columns as $column => $values) {
            if ($values === []) {
                continue;
            }
            $hasCondition ? $builder->orWhereIn($column, $values) : $builder->whereIn($column, $values);
            $hasCondition = true;
        }
        if (! $hasCondition) {
            return [];
        }

        return $builder->groupEnd()->get()->getResultArray();
    }

    private function ids(BaseConnection $db, string $table, string $column, array $where): array
    {
        return array_map('intval', array_column($this->rows($db, $table, $where), $column));
    }

    private function idsWhereIn(BaseConnection $db, string $table, string $selectColumn, string $whereColumn, array $values): array
    {
        return array_map('intval', array_column($this->rowsWhereIn($db, $table, $whereColumn, $values), $selectColumn));
    }

    private function deleteWhere(BaseConnection $db, string $table, array $where): void
    {
        $db->table($table)->where($where)->delete();
    }

    private function deleteWhereIn(BaseConnection $db, string $table, string $column, array $values): void
    {
        if ($values === []) {
            return;
        }

        $db->table($table)->whereIn($column, $values)->delete();
    }

    private function deleteByAnyIn(BaseConnection $db, string $table, array $columns): void
    {
        $builder = $db->table($table)->groupStart();
        $hasCondition = false;
        foreach ($columns as $column => $values) {
            if ($values === []) {
                continue;
            }
            $hasCondition ? $builder->orWhereIn($column, $values) : $builder->whereIn($column, $values);
            $hasCondition = true;
        }
        if ($hasCondition) {
            $builder->groupEnd()->delete();
        }
    }
}
