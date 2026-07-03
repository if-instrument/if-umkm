<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateOperatingExpenses extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('operating_expenses')) {
            return;
        }

        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'company_id' => ['type' => 'INT', 'unsigned' => true],
            'outlet_id' => ['type' => 'INT', 'unsigned' => true],
            'expense_date' => ['type' => 'DATE'],
            'category' => ['type' => 'VARCHAR', 'constraint' => 80],
            'name' => ['type' => 'VARCHAR', 'constraint' => 160],
            'amount' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0],
            'payment_method' => ['type' => 'VARCHAR', 'constraint' => 80, 'null' => true],
            'vendor' => ['type' => 'VARCHAR', 'constraint' => 120, 'null' => true],
            'reference_no' => ['type' => 'VARCHAR', 'constraint' => 120, 'null' => true],
            'notes' => ['type' => 'TEXT', 'null' => true],
            'status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'posted'],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
            'deleted_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['company_id', 'outlet_id', 'expense_date'], false, false, 'idx_operating_expenses_period');
        $this->forge->createTable('operating_expenses');
    }

    public function down(): void
    {
        $this->forge->dropTable('operating_expenses', true);
    }
}
