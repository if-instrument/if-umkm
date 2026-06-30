<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateProductOutletCategories extends Migration
{
    public function up(): void
    {
        if (! $this->db->tableExists('product_outlet_categories')) {
            $this->forge->addField([
                'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
                'company_id' => ['type' => 'INT', 'unsigned' => true],
                'outlet_id' => ['type' => 'INT', 'unsigned' => true],
                'product_id' => ['type' => 'INT', 'unsigned' => true],
                'category_id' => ['type' => 'INT', 'unsigned' => true],
                'created_at' => ['type' => 'DATETIME', 'null' => true],
                'updated_at' => ['type' => 'DATETIME', 'null' => true],
            ]);
            $this->forge->addKey('id', true);
            $this->forge->addUniqueKey(['company_id', 'outlet_id', 'product_id'], 'uq_product_outlet_category');
            $this->forge->addKey(['company_id', 'outlet_id', 'category_id'], false, false, 'idx_product_outlet_category');
            $this->forge->addForeignKey('company_id', 'companies', 'id', 'CASCADE', 'CASCADE', 'fk_product_outlet_categories_company');
            $this->forge->addForeignKey('outlet_id', 'outlets', 'id', 'CASCADE', 'CASCADE', 'fk_product_outlet_categories_outlet');
            $this->forge->addForeignKey('product_id', 'products', 'id', 'CASCADE', 'CASCADE', 'fk_product_outlet_categories_product');
            $this->forge->addForeignKey('category_id', 'categories', 'id', 'CASCADE', 'RESTRICT', 'fk_product_outlet_categories_category');
            $this->forge->createTable('product_outlet_categories');
        }

        if ($this->db->fieldExists('category_id', 'products')) {
            $this->db->query(<<<'SQL'
                INSERT IGNORE INTO product_outlet_categories
                    (company_id, outlet_id, product_id, category_id, created_at, updated_at)
                SELECT p.company_id, o.id, p.id, p.category_id, NOW(), NOW()
                FROM products p
                INNER JOIN categories c ON c.id = p.category_id AND c.company_id = p.company_id
                INNER JOIN outlets o
                    ON o.company_id = p.company_id
                    AND o.status != 'inactive'
                    AND (p.outlet_id IS NULL OR p.outlet_id = o.id)
                    AND (c.outlet_id IS NULL OR c.outlet_id = o.id)
                WHERE p.category_id IS NOT NULL
            SQL);

            $foreignKeys = $this->db->query(<<<'SQL'
                SELECT CONSTRAINT_NAME
                FROM information_schema.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'products'
                    AND COLUMN_NAME = 'category_id'
                    AND REFERENCED_TABLE_NAME IS NOT NULL
            SQL)->getResultArray();
            foreach ($foreignKeys as $foreignKey) {
                $name = str_replace('`', '``', $foreignKey['CONSTRAINT_NAME']);
                $this->db->query("ALTER TABLE `products` DROP FOREIGN KEY `{$name}`");
            }

            $indexes = $this->db->query("SHOW INDEX FROM `products` WHERE Column_name = 'category_id'")->getResultArray();
            foreach (array_unique(array_column($indexes, 'Key_name')) as $index) {
                if ($index === 'PRIMARY') continue;
                $name = str_replace('`', '``', $index);
                $this->db->query("ALTER TABLE `products` DROP INDEX `{$name}`");
            }
            $this->forge->dropColumn('products', 'category_id');
        }
    }

    public function down(): void
    {
        if (! $this->db->fieldExists('category_id', 'products')) {
            $this->forge->addColumn('products', [
                'category_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true, 'after' => 'outlet_id'],
            ]);
            $this->db->query(<<<'SQL'
                UPDATE products p
                INNER JOIN (
                    SELECT product_id, MIN(category_id) category_id
                    FROM product_outlet_categories
                    GROUP BY product_id
                ) poc ON poc.product_id = p.id
                SET p.category_id = poc.category_id
            SQL);
        }
        $this->forge->dropTable('product_outlet_categories', true);
    }
}
