<?php

namespace App\Database\Seeds;

use App\Services\StatusCodeService;
use CodeIgniter\Database\Seeder;
use Config\Database;

class DemoSeeder extends Seeder
{
    public function run(): void
    {
        $this->resetApplicationData();
        $this->seedSuperAdmin();
        $this->seedDemoCompany();
    }

    private function resetApplicationData(): void
    {
        $tables = [
            'user_invitations',
            'payment_transaction_logs',
            'payment_transactions',
            'order_items',
            'orders',
            'stock_movements',
            'product_batch_movements',
            'product_batches',
            'ingredient_lots',
            'operating_expenses',
            'product_recipe_items',
            'product_modifiers',
            'packaging_rule_items',
            'packaging_rules',
            'modifier_option_outlet_prices',
            'modifier_options',
            'modifiers',
            'product_outlet_prices',
            'products',
            'categories',
            'outlet_ingredient_mappings',
            'outlet_ingredients',
            'ingredient_templates',
            'payment_methods',
            'dining_tables',
            'app_settings',
            'user_outlets',
            'user_roles',
            'roles',
            'users',
            'outlets',
            'companies',
        ];

        $this->db->query('SET FOREIGN_KEY_CHECKS = 0');
        try {
            foreach ($tables as $table) {
                if ($this->db->tableExists($table)) {
                    $this->db->table($table)->truncate();
                }
            }
        } finally {
            $this->db->query('SET FOREIGN_KEY_CHECKS = 1');
        }
    }

    private function seedSuperAdmin(): void
    {
        $now = date('Y-m-d H:i:s');
        $this->db->table('users')->insert([
            'id' => 1,
            'company_id' => null,
            'name' => 'Super Admin IF Instrument',
            'email' => 'superadmin@ifinstrument.com',
            'password_hash' => password_hash('If_280792', PASSWORD_DEFAULT),
            'type' => 'super_admin',
            'status' => StatusCodeService::ACTIVE,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    private function seedDemoCompany(): void
    {
        $now = date('Y-m-d H:i:s');
        $passwordHash = password_hash('If_280792', PASSWORD_DEFAULT);

        // 1. Seed Company
        $this->db->table('companies')->insert([
            'id' => 1,
            'name' => 'IFresso Coffee',
            'brand_name' => 'IFresso Coffee',
            'route_slug' => 'IFresso-Coffee',
            'tagline' => 'Artisan Coffee & Bakery',
            'theme_color' => '#6f3710',
            'db_mode' => 'dedicated',
            'db_name' => 'if_umkm_ifresso_coffee',
            'status' => StatusCodeService::ACTIVE,
            'payment_status' => '10',
            'subscription_plan' => 'Enterprise',
            'expires_at' => '2030-12-31',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        // 2. Seed Central Company Admin
        $this->db->table('users')->insert([
            'id' => 2,
            'company_id' => 1,
            'name' => 'Imam Faisal',
            'email' => 'if.imam.faisal@gmail.com',
            'password_hash' => $passwordHash,
            'type' => 'company_admin',
            'status' => StatusCodeService::ACTIVE,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        // 3. Sync to Dedicated Tenant Database
        try {
            $tenantDb = Database::connect([
                'DSN'      => '',
                'hostname' => '127.0.0.1',
                'username' => 'root',
                'password' => '1m4mf4154l',
                'database' => 'if_umkm_ifresso_coffee',
                'DBDriver' => 'MySQLi',
                'DBPrefix' => '',
                'pConnect' => false,
                'DBDebug'  => true,
                'charset'  => 'utf8mb4',
                'DBCollat' => 'utf8mb4_general_ci',
                'swapPre'  => '',
                'encrypt'  => false,
                'compress' => false,
                'strictOn' => false,
                'failover' => [],
                'port'     => 3306,
            ], false);

            if ($tenantDb && $tenantDb->tableExists('users')) {
                $tenantDb->table('users')->truncate();
                $tenantDb->table('users')->insert([
                    'id' => 1,
                    'name' => 'Imam Faisal',
                    'email' => 'if.imam.faisal@gmail.com',
                    'password_hash' => $passwordHash,
                    'type' => 'company_admin',
                    'status' => StatusCodeService::ACTIVE,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        } catch (\Throwable $e) {
            // Ignore if tenant DB not yet configured
        }
    }
}
