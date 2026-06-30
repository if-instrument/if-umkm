<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddPosPaymentIntegration extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('orders')) {
            $fields = $this->db->getFieldNames('orders');
            $add = [];
            if (! in_array('cash_tendered', $fields, true)) {
                $add['cash_tendered'] = ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0, 'after' => 'payment_method'];
            }
            if (! in_array('change_due', $fields, true)) {
                $add['change_due'] = ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0, 'after' => 'cash_tendered'];
            }
            if (! in_array('payment_provider', $fields, true)) {
                $add['payment_provider'] = ['type' => 'VARCHAR', 'constraint' => 80, 'null' => true, 'after' => 'change_due'];
            }
            if (! in_array('payment_reference', $fields, true)) {
                $add['payment_reference'] = ['type' => 'VARCHAR', 'constraint' => 160, 'null' => true, 'after' => 'payment_provider'];
            }
            if ($add) {
                $this->forge->addColumn('orders', $add);
            }
        }

        if ($this->db->tableExists('payment_transactions')) {
            return;
        }

        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'company_id' => ['type' => 'INT', 'unsigned' => true],
            'outlet_id' => ['type' => 'INT', 'unsigned' => true],
            'order_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'order_no' => ['type' => 'VARCHAR', 'constraint' => 64],
            'payment_method_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'method_name' => ['type' => 'VARCHAR', 'constraint' => 100],
            'method_type' => ['type' => 'VARCHAR', 'constraint' => 32],
            'provider' => ['type' => 'VARCHAR', 'constraint' => 80, 'default' => 'offline_adapter'],
            'provider_reference' => ['type' => 'VARCHAR', 'constraint' => 160],
            'amount' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0],
            'fee_amount' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0],
            'status' => ['type' => 'VARCHAR', 'constraint' => 32, 'default' => 'pending'],
            'qr_payload' => ['type' => 'TEXT', 'null' => true],
            'edc_instruction' => ['type' => 'TEXT', 'null' => true],
            'request_payload' => ['type' => 'JSON', 'null' => true],
            'response_payload' => ['type' => 'JSON', 'null' => true],
            'paid_at' => ['type' => 'DATETIME', 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
            'deleted_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['company_id', 'outlet_id', 'status']);
        $this->forge->addKey('provider_reference');
        $this->forge->createTable('payment_transactions');
    }

    public function down(): void
    {
        $this->forge->dropTable('payment_transactions', true);
        if ($this->db->tableExists('orders')) {
            $fields = $this->db->getFieldNames('orders');
            foreach (['payment_reference', 'payment_provider', 'change_due', 'cash_tendered'] as $field) {
                if (in_array($field, $fields, true)) {
                    $this->forge->dropColumn('orders', $field);
                }
            }
        }
    }
}
