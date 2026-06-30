<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class NormalizeMasterOutletSchema extends Migration
{
    public function up(): void
    {
        $this->renameLegacyTables();
        $this->renameLegacyColumns();
        $this->normalizeOutletScopedSettings();
        $this->addIndexes();
        $this->addForeignKeys();
    }

    public function down(): void
    {
        $this->dropForeignKeys();
        $this->dropIndexes();

        if ($this->db->tableExists('stock_movements') && $this->db->fieldExists('outlet_ingredient_id', 'stock_movements')) {
            $this->forge->modifyColumn('stock_movements', [
                'outlet_ingredient_id' => ['name' => 'ingredient_id', 'type' => 'INT', 'unsigned' => true],
            ]);
        }
        if ($this->db->tableExists('packaging_rule_items') && $this->db->fieldExists('outlet_ingredient_id', 'packaging_rule_items')) {
            $this->forge->modifyColumn('packaging_rule_items', [
                'outlet_ingredient_id' => ['name' => 'ingredient_id', 'type' => 'INT', 'unsigned' => true],
            ]);
        }
        if ($this->db->tableExists('product_recipe_items') && ! $this->db->tableExists('recipe_ingredients')) {
            $this->forge->renameTable('product_recipe_items', 'recipe_ingredients');
        }
        if ($this->db->tableExists('outlet_ingredients') && ! $this->db->tableExists('ingredients')) {
            $this->forge->renameTable('outlet_ingredients', 'ingredients');
        }
    }

    private function renameLegacyTables(): void
    {
        if ($this->db->tableExists('ingredients') && ! $this->db->tableExists('outlet_ingredients')) {
            $this->forge->renameTable('ingredients', 'outlet_ingredients');
        }
        if ($this->db->tableExists('recipe_ingredients') && ! $this->db->tableExists('product_recipe_items')) {
            $this->forge->renameTable('recipe_ingredients', 'product_recipe_items');
        }
    }

    private function renameLegacyColumns(): void
    {
        if ($this->db->tableExists('stock_movements') && $this->db->fieldExists('ingredient_id', 'stock_movements')) {
            $this->forge->modifyColumn('stock_movements', [
                'ingredient_id' => ['name' => 'outlet_ingredient_id', 'type' => 'INT', 'unsigned' => true],
            ]);
        }
        if ($this->db->tableExists('packaging_rule_items') && $this->db->fieldExists('ingredient_id', 'packaging_rule_items')) {
            $this->forge->modifyColumn('packaging_rule_items', [
                'ingredient_id' => ['name' => 'outlet_ingredient_id', 'type' => 'INT', 'unsigned' => true],
            ]);
        }
    }

    private function normalizeOutletScopedSettings(): void
    {
        foreach (['payment_methods', 'packaging_rules'] as $table) {
            if (! $this->db->tableExists($table) || ! $this->db->fieldExists('outlet_id', $table)) {
                continue;
            }
            $this->db->query("UPDATE {$table} t JOIN outlets o ON o.company_id = t.company_id SET t.outlet_id = o.id WHERE t.outlet_id IS NULL");
            $this->forge->modifyColumn($table, [
                'outlet_id' => ['name' => 'outlet_id', 'type' => 'INT', 'unsigned' => true, 'null' => false],
            ]);
        }
    }

    private function addIndexes(): void
    {
        $this->addUnique('outlets', 'uq_outlets_company_code', ['company_id', 'code']);
        $this->addUnique('roles', 'uq_roles_company_name', ['company_id', 'name']);
        $this->addUnique('categories', 'uq_categories_scope_name', ['company_id', 'outlet_id', 'name']);
        $this->addUnique('products', 'uq_products_company_sku', ['company_id', 'sku']);
        $this->addUnique('modifiers', 'uq_modifiers_scope_name', ['company_id', 'outlet_id', 'name']);
        $this->addUnique('outlet_ingredients', 'uq_outlet_ingredients_sku', ['company_id', 'outlet_id', 'sku']);
        $this->addUnique('outlet_ingredients', 'uq_outlet_ingredients_template', ['company_id', 'outlet_id', 'template_id']);
        $this->addUnique('product_recipe_items', 'uq_product_recipe_template', ['company_id', 'product_id', 'template_id']);
        $this->addUnique('payment_methods', 'uq_payment_methods_outlet_name', ['company_id', 'outlet_id', 'name']);
        $this->addUnique('packaging_rules', 'uq_packaging_rules_range', ['company_id', 'outlet_id', 'min_qty', 'max_qty']);

        $this->addIndex('product_recipe_items', 'idx_recipe_template', ['template_id']);
        $this->addIndex('modifier_options', 'idx_modifier_options_modifier', ['modifier_id']);
        $this->addIndex('stock_movements', 'idx_stock_movements_ingredient', ['outlet_ingredient_id']);
        $this->addIndex('packaging_rule_items', 'idx_packaging_items_ingredient', ['outlet_ingredient_id']);
        $this->addIndex('orders', 'idx_orders_outlet_status', ['company_id', 'outlet_id', 'status', 'payment_status']);
    }

    private function dropIndexes(): void
    {
        foreach ([
            ['orders', 'idx_orders_outlet_status'],
            ['packaging_rule_items', 'idx_packaging_items_ingredient'],
            ['stock_movements', 'idx_stock_movements_ingredient'],
            ['modifier_options', 'idx_modifier_options_modifier'],
            ['product_recipe_items', 'idx_recipe_template'],
            ['packaging_rules', 'uq_packaging_rules_range'],
            ['payment_methods', 'uq_payment_methods_outlet_name'],
            ['product_recipe_items', 'uq_product_recipe_template'],
            ['outlet_ingredients', 'uq_outlet_ingredients_template'],
            ['outlet_ingredients', 'uq_outlet_ingredients_sku'],
            ['modifiers', 'uq_modifiers_scope_name'],
            ['products', 'uq_products_company_sku'],
            ['categories', 'uq_categories_scope_name'],
            ['roles', 'uq_roles_company_name'],
            ['outlets', 'uq_outlets_company_code'],
        ] as [$table, $index]) {
            if ($this->indexExists($table, $index)) {
                $this->db->query("ALTER TABLE `{$table}` DROP INDEX `{$index}`");
            }
        }
    }

    private function addForeignKeys(): void
    {
        $this->addForeign('outlets', 'fk_outlets_company', ['company_id'], 'companies', ['id']);
        $this->addForeign('users', 'fk_users_company', ['company_id'], 'companies', ['id'], 'SET NULL');
        $this->addForeign('roles', 'fk_roles_company', ['company_id'], 'companies', ['id']);
        $this->addForeign('user_roles', 'fk_user_roles_user', ['user_id'], 'users', ['id'], 'CASCADE');
        $this->addForeign('user_roles', 'fk_user_roles_role', ['role_id'], 'roles', ['id'], 'CASCADE');
        $this->addForeign('user_outlets', 'fk_user_outlets_user', ['user_id'], 'users', ['id'], 'CASCADE');
        $this->addForeign('user_outlets', 'fk_user_outlets_outlet', ['outlet_id'], 'outlets', ['id'], 'CASCADE');

        $this->addForeign('categories', 'fk_categories_company', ['company_id'], 'companies', ['id']);
        $this->addForeign('categories', 'fk_categories_outlet', ['outlet_id'], 'outlets', ['id'], 'SET NULL');
        $this->addForeign('products', 'fk_products_company', ['company_id'], 'companies', ['id']);
        $this->addForeign('products', 'fk_products_outlet', ['outlet_id'], 'outlets', ['id'], 'SET NULL');
        $this->addForeign('modifiers', 'fk_modifiers_company', ['company_id'], 'companies', ['id']);
        $this->addForeign('modifiers', 'fk_modifiers_outlet', ['outlet_id'], 'outlets', ['id'], 'SET NULL');
        $this->addForeign('modifier_options', 'fk_modifier_options_modifier', ['modifier_id'], 'modifiers', ['id'], 'CASCADE');
        $this->addForeign('product_modifiers', 'fk_product_modifiers_product', ['product_id'], 'products', ['id'], 'CASCADE');
        $this->addForeign('product_modifiers', 'fk_product_modifiers_modifier', ['modifier_id'], 'modifiers', ['id'], 'CASCADE');

        $this->addForeign('ingredient_templates', 'fk_templates_company', ['company_id'], 'companies', ['id']);
        $this->addForeign('outlet_ingredients', 'fk_outlet_ingredients_company', ['company_id'], 'companies', ['id']);
        $this->addForeign('outlet_ingredients', 'fk_outlet_ingredients_outlet', ['outlet_id'], 'outlets', ['id']);
        $this->addForeign('outlet_ingredients', 'fk_outlet_ingredients_template', ['template_id'], 'ingredient_templates', ['id'], 'SET NULL');
        $this->addForeign('product_recipe_items', 'fk_recipe_company', ['company_id'], 'companies', ['id']);
        $this->addForeign('product_recipe_items', 'fk_recipe_product', ['product_id'], 'products', ['id'], 'CASCADE');
        $this->addForeign('product_recipe_items', 'fk_recipe_template', ['template_id'], 'ingredient_templates', ['id']);
        $this->addForeign('stock_movements', 'fk_stock_movements_company', ['company_id'], 'companies', ['id']);
        $this->addForeign('stock_movements', 'fk_stock_movements_outlet', ['outlet_id'], 'outlets', ['id']);
        $this->addForeign('stock_movements', 'fk_stock_movements_ingredient', ['outlet_ingredient_id'], 'outlet_ingredients', ['id']);

        $this->addForeign('dining_tables', 'fk_dining_tables_company', ['company_id'], 'companies', ['id']);
        $this->addForeign('dining_tables', 'fk_dining_tables_outlet', ['outlet_id'], 'outlets', ['id']);
        $this->addForeign('payment_methods', 'fk_payment_methods_company', ['company_id'], 'companies', ['id']);
        $this->addForeign('payment_methods', 'fk_payment_methods_outlet', ['outlet_id'], 'outlets', ['id']);
        $this->addForeign('packaging_rules', 'fk_packaging_rules_company', ['company_id'], 'companies', ['id']);
        $this->addForeign('packaging_rules', 'fk_packaging_rules_outlet', ['outlet_id'], 'outlets', ['id']);
        $this->addForeign('packaging_rule_items', 'fk_packaging_items_rule', ['packaging_rule_id'], 'packaging_rules', ['id'], 'CASCADE');
        $this->addForeign('packaging_rule_items', 'fk_packaging_items_ingredient', ['outlet_ingredient_id'], 'outlet_ingredients', ['id']);

        $this->addForeign('orders', 'fk_orders_company', ['company_id'], 'companies', ['id']);
        $this->addForeign('orders', 'fk_orders_outlet', ['outlet_id'], 'outlets', ['id']);
        $this->addForeign('order_items', 'fk_order_items_order', ['order_id'], 'orders', ['id'], 'CASCADE');
        $this->addForeign('order_items', 'fk_order_items_product', ['product_id'], 'products', ['id']);
    }

    private function dropForeignKeys(): void
    {
        foreach ([
            'fk_order_items_product', 'fk_order_items_order', 'fk_orders_outlet', 'fk_orders_company',
            'fk_packaging_items_ingredient', 'fk_packaging_items_rule', 'fk_packaging_rules_outlet', 'fk_packaging_rules_company',
            'fk_payment_methods_outlet', 'fk_payment_methods_company', 'fk_dining_tables_outlet', 'fk_dining_tables_company',
            'fk_stock_movements_ingredient', 'fk_stock_movements_outlet', 'fk_stock_movements_company',
            'fk_recipe_template', 'fk_recipe_product', 'fk_recipe_company',
            'fk_outlet_ingredients_template', 'fk_outlet_ingredients_outlet', 'fk_outlet_ingredients_company', 'fk_templates_company',
            'fk_product_modifiers_modifier', 'fk_product_modifiers_product', 'fk_modifier_options_modifier',
            'fk_modifiers_outlet', 'fk_modifiers_company', 'fk_products_outlet', 'fk_products_company',
            'fk_categories_outlet', 'fk_categories_company',
            'fk_user_outlets_outlet', 'fk_user_outlets_user', 'fk_user_roles_role', 'fk_user_roles_user',
            'fk_roles_company', 'fk_users_company', 'fk_outlets_company',
        ] as $constraint) {
            if ($this->foreignKeyExists($constraint)) {
                $this->db->query("ALTER TABLE `{$this->tableForConstraint($constraint)}` DROP FOREIGN KEY `{$constraint}`");
            }
        }
    }

    private function addUnique(string $table, string $name, array $columns): void
    {
        if (! $this->db->tableExists($table) || $this->indexExists($table, $name)) return;
        $cols = implode('`,`', $columns);
        $this->db->query("ALTER TABLE `{$table}` ADD UNIQUE KEY `{$name}` (`{$cols}`)");
    }

    private function addIndex(string $table, string $name, array $columns): void
    {
        if (! $this->db->tableExists($table) || $this->indexExists($table, $name)) return;
        $cols = implode('`,`', $columns);
        $this->db->query("ALTER TABLE `{$table}` ADD KEY `{$name}` (`{$cols}`)");
    }

    private function addForeign(
        string $table,
        string $name,
        array $columns,
        string $refTable,
        array $refColumns,
        string $onDelete = 'RESTRICT'
    ): void {
        if (! $this->db->tableExists($table) || ! $this->db->tableExists($refTable) || $this->foreignKeyExists($name)) return;
        $cols = implode('`,`', $columns);
        $refCols = implode('`,`', $refColumns);
        $this->db->query("ALTER TABLE `{$table}` ADD CONSTRAINT `{$name}` FOREIGN KEY (`{$cols}`) REFERENCES `{$refTable}` (`{$refCols}`) ON DELETE {$onDelete} ON UPDATE CASCADE");
    }

    private function indexExists(string $table, string $index): bool
    {
        if (! $this->db->tableExists($table)) return false;
        return (bool) $this->db->query(
            'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
            [$table, $index]
        )->getRowArray();
    }

    private function foreignKeyExists(string $constraint): bool
    {
        return (bool) $this->db->query(
            'SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = "FOREIGN KEY" AND CONSTRAINT_NAME = ? LIMIT 1',
            [$constraint]
        )->getRowArray();
    }

    private function tableForConstraint(string $constraint): string
    {
        return $this->db->query(
            'SELECT TABLE_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ? LIMIT 1',
            [$constraint]
        )->getRowArray()['TABLE_NAME'] ?? '';
    }
}
