<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateProductOutletPrices extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('product_outlet_prices')) {
            return;
        }

        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'company_id' => ['type' => 'INT', 'unsigned' => true],
            'outlet_id' => ['type' => 'INT', 'unsigned' => true],
            'product_id' => ['type' => 'INT', 'unsigned' => true],
            'selling_price' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0],
            'note' => ['type' => 'TEXT', 'null' => true],
            'status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'active'],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
            'deleted_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey(['company_id', 'outlet_id', 'product_id'], 'uq_product_outlet_price');
        $this->forge->addKey(['outlet_id', 'status'], false, false, 'idx_product_outlet_price_status');
        $this->forge->createTable('product_outlet_prices');

        $this->addForeign('product_outlet_prices', 'fk_product_prices_company', ['company_id'], 'companies', ['id']);
        $this->addForeign('product_outlet_prices', 'fk_product_prices_outlet', ['outlet_id'], 'outlets', ['id']);
        $this->addForeign('product_outlet_prices', 'fk_product_prices_product', ['product_id'], 'products', ['id'], 'CASCADE');
    }

    public function down(): void
    {
        foreach (['fk_product_prices_product', 'fk_product_prices_outlet', 'fk_product_prices_company'] as $constraint) {
            if ($this->foreignKeyExists($constraint)) {
                $this->db->query("ALTER TABLE `product_outlet_prices` DROP FOREIGN KEY `{$constraint}`");
            }
        }
        $this->forge->dropTable('product_outlet_prices', true);
    }

    private function addForeign(
        string $table,
        string $name,
        array $columns,
        string $refTable,
        array $refColumns,
        string $onDelete = 'RESTRICT'
    ): void {
        if (! $this->db->tableExists($table) || ! $this->db->tableExists($refTable) || $this->foreignKeyExists($name)) {
            return;
        }
        $cols = implode('`,`', $columns);
        $refCols = implode('`,`', $refColumns);
        $this->db->query("ALTER TABLE `{$table}` ADD CONSTRAINT `{$name}` FOREIGN KEY (`{$cols}`) REFERENCES `{$refTable}` (`{$refCols}`) ON DELETE {$onDelete} ON UPDATE CASCADE");
    }

    private function foreignKeyExists(string $name): bool
    {
        $row = $this->db->query(
            'SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ? LIMIT 1',
            [$name]
        )->getRowArray();

        return (bool) $row;
    }
}
