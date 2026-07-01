<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class UseNumericGlobalStatusCodes extends Migration
{
    public function up(): void
    {
        foreach ($this->commonStatusTables() as $table) {
            $this->mapStatus($table, 'status', [
                'draft' => '00',
                'pending' => '00',
                'invited' => '00',
                'active' => '10',
                'enabled' => '10',
                'ready' => '10',
                'inactive' => '90',
                'disabled' => '90',
                'depleted' => '90',
                'deleted' => '99',
            ], '10');
        }

        $this->mapStatus('orders', 'payment_status', [
            'unpaid' => '00',
            'pending' => '00',
            'paid' => '10',
            'settled' => '10',
            'captured' => '10',
            'failed' => '20',
            'expired' => '30',
            'cancelled' => '99',
            'canceled' => '99',
        ], '00');
        $this->mapStatus('payment_transactions', 'status', [
            'pending' => '00',
            'fallback_pending' => '00',
            'paid' => '10',
            'succeeded' => '10',
            'settled' => '10',
            'captured' => '10',
            'failed' => '20',
            'configuration_required' => '20',
            'expired' => '30',
            'cancelled' => '99',
            'canceled' => '99',
        ], '00');
        $this->mapStatus('payment_methods', 'connector_status', [
            'not_configured' => '00',
            'configuration_required' => '00',
            'ready' => '10',
            'active' => '10',
            'inactive' => '90',
            'connector_not_implemented' => '90',
        ], '00');
        $this->mapStatus('products', 'recipe_status', [
            'draft' => '00',
            'pending' => '00',
            'ready' => '10',
            'active' => '10',
        ], '00');
        $this->mapStatus('operating_expenses', 'status', [
            'draft' => '00',
            'posted' => '10',
            'active' => '10',
            'void' => '99',
            'cancelled' => '99',
        ], '10');
        $this->mapStatus('user_invitations', 'status', [
            'pending' => '00',
            'invited' => '00',
            'sent' => '10',
            'accepted' => '20',
            'active' => '20',
            'send_failed' => '30',
            'failed' => '30',
            'superseded' => '90',
            'expired' => '99',
            'cancelled' => '99',
        ], '00');

        $this->shrinkStatusColumns();
    }

    public function down(): void
    {
        foreach ($this->commonStatusTables() as $table) {
            $this->mapStatus($table, 'status', [
                '00' => 'draft',
                '10' => 'active',
                '90' => 'inactive',
                '99' => 'deleted',
            ], 'active');
        }

        $this->mapStatus('orders', 'payment_status', [
            '00' => 'unpaid',
            '10' => 'paid',
            '20' => 'failed',
            '30' => 'expired',
            '99' => 'cancelled',
        ], 'unpaid');
        $this->mapStatus('payment_transactions', 'status', [
            '00' => 'pending',
            '10' => 'paid',
            '20' => 'failed',
            '30' => 'expired',
            '99' => 'cancelled',
        ], 'pending');
        $this->mapStatus('payment_methods', 'connector_status', [
            '00' => 'not_configured',
            '10' => 'ready',
            '90' => 'inactive',
        ], 'not_configured');
        $this->mapStatus('products', 'recipe_status', [
            '00' => 'draft',
            '10' => 'ready',
        ], 'draft');
        $this->mapStatus('operating_expenses', 'status', [
            '00' => 'draft',
            '10' => 'posted',
            '99' => 'void',
        ], 'posted');
        $this->mapStatus('user_invitations', 'status', [
            '00' => 'pending',
            '10' => 'sent',
            '20' => 'accepted',
            '30' => 'send_failed',
            '90' => 'superseded',
            '99' => 'expired',
        ], 'pending');
    }

    private function commonStatusTables(): array
    {
        return [
            'companies',
            'outlets',
            'users',
            'roles',
            'categories',
            'products',
            'product_outlet_prices',
            'modifiers',
            'modifier_options',
            'modifier_option_outlet_prices',
            'ingredient_templates',
            'outlet_ingredients',
            'outlet_ingredient_mappings',
            'ingredient_lots',
            'product_batches',
            'dining_tables',
            'payment_methods',
            'packaging_rules',
            'public_customers',
        ];
    }

    private function mapStatus(string $table, string $field, array $map, string $default): void
    {
        if (! $this->db->tableExists($table) || ! $this->db->fieldExists($field, $table)) {
            return;
        }

        foreach ($map as $from => $to) {
            $this->db->table($table)->where($field, $from)->update([$field => $to]);
        }
        $this->db->table($table)
            ->groupStart()
            ->where($field, null)
            ->orWhere($field, '')
            ->groupEnd()
            ->update([$field => $default]);
    }

    private function shrinkStatusColumns(): void
    {
        $columns = [
            ['orders', 'payment_status', '00'],
            ['payment_transactions', 'status', '00'],
            ['payment_methods', 'connector_status', '00'],
            ['products', 'recipe_status', '00'],
            ['operating_expenses', 'status', '10'],
            ['user_invitations', 'status', '00'],
        ];
        foreach ($this->commonStatusTables() as $table) {
            $columns[] = [$table, 'status', '10'];
        }

        foreach ($columns as [$table, $field, $default]) {
            if (! $this->db->tableExists($table) || ! $this->db->fieldExists($field, $table)) {
                continue;
            }
            $this->forge->modifyColumn($table, [
                $field => ['type' => 'VARCHAR', 'constraint' => 2, 'default' => $default],
            ]);
        }
    }
}
