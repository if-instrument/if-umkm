<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddOrderPaymentProofAndTimeline extends Migration
{
    public function up()
    {
        if ($this->db->tableExists('orders')) {
            $fields = [];
            if (! $this->db->fieldExists('payment_proof_path', 'orders')) {
                $fields['payment_proof_path'] = ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true, 'after' => 'payment_reference'];
            }
            if (! $this->db->fieldExists('payment_proof_note', 'orders')) {
                $fields['payment_proof_note'] = ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true, 'after' => 'payment_proof_path'];
            }
            if ($fields) {
                $this->forge->addColumn('orders', $fields);
            }
        }

        if (! $this->db->tableExists('order_status_logs')) {
            $this->forge->addField([
                'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
                'company_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
                'outlet_id' => ['type' => 'INT', 'unsigned' => true],
                'order_id' => ['type' => 'INT', 'unsigned' => true],
                'status' => ['type' => 'VARCHAR', 'constraint' => 2],
                'payment_status' => ['type' => 'VARCHAR', 'constraint' => 2, 'null' => true],
                'actor_type' => ['type' => 'VARCHAR', 'constraint' => 32, 'default' => 'system'],
                'actor_name' => ['type' => 'VARCHAR', 'constraint' => 120, 'null' => true],
                'note' => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
                'created_at' => ['type' => 'DATETIME', 'null' => true],
                'updated_at' => ['type' => 'DATETIME', 'null' => true],
            ]);
            $this->forge->addKey('id', true);
            $this->forge->addKey(['outlet_id', 'order_id', 'created_at']);
            $this->forge->createTable('order_status_logs');
        }
    }

    public function down()
    {
        $this->forge->dropTable('order_status_logs', true);
        if ($this->db->tableExists('orders')) {
            foreach (['payment_proof_note', 'payment_proof_path'] as $field) {
                if ($this->db->fieldExists($field, 'orders')) {
                    $this->forge->dropColumn('orders', $field);
                }
            }
        }
    }
}
