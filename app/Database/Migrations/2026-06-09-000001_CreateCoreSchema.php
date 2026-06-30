<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateCoreSchema extends Migration
{
    public function up(): void
    {
        $this->createCompanies();
        $this->createOutlets();
        $this->createUsersAndRoles();
        $this->createProducts();
        $this->createInventory();
        $this->createOrders();
    }

    public function down(): void
    {
        foreach ([
            'order_items', 'orders', 'stock_movements', 'product_recipe_items',
            'modifier_options', 'modifiers', 'outlet_ingredients', 'ingredient_templates', 'products',
            'categories', 'user_outlets', 'user_roles', 'roles', 'users',
            'outlets', 'companies',
        ] as $table) {
            $this->forge->dropTable($table, true);
        }
    }

    private function baseFields(): array
    {
        return [
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
            'deleted_at' => ['type' => 'DATETIME', 'null' => true],
        ];
    }

    private function createCompanies(): void
    {
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'name' => ['type' => 'VARCHAR', 'constraint' => 160],
            'brand_name' => ['type' => 'VARCHAR', 'constraint' => 160],
            'route_slug' => ['type' => 'VARCHAR', 'constraint' => 120, 'null' => true],
            'tagline' => ['type' => 'VARCHAR', 'constraint' => 160, 'null' => true],
            'logo_path' => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'theme_color' => ['type' => 'VARCHAR', 'constraint' => 32, 'default' => '#6f3710'],
            'status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'active'],
        ] + $this->baseFields());
        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('route_slug');
        $this->forge->createTable('companies');
    }

    private function createOutlets(): void
    {
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'company_id' => ['type' => 'INT', 'unsigned' => true],
            'name' => ['type' => 'VARCHAR', 'constraint' => 160],
            'code' => ['type' => 'VARCHAR', 'constraint' => 32],
            'address' => ['type' => 'TEXT', 'null' => true],
            'status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'active'],
        ] + $this->baseFields());
        $this->forge->addKey('id', true);
        $this->forge->addKey(['company_id', 'code']);
        $this->forge->createTable('outlets');
    }

    private function createUsersAndRoles(): void
    {
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'company_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'name' => ['type' => 'VARCHAR', 'constraint' => 160],
            'email' => ['type' => 'VARCHAR', 'constraint' => 160],
            'password_hash' => ['type' => 'VARCHAR', 'constraint' => 255],
            'type' => ['type' => 'VARCHAR', 'constraint' => 32, 'default' => 'company_user'],
            'status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'active'],
        ] + $this->baseFields());
        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('email');
        $this->forge->createTable('users');

        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'company_id' => ['type' => 'INT', 'unsigned' => true],
            'name' => ['type' => 'VARCHAR', 'constraint' => 120],
            'scope' => ['type' => 'VARCHAR', 'constraint' => 32, 'default' => 'single_outlet'],
            'permissions' => ['type' => 'JSON'],
            'status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'active'],
        ] + $this->baseFields());
        $this->forge->addKey('id', true);
        $this->forge->createTable('roles');

        $this->forge->addField([
            'user_id' => ['type' => 'INT', 'unsigned' => true],
            'role_id' => ['type' => 'INT', 'unsigned' => true],
        ]);
        $this->forge->addKey(['user_id', 'role_id'], true);
        $this->forge->createTable('user_roles');

        $this->forge->addField([
            'user_id' => ['type' => 'INT', 'unsigned' => true],
            'outlet_id' => ['type' => 'INT', 'unsigned' => true],
        ]);
        $this->forge->addKey(['user_id', 'outlet_id'], true);
        $this->forge->createTable('user_outlets');
    }

    private function createProducts(): void
    {
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'company_id' => ['type' => 'INT', 'unsigned' => true],
            'outlet_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'name' => ['type' => 'VARCHAR', 'constraint' => 120],
            'description' => ['type' => 'TEXT', 'null' => true],
            'scope' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'company'],
            'status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'active'],
        ] + $this->baseFields());
        $this->forge->addKey('id', true);
        $this->forge->createTable('categories');

        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'company_id' => ['type' => 'INT', 'unsigned' => true],
            'outlet_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'sku' => ['type' => 'VARCHAR', 'constraint' => 64],
            'name' => ['type' => 'VARCHAR', 'constraint' => 160],
            'description' => ['type' => 'TEXT', 'null' => true],
            'image_path' => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'selling_price' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0],
            'scope' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'company'],
            'recipe_status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'draft'],
            'status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'active'],
        ] + $this->baseFields());
        $this->forge->addKey('id', true);
        $this->forge->addKey(['company_id', 'sku']);
        $this->forge->createTable('products');

        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'company_id' => ['type' => 'INT', 'unsigned' => true],
            'outlet_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'name' => ['type' => 'VARCHAR', 'constraint' => 160],
            'selection_type' => ['type' => 'VARCHAR', 'constraint' => 32, 'default' => 'optional'],
            'scope' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'company'],
            'status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'active'],
        ] + $this->baseFields());
        $this->forge->addKey('id', true);
        $this->forge->createTable('modifiers');

        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'modifier_id' => ['type' => 'INT', 'unsigned' => true],
            'name' => ['type' => 'VARCHAR', 'constraint' => 160],
            'price_delta' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0],
            'ingredient_rules' => ['type' => 'JSON', 'null' => true],
            'status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'active'],
        ] + $this->baseFields());
        $this->forge->addKey('id', true);
        $this->forge->createTable('modifier_options');
    }

    private function createInventory(): void
    {
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'company_id' => ['type' => 'INT', 'unsigned' => true],
            'code' => ['type' => 'VARCHAR', 'constraint' => 80],
            'name' => ['type' => 'VARCHAR', 'constraint' => 160],
            'category' => ['type' => 'VARCHAR', 'constraint' => 80, 'null' => true],
            'unit' => ['type' => 'VARCHAR', 'constraint' => 32],
            'status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'active'],
        ] + $this->baseFields());
        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey(['company_id', 'code']);
        $this->forge->createTable('ingredient_templates');

        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'company_id' => ['type' => 'INT', 'unsigned' => true],
            'outlet_id' => ['type' => 'INT', 'unsigned' => true],
            'template_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'sku' => ['type' => 'VARCHAR', 'constraint' => 64],
            'name' => ['type' => 'VARCHAR', 'constraint' => 160],
            'category' => ['type' => 'VARCHAR', 'constraint' => 80, 'null' => true],
            'unit' => ['type' => 'VARCHAR', 'constraint' => 32],
            'stock_qty' => ['type' => 'DECIMAL', 'constraint' => '14,3', 'default' => 0],
            'minimum_stock' => ['type' => 'DECIMAL', 'constraint' => '14,3', 'default' => 0],
            'average_cost' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0],
            'standard_cost' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0],
            'status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'active'],
        ] + $this->baseFields());
        $this->forge->addKey('id', true);
        $this->forge->addKey(['company_id', 'outlet_id', 'sku']);
        $this->forge->createTable('outlet_ingredients');

        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'company_id' => ['type' => 'INT', 'unsigned' => true],
            'product_id' => ['type' => 'INT', 'unsigned' => true],
            'template_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'qty' => ['type' => 'DECIMAL', 'constraint' => '14,3'],
            'unit' => ['type' => 'VARCHAR', 'constraint' => 32],
        ] + $this->baseFields());
        $this->forge->addKey('id', true);
        $this->forge->createTable('product_recipe_items');

        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'company_id' => ['type' => 'INT', 'unsigned' => true],
            'outlet_id' => ['type' => 'INT', 'unsigned' => true],
            'outlet_ingredient_id' => ['type' => 'INT', 'unsigned' => true],
            'movement_type' => ['type' => 'VARCHAR', 'constraint' => 40],
            'reference_type' => ['type' => 'VARCHAR', 'constraint' => 40, 'null' => true],
            'reference_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'stock_before' => ['type' => 'DECIMAL', 'constraint' => '14,3', 'default' => 0],
            'qty_in' => ['type' => 'DECIMAL', 'constraint' => '14,3', 'default' => 0],
            'qty_out' => ['type' => 'DECIMAL', 'constraint' => '14,3', 'default' => 0],
            'stock_after' => ['type' => 'DECIMAL', 'constraint' => '14,3', 'default' => 0],
            'unit_cost' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0],
            'total_cost' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0],
            'notes' => ['type' => 'TEXT', 'null' => true],
            'created_by' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
        ] + $this->baseFields());
        $this->forge->addKey('id', true);
        $this->forge->addKey(['outlet_id', 'outlet_ingredient_id', 'movement_type']);
        $this->forge->createTable('stock_movements');
    }

    private function createOrders(): void
    {
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'company_id' => ['type' => 'INT', 'unsigned' => true],
            'outlet_id' => ['type' => 'INT', 'unsigned' => true],
            'order_no' => ['type' => 'VARCHAR', 'constraint' => 64],
            'service_type' => ['type' => 'VARCHAR', 'constraint' => 32],
            'customer_name' => ['type' => 'VARCHAR', 'constraint' => 160, 'null' => true],
            'table_name' => ['type' => 'VARCHAR', 'constraint' => 80, 'null' => true],
            'status' => ['type' => 'VARCHAR', 'constraint' => 2, 'default' => '10'],
            'payment_status' => ['type' => 'VARCHAR', 'constraint' => 32, 'default' => 'unpaid'],
            'subtotal' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0],
            'packaging_fee' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0],
            'payment_fee' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0],
            'payment_fee_payer' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'merchant'],
            'tax_total' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0],
            'grand_total' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0],
            'cogs_total' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0],
            'gross_profit' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0],
        ] + $this->baseFields());
        $this->forge->addKey('id', true);
        $this->forge->addKey(['company_id', 'outlet_id', 'order_no']);
        $this->forge->createTable('orders');

        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'order_id' => ['type' => 'INT', 'unsigned' => true],
            'product_id' => ['type' => 'INT', 'unsigned' => true],
            'product_name' => ['type' => 'VARCHAR', 'constraint' => 160],
            'qty' => ['type' => 'DECIMAL', 'constraint' => '14,3'],
            'unit_price' => ['type' => 'DECIMAL', 'constraint' => '14,2'],
            'line_total' => ['type' => 'DECIMAL', 'constraint' => '14,2'],
            'cogs_total' => ['type' => 'DECIMAL', 'constraint' => '14,2'],
            'modifier_snapshot' => ['type' => 'JSON', 'null' => true],
            'recipe_snapshot' => ['type' => 'JSON', 'null' => true],
        ] + $this->baseFields());
        $this->forge->addKey('id', true);
        $this->forge->addKey('order_id');
        $this->forge->createTable('order_items');
    }
}
