<?php

namespace App\Database\TenantMigrations;

use CodeIgniter\Database\Migration;

class AddSubscriptionFieldsToTenantCompanies extends Migration
{
    public function up()
    {
        if (! $this->db->tableExists('companies')) {
            return;
        }

        $existing = $this->db->getFieldNames('companies');
        $fields = [];

        if (! in_array('payment_proof_path', $existing, true)) {
            $fields['payment_proof_path'] = ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true];
        }
        if (! in_array('payment_status', $existing, true)) {
            $fields['payment_status'] = ['type' => 'VARCHAR', 'constraint' => 32, 'default' => '00'];
        }
        if (! in_array('payment_notes', $existing, true)) {
            $fields['payment_notes'] = ['type' => 'TEXT', 'null' => true];
        }
        if (! in_array('tenant_status', $existing, true)) {
            $fields['tenant_status'] = ['type' => 'VARCHAR', 'constraint' => 32, 'default' => 'NOT_CREATED'];
        }
        if (! in_array('registration_type', $existing, true)) {
            $fields['registration_type'] = ['type' => 'VARCHAR', 'constraint' => 50, 'default' => 'SUPER_ADMIN'];
        }
        if (! in_array('subscription_plan', $existing, true)) {
            $fields['subscription_plan'] = ['type' => 'VARCHAR', 'constraint' => 64, 'default' => 'Professional'];
        }
        if (! in_array('expires_at', $existing, true)) {
            $fields['expires_at'] = ['type' => 'DATE', 'null' => true];
        }
        if (! in_array('max_outlets', $existing, true)) {
            $fields['max_outlets'] = ['type' => 'INT', 'unsigned' => true, 'default' => 5];
        }
        if (! in_array('ai_enable_face_login', $existing, true)) {
            $fields['ai_enable_face_login'] = ['type' => 'TINYINT', 'constraint' => 1, 'null' => true, 'default' => 1];
        }
        if (! in_array('ai_enable_fingerprint', $existing, true)) {
            $fields['ai_enable_fingerprint'] = ['type' => 'TINYINT', 'constraint' => 1, 'null' => true, 'default' => 1];
        }

        if (! empty($fields)) {
            $this->forge->addColumn('companies', $fields);
        }
    }

    public function down()
    {
        if (! $this->db->tableExists('companies')) {
            return;
        }

        $existing = $this->db->getFieldNames('companies');
        $drop = array_intersect([
            'payment_proof_path', 'payment_status', 'payment_notes',
            'tenant_status', 'registration_type', 'subscription_plan',
            'expires_at', 'max_outlets', 'ai_enable_face_login', 'ai_enable_fingerprint'
        ], $existing);

        if (! empty($drop)) {
            $this->forge->dropColumn('companies', array_values($drop));
        }
    }
}
