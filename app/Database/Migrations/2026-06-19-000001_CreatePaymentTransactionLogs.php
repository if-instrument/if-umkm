<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreatePaymentTransactionLogs extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('payment_transaction_logs')) {
            return;
        }

        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'payment_transaction_id' => ['type' => 'INT', 'unsigned' => true],
            'company_id' => ['type' => 'INT', 'unsigned' => true],
            'outlet_id' => ['type' => 'INT', 'unsigned' => true],
            'direction' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'internal'],
            'action' => ['type' => 'VARCHAR', 'constraint' => 80],
            'target' => ['type' => 'VARCHAR', 'constraint' => 255],
            'http_method' => ['type' => 'VARCHAR', 'constraint' => 12, 'default' => 'POST'],
            'http_status' => ['type' => 'INT', 'null' => true],
            'status' => ['type' => 'VARCHAR', 'constraint' => 40, 'null' => true],
            'request_payload' => ['type' => 'JSON', 'null' => true],
            'response_payload' => ['type' => 'JSON', 'null' => true],
            'error_message' => ['type' => 'TEXT', 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
            'deleted_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['payment_transaction_id', 'created_at']);
        $this->forge->addKey(['company_id', 'outlet_id']);
        $this->forge->addForeignKey('payment_transaction_id', 'payment_transactions', 'id', 'CASCADE', 'CASCADE', 'fk_payment_logs_transaction');
        $this->forge->createTable('payment_transaction_logs');
    }

    public function down(): void
    {
        $this->forge->dropTable('payment_transaction_logs', true);
    }
}
