<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddAiBiometricsToSaasPlansAndCompanies extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('saas_plans')) {
            $existing = $this->db->getFieldNames('saas_plans');
            if (! in_array('has_ai_biometrics', $existing, true)) {
                $this->forge->addColumn('saas_plans', [
                    'has_ai_biometrics' => [
                        'type' => 'TINYINT',
                        'constraint' => 1,
                        'default' => 1,
                        'after' => 'is_featured',
                    ],
                ]);

                // Update default Starter plan to have no AI biometrics (0)
                $this->db->table('saas_plans')
                    ->where('code', 'Starter')
                    ->update(['has_ai_biometrics' => 0]);

                // Ensure Professional & Enterprise have AI biometrics (1)
                $this->db->table('saas_plans')
                    ->whereIn('code', ['Professional', 'Enterprise'])
                    ->update(['has_ai_biometrics' => 1]);
            }
        }

        if ($this->db->tableExists('companies')) {
            $existing = $this->db->getFieldNames('companies');
            $fields = [];
            if (! in_array('ai_enable_face_login', $existing, true)) {
                $fields['ai_enable_face_login'] = [
                    'type' => 'TINYINT',
                    'constraint' => 1,
                    'null' => true,
                ];
            }
            if (! in_array('ai_enable_fingerprint', $existing, true)) {
                $fields['ai_enable_fingerprint'] = [
                    'type' => 'TINYINT',
                    'constraint' => 1,
                    'null' => true,
                ];
            }
            if ($fields !== []) {
                $this->forge->addColumn('companies', $fields);
            }
        }
    }

    public function down(): void
    {
        if ($this->db->tableExists('saas_plans')) {
            $existing = $this->db->getFieldNames('saas_plans');
            if (in_array('has_ai_biometrics', $existing, true)) {
                $this->forge->dropColumn('saas_plans', 'has_ai_biometrics');
            }
        }

        if ($this->db->tableExists('companies')) {
            $existing = $this->db->getFieldNames('companies');
            $drop = array_intersect(['ai_enable_face_login', 'ai_enable_fingerprint'], $existing);
            if ($drop !== []) {
                $this->forge->dropColumn('companies', $drop);
            }
        }
    }
}
