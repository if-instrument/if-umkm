<?php

namespace App\Database\TenantMigrations;

use CodeIgniter\Database\Migration;

class OptimizeTenantDatabaseIndexes extends Migration
{
    public function up()
    {
        $db = $this->db;

        // Helper to check and add index safely
        $addIndexIfNotExists = function (string $table, string $indexName, array $columns) use ($db) {
            if (! $db->tableExists($table)) return;

            // Check if all columns exist in the table
            foreach ($columns as $col) {
                if (! $db->fieldExists($col, $table)) return;
            }

            $indexes = $db->query("SHOW INDEX FROM `{$table}` WHERE Key_name = '{$indexName}'")->getResultArray();
            if (empty($indexes)) {
                $colsList = implode('`, `', $columns);
                $db->query("ALTER TABLE `{$table}` ADD INDEX `{$indexName}` (`{$colsList}`)");
            }
        };

        // Orders Table Indexes
        $addIndexIfNotExists('orders', 'idx_orders_outlet_status_created', ['outlet_id', 'status', 'created_at']);
        $addIndexIfNotExists('orders', 'idx_orders_order_no', ['order_no']);
        $addIndexIfNotExists('orders', 'idx_orders_payment_created', ['outlet_id', 'payment_status', 'created_at']);
        $addIndexIfNotExists('orders', 'idx_orders_created', ['created_at']);

        // Order Items Table Indexes
        $addIndexIfNotExists('order_items', 'idx_order_items_order_product', ['order_id', 'product_id']);
        $addIndexIfNotExists('order_items', 'idx_order_items_ingredient', ['ingredient_id']);

        // Stock Movements Table Indexes
        $addIndexIfNotExists('stock_movements', 'idx_stock_mov_outlet_ing_created', ['outlet_id', 'outlet_ingredient_id', 'created_at']);
        $addIndexIfNotExists('stock_movements', 'idx_stock_mov_type_created', ['outlet_id', 'movement_type', 'created_at']);

        // Outlet Ingredients Table Indexes
        $addIndexIfNotExists('outlet_ingredients', 'idx_outlet_ing_status', ['outlet_id', 'status']);
        $addIndexIfNotExists('outlet_ingredients', 'idx_outlet_ing_sku', ['sku']);

        // Ingredient Lots Table Indexes
        $addIndexIfNotExists('ingredient_lots', 'idx_inglots_fifo', ['outlet_ingredient_id', 'outlet_id', 'status', 'qty_remaining', 'expired_at']);

        // Product Batches Table Indexes
        $addIndexIfNotExists('product_batches', 'idx_batches_lookup', ['product_id', 'outlet_id', 'status', 'qty_remaining']);

        // Operating Expenses Table Indexes
        $addIndexIfNotExists('operating_expenses', 'idx_expenses_outlet_date', ['outlet_id', 'expense_date', 'status']);
    }

    public function down()
    {
        $db = $this->db;

        $dropIndexIfExists = function (string $table, string $indexName) use ($db) {
            if (! $db->tableExists($table)) return;
            $indexes = $db->query("SHOW INDEX FROM `{$table}` WHERE Key_name = '{$indexName}'")->getResultArray();
            if (! empty($indexes)) {
                $db->query("ALTER TABLE `{$table}` DROP INDEX `{$indexName}`");
            }
        };

        $dropIndexIfExists('orders', 'idx_orders_outlet_status_created');
        $dropIndexIfExists('orders', 'idx_orders_order_no');
        $dropIndexIfExists('orders', 'idx_orders_payment_created');
        $dropIndexIfExists('orders', 'idx_orders_created');

        $dropIndexIfExists('order_items', 'idx_order_items_order_product');
        $dropIndexIfExists('order_items', 'idx_order_items_ingredient');

        $dropIndexIfExists('stock_movements', 'idx_stock_mov_outlet_ing_created');
        $dropIndexIfExists('stock_movements', 'idx_stock_mov_type_created');

        $dropIndexIfExists('outlet_ingredients', 'idx_outlet_ing_status');
        $dropIndexIfExists('outlet_ingredients', 'idx_outlet_ing_sku');

        $dropIndexIfExists('ingredient_lots', 'idx_inglots_fifo');

        $dropIndexIfExists('product_batches', 'idx_batches_lookup');

        $dropIndexIfExists('operating_expenses', 'idx_expenses_outlet_date');
    }
}
