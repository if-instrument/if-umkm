<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddBatchExpiryAndFinishedGoods extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('products')) {
            if (! $this->db->fieldExists('inventory_type', 'products')) {
                $this->forge->addColumn('products', [
                    'inventory_type' => [
                        'type' => 'VARCHAR',
                        'constraint' => 32,
                        'default' => 'made_to_order',
                        'after' => 'recipe_status',
                    ],
                ]);
            }
            if (! $this->db->fieldExists('shelf_life_days', 'products')) {
                $this->forge->addColumn('products', [
                    'shelf_life_days' => [
                        'type' => 'INT',
                        'unsigned' => true,
                        'default' => 0,
                        'after' => 'inventory_type',
                    ],
                ]);
            }
        }

        if (! $this->db->tableExists('ingredient_lots')) {
            $this->forge->addField([
                'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
                'company_id' => ['type' => 'INT', 'unsigned' => true],
                'outlet_id' => ['type' => 'INT', 'unsigned' => true],
                'outlet_ingredient_id' => ['type' => 'INT', 'unsigned' => true],
                'lot_no' => ['type' => 'VARCHAR', 'constraint' => 80],
                'qty_initial' => ['type' => 'DECIMAL', 'constraint' => '14,3', 'default' => 0],
                'qty_remaining' => ['type' => 'DECIMAL', 'constraint' => '14,3', 'default' => 0],
                'unit_cost' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0],
                'manufactured_at' => ['type' => 'DATE', 'null' => true],
                'expired_at' => ['type' => 'DATE', 'null' => true],
                'reference_type' => ['type' => 'VARCHAR', 'constraint' => 40, 'null' => true],
                'reference_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
                'status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'active'],
                'created_at' => ['type' => 'DATETIME', 'null' => true],
                'updated_at' => ['type' => 'DATETIME', 'null' => true],
                'deleted_at' => ['type' => 'DATETIME', 'null' => true],
            ]);
            $this->forge->addKey('id', true);
            $this->forge->addKey(['outlet_id', 'outlet_ingredient_id', 'expired_at'], false, false, 'idx_ingredient_lot_fefo');
            $this->forge->createTable('ingredient_lots');
        }

        if (! $this->db->tableExists('product_batches')) {
            $this->forge->addField([
                'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
                'company_id' => ['type' => 'INT', 'unsigned' => true],
                'outlet_id' => ['type' => 'INT', 'unsigned' => true],
                'product_id' => ['type' => 'INT', 'unsigned' => true],
                'batch_no' => ['type' => 'VARCHAR', 'constraint' => 80],
                'qty_initial' => ['type' => 'DECIMAL', 'constraint' => '14,3', 'default' => 0],
                'qty_remaining' => ['type' => 'DECIMAL', 'constraint' => '14,3', 'default' => 0],
                'unit_cost' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0],
                'manufactured_at' => ['type' => 'DATE', 'null' => true],
                'expired_at' => ['type' => 'DATE', 'null' => true],
                'status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'active'],
                'notes' => ['type' => 'TEXT', 'null' => true],
                'created_at' => ['type' => 'DATETIME', 'null' => true],
                'updated_at' => ['type' => 'DATETIME', 'null' => true],
                'deleted_at' => ['type' => 'DATETIME', 'null' => true],
            ]);
            $this->forge->addKey('id', true);
            $this->forge->addKey(['outlet_id', 'product_id', 'expired_at'], false, false, 'idx_product_batch_fefo');
            $this->forge->createTable('product_batches');
        }

        $this->backfillIngredientLots();
    }

    private function backfillIngredientLots(): void
    {
        if (! $this->db->tableExists('ingredient_lots') || ! $this->db->tableExists('outlet_ingredients')) {
            return;
        }

        $existingLots = (int) $this->db->table('ingredient_lots')->countAllResults();
        if ($existingLots > 0) {
            return;
        }

        $now = date('Y-m-d H:i:s');
        $rows = $this->db->table('outlet_ingredients')
            ->where('stock_qty >', 0)
            ->get()
            ->getResultArray();

        foreach ($rows as $row) {
            $this->db->table('ingredient_lots')->insert([
                'company_id' => (int) $row['company_id'],
                'outlet_id' => (int) $row['outlet_id'],
                'outlet_ingredient_id' => (int) $row['id'],
                'lot_no' => 'OPENING-' . (int) $row['id'],
                'qty_initial' => (float) $row['stock_qty'],
                'qty_remaining' => (float) $row['stock_qty'],
                'unit_cost' => (float) $row['average_cost'],
                'manufactured_at' => null,
                'expired_at' => null,
                'reference_type' => 'opening_backfill',
                'reference_id' => null,
                'status' => 'active',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        $this->forge->dropTable('product_batches', true);
        $this->forge->dropTable('ingredient_lots', true);
        if ($this->db->tableExists('products')) {
            if ($this->db->fieldExists('shelf_life_days', 'products')) {
                $this->forge->dropColumn('products', 'shelf_life_days');
            }
            if ($this->db->fieldExists('inventory_type', 'products')) {
                $this->forge->dropColumn('products', 'inventory_type');
            }
        }
    }
}
