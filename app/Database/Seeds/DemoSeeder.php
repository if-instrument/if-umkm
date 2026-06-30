<?php

namespace App\Database\Seeds;

use CodeIgniter\Database\Seeder;

class DemoSeeder extends Seeder
{
    public function run(): void
    {
        $this->resetApplicationData();
        $this->seedSuperAdmin();
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
            'name' => 'Super Admin SaaS',
            'email' => 'superadmin@app.test',
            'password_hash' => password_hash('super123', PASSWORD_DEFAULT),
            'type' => 'super_admin',
            'status' => 'active',
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }
}
