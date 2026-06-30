<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AllowPackagingOrderItems extends Migration
{
    public function up()
    {
        if (! $this->db->tableExists('order_items')) {
            return;
        }

        $this->dropForeignKeyIfExists('order_items', 'fk_order_items_product');
        $this->db->query('ALTER TABLE `order_items` MODIFY `product_id` INT UNSIGNED NULL');
        $this->db->query('ALTER TABLE `order_items` ADD CONSTRAINT `fk_order_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE');
    }

    public function down()
    {
        if (! $this->db->tableExists('order_items')) {
            return;
        }

        $fallback = $this->db->table('products')->select('id')->orderBy('id', 'ASC')->get()->getRowArray();
        if ($fallback) {
            $this->db->table('order_items')->where('product_id', null)->update(['product_id' => (int) $fallback['id']]);
        }
        $this->dropForeignKeyIfExists('order_items', 'fk_order_items_product');
        $this->db->query('ALTER TABLE `order_items` MODIFY `product_id` INT UNSIGNED NOT NULL');
        $this->db->query('ALTER TABLE `order_items` ADD CONSTRAINT `fk_order_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE');
    }

    private function dropForeignKeyIfExists(string $table, string $constraint): void
    {
        $row = $this->db->query(
            'SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = "FOREIGN KEY"',
            [$table, $constraint]
        )->getRowArray();

        if ($row) {
            $this->db->query(sprintf('ALTER TABLE `%s` DROP FOREIGN KEY `%s`', $table, $constraint));
        }
    }
}
