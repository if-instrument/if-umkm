<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddPaymentGatewayProviderToMethods extends Migration
{
    public function up(): void
    {
        if (! $this->db->tableExists('payment_methods')) {
            return;
        }

        $fields = $this->db->getFieldNames('payment_methods');
        $add = [];
        if (! in_array('gateway_provider', $fields, true)) {
            $add['gateway_provider'] = ['type' => 'VARCHAR', 'constraint' => 40, 'default' => 'manual', 'after' => 'type'];
        }
        if (! in_array('channel_code', $fields, true)) {
            $add['channel_code'] = ['type' => 'VARCHAR', 'constraint' => 80, 'null' => true, 'after' => 'gateway_provider'];
        }
        if (! in_array('terminal_id', $fields, true)) {
            $add['terminal_id'] = ['type' => 'VARCHAR', 'constraint' => 80, 'null' => true, 'after' => 'channel_code'];
        }
        if (! in_array('use_sandbox', $fields, true)) {
            $add['use_sandbox'] = ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1, 'after' => 'terminal_id'];
        }
        if ($add) {
            $this->forge->addColumn('payment_methods', $add);
        }

        $this->db->table('payment_methods')->where('type', 'qris')->update(['gateway_provider' => 'xendit', 'channel_code' => 'QRIS']);
        $this->db->table('payment_methods')->where('type', 'card')->update(['gateway_provider' => 'midtrans', 'channel_code' => 'EDC']);
        $this->db->table('payment_methods')->where('type', 'cash')->update(['gateway_provider' => 'manual']);
    }

    public function down(): void
    {
        if (! $this->db->tableExists('payment_methods')) {
            return;
        }
        $fields = $this->db->getFieldNames('payment_methods');
        foreach (['use_sandbox', 'terminal_id', 'channel_code', 'gateway_provider'] as $field) {
            if (in_array($field, $fields, true)) {
                $this->forge->dropColumn('payment_methods', $field);
            }
        }
    }
}
