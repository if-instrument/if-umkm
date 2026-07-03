<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateOperationalSettingsSchema extends Migration
{
    public function up(): void
    {
        $this->createDiningTables();
        $this->createPaymentMethods();
        $this->createPackagingRules();
        $this->createProductModifiers();
    }

    public function down(): void
    {
        foreach (['product_modifiers', 'packaging_rule_items', 'packaging_rules', 'payment_methods', 'dining_tables'] as $table) {
            $this->forge->dropTable($table, true);
        }
    }

    private function timestamps(): array
    {
        return [
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
            'deleted_at' => ['type' => 'DATETIME', 'null' => true],
        ];
    }

    private function createDiningTables(): void
    {
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'company_id' => ['type' => 'INT', 'unsigned' => true],
            'outlet_id' => ['type' => 'INT', 'unsigned' => true],
            'name' => ['type' => 'VARCHAR', 'constraint' => 80],
            'area' => ['type' => 'VARCHAR', 'constraint' => 80, 'null' => true],
            'capacity' => ['type' => 'INT', 'unsigned' => true, 'default' => 2],
            'sort_order' => ['type' => 'INT', 'default' => 0],
            'status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'active'],
        ] + $this->timestamps());
        $this->forge->addKey('id', true);
        $this->forge->createTable('dining_tables');
    }

    private function createPaymentMethods(): void
    {
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'company_id' => ['type' => 'INT', 'unsigned' => true],
            'outlet_id' => ['type' => 'INT', 'unsigned' => true],
            'name' => ['type' => 'VARCHAR', 'constraint' => 100],
            'type' => ['type' => 'VARCHAR', 'constraint' => 32],
            'gateway_provider' => ['type' => 'VARCHAR', 'constraint' => 40, 'default' => 'manual'],
            'channel_code' => ['type' => 'VARCHAR', 'constraint' => 80, 'null' => true],
            'terminal_id' => ['type' => 'VARCHAR', 'constraint' => 80, 'null' => true],
            'edc_mode' => ['type' => 'VARCHAR', 'constraint' => 32, 'default' => 'manual'],
            'merchant_id' => ['type' => 'VARCHAR', 'constraint' => 120, 'null' => true],
            'terminal_serial' => ['type' => 'VARCHAR', 'constraint' => 120, 'null' => true],
            'connector_status' => ['type' => 'VARCHAR', 'constraint' => 32, 'default' => 'not_configured'],
            'use_sandbox' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'fee_rate' => ['type' => 'DECIMAL', 'constraint' => '8,3', 'default' => 0],
            'fee_payer' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'merchant'],
            'account' => ['type' => 'VARCHAR', 'constraint' => 160, 'null' => true],
            'sort_order' => ['type' => 'INT', 'default' => 0],
            'status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'active'],
        ] + $this->timestamps());
        $this->forge->addKey('id', true);
        $this->forge->createTable('payment_methods');
    }

    private function createPackagingRules(): void
    {
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'company_id' => ['type' => 'INT', 'unsigned' => true],
            'outlet_id' => ['type' => 'INT', 'unsigned' => true],
            'name' => ['type' => 'VARCHAR', 'constraint' => 120],
            'min_qty' => ['type' => 'INT', 'unsigned' => true],
            'max_qty' => ['type' => 'INT', 'unsigned' => true],
            'status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'active'],
        ] + $this->timestamps());
        $this->forge->addKey('id', true);
        $this->forge->createTable('packaging_rules');

        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'packaging_rule_id' => ['type' => 'INT', 'unsigned' => true],
            'outlet_ingredient_id' => ['type' => 'INT', 'unsigned' => true],
            'qty' => ['type' => 'DECIMAL', 'constraint' => '14,3', 'default' => 1],
            'price' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0],
            'is_fallback' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 0],
        ] + $this->timestamps());
        $this->forge->addKey('id', true);
        $this->forge->addKey('packaging_rule_id');
        $this->forge->createTable('packaging_rule_items');
    }

    private function createProductModifiers(): void
    {
        $this->forge->addField([
            'product_id' => ['type' => 'INT', 'unsigned' => true],
            'modifier_id' => ['type' => 'INT', 'unsigned' => true],
        ]);
        $this->forge->addKey(['product_id', 'modifier_id'], true);
        $this->forge->createTable('product_modifiers');
    }
}
