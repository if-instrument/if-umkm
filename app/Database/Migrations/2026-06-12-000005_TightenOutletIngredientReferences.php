<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class TightenOutletIngredientReferences extends Migration
{
    public function up(): void
    {
        $this->dropForeignKeyIfExists('stock_movements', 'fk_stock_movements_ingredient');
        $this->dropForeignKeyIfExists('packaging_rule_items', 'fk_packaging_items_ingredient');

        if ($this->db->tableExists('stock_movements') && $this->db->fieldExists('outlet_ingredient_id', 'stock_movements')) {
            $this->forge->modifyColumn('stock_movements', [
                'outlet_ingredient_id' => [
                    'name' => 'outlet_ingredient_id',
                    'type' => 'INT',
                    'unsigned' => true,
                    'null' => false,
                ],
            ]);
        }

        if ($this->db->tableExists('packaging_rule_items') && $this->db->fieldExists('outlet_ingredient_id', 'packaging_rule_items')) {
            $this->forge->modifyColumn('packaging_rule_items', [
                'outlet_ingredient_id' => [
                    'name' => 'outlet_ingredient_id',
                    'type' => 'INT',
                    'unsigned' => true,
                    'null' => false,
                ],
            ]);
        }

        $this->addForeignKeyIfMissing('stock_movements', 'fk_stock_movements_ingredient', 'outlet_ingredient_id');
        $this->addForeignKeyIfMissing('packaging_rule_items', 'fk_packaging_items_ingredient', 'outlet_ingredient_id');
    }

    public function down(): void
    {
        $this->dropForeignKeyIfExists('stock_movements', 'fk_stock_movements_ingredient');
        $this->dropForeignKeyIfExists('packaging_rule_items', 'fk_packaging_items_ingredient');

        foreach (['stock_movements', 'packaging_rule_items'] as $table) {
            if ($this->db->tableExists($table) && $this->db->fieldExists('outlet_ingredient_id', $table)) {
                $this->forge->modifyColumn($table, [
                    'outlet_ingredient_id' => [
                        'name' => 'outlet_ingredient_id',
                        'type' => 'INT',
                        'unsigned' => true,
                        'null' => true,
                    ],
                ]);
            }
        }

        $this->addForeignKeyIfMissing('stock_movements', 'fk_stock_movements_ingredient', 'outlet_ingredient_id');
        $this->addForeignKeyIfMissing('packaging_rule_items', 'fk_packaging_items_ingredient', 'outlet_ingredient_id');
    }

    private function dropForeignKeyIfExists(string $table, string $constraint): void
    {
        $exists = $this->db->query(
            'SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1',
            [$table, $constraint]
        )->getRowArray();

        if ($exists) {
            $this->db->query("ALTER TABLE `{$table}` DROP FOREIGN KEY `{$constraint}`");
        }
    }

    private function addForeignKeyIfMissing(string $table, string $constraint, string $column): void
    {
        if (! $this->db->tableExists($table) || ! $this->db->tableExists('outlet_ingredients')) return;

        $exists = $this->db->query(
            'SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1',
            [$table, $constraint]
        )->getRowArray();

        if (! $exists) {
            $this->db->query("ALTER TABLE `{$table}` ADD CONSTRAINT `{$constraint}` FOREIGN KEY (`{$column}`) REFERENCES `outlet_ingredients` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE");
        }
    }
}
