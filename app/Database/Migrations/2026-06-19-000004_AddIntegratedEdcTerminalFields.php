<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddIntegratedEdcTerminalFields extends Migration
{
    public function up()
    {
        if (! $this->db->tableExists('payment_methods')) {
            return;
        }

        $fields = [];
        if (! $this->db->fieldExists('edc_mode', 'payment_methods')) {
            $fields['edc_mode'] = [
                'type' => 'VARCHAR',
                'constraint' => 32,
                'default' => 'manual',
                'after' => 'terminal_id',
            ];
        }
        if (! $this->db->fieldExists('merchant_id', 'payment_methods')) {
            $fields['merchant_id'] = [
                'type' => 'VARCHAR',
                'constraint' => 120,
                'null' => true,
                'after' => 'edc_mode',
            ];
        }
        if (! $this->db->fieldExists('terminal_serial', 'payment_methods')) {
            $fields['terminal_serial'] = [
                'type' => 'VARCHAR',
                'constraint' => 120,
                'null' => true,
                'after' => 'merchant_id',
            ];
        }
        if (! $this->db->fieldExists('connector_status', 'payment_methods')) {
            $fields['connector_status'] = [
                'type' => 'VARCHAR',
                'constraint' => 32,
                'default' => 'not_configured',
                'after' => 'terminal_serial',
            ];
        }

        if ($fields) {
            $this->forge->addColumn('payment_methods', $fields);
        }
    }

    public function down()
    {
        if (! $this->db->tableExists('payment_methods')) {
            return;
        }
        foreach (['connector_status', 'terminal_serial', 'merchant_id', 'edc_mode'] as $field) {
            if ($this->db->fieldExists($field, 'payment_methods')) {
                $this->forge->dropColumn('payment_methods', $field);
            }
        }
    }
}
