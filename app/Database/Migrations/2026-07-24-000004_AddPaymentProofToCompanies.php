<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddPaymentProofToCompanies extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('companies')) {
            $existing = $this->db->getFieldNames('companies');
            $fields = [];

            if (! in_array('payment_proof_path', $existing, true)) {
                $fields['payment_proof_path'] = ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true, 'after' => 'logo_path'];
            }
            if (! in_array('payment_status', $existing, true)) {
                $fields['payment_status'] = ['type' => 'VARCHAR', 'constraint' => 32, 'default' => '00', 'after' => 'payment_proof_path'];
            }
            if (! in_array('payment_notes', $existing, true)) {
                $fields['payment_notes'] = ['type' => 'TEXT', 'null' => true, 'after' => 'payment_status'];
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
            $drop = array_intersect(['payment_proof_path', 'payment_status', 'payment_notes'], $existing);
            if ($drop !== []) {
                $this->forge->dropColumn('companies', $drop);
            }
        }
    }
}
