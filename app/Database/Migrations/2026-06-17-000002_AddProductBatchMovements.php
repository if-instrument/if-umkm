<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddProductBatchMovements extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('product_batch_movements')) {
            return;
        }

        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'company_id' => ['type' => 'INT', 'unsigned' => true],
            'outlet_id' => ['type' => 'INT', 'unsigned' => true],
            'product_id' => ['type' => 'INT', 'unsigned' => true],
            'product_batch_id' => ['type' => 'INT', 'unsigned' => true],
            'movement_type' => ['type' => 'VARCHAR', 'constraint' => 40],
            'stock_before' => ['type' => 'DECIMAL', 'constraint' => '14,3', 'default' => 0],
            'qty_in' => ['type' => 'DECIMAL', 'constraint' => '14,3', 'default' => 0],
            'qty_out' => ['type' => 'DECIMAL', 'constraint' => '14,3', 'default' => 0],
            'stock_after' => ['type' => 'DECIMAL', 'constraint' => '14,3', 'default' => 0],
            'unit_cost' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0],
            'total_cost' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0],
            'notes' => ['type' => 'TEXT', 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
            'deleted_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['company_id', 'outlet_id', 'movement_type'], false, false, 'idx_product_batch_movement_report');
        $this->forge->addKey(['product_batch_id', 'created_at'], false, false, 'idx_product_batch_movement_batch');
        $this->forge->createTable('product_batch_movements');
    }

    public function down(): void
    {
        $this->forge->dropTable('product_batch_movements', true);
    }
}
