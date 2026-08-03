<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddSubscriptionFieldsToCompanies extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('companies')) {
            $existing = $this->db->getFieldNames('companies');
            $fields = [];

            if (! in_array('subscription_plan', $existing, true)) {
                $fields['subscription_plan'] = ['type' => 'VARCHAR', 'constraint' => 64, 'default' => 'Professional'];
            }
            if (! in_array('expires_at', $existing, true)) {
                $fields['expires_at'] = ['type' => 'DATE', 'null' => true];
            }
            if (! in_array('max_outlets', $existing, true)) {
                $fields['max_outlets'] = ['type' => 'INT', 'unsigned' => true, 'default' => 5];
            }

            if ($fields !== []) {
                $this->forge->addColumn('companies', $fields);
            }
        }
    }

    public function down(): void
    {
        if ($this->db->tableExists('companies')) {
            $existing = $this->db->getFieldNames('companies');
            $drop = array_intersect(['subscription_plan', 'expires_at', 'max_outlets'], $existing);
            if ($drop !== []) {
                $this->forge->dropColumn('companies', $drop);
            }
        }
    }
}
