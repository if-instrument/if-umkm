<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddRegistrationTypeToCompanies extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('companies')) {
            $existing = $this->db->getFieldNames('companies');
            if (! in_array('registration_type', $existing, true)) {
                $this->forge->addColumn('companies', [
                    'registration_type' => [
                        'type' => 'VARCHAR',
                        'constraint' => 50,
                        'default' => 'SUPER_ADMIN',
                        'after' => 'tenant_status',
                    ],
                ]);
            }

            // Seed/sync default company registration types
            $this->db->table('companies')
                ->where('id', 1)
                ->orLike('route_slug', 'ifresso')
                ->update([
                    'registration_type' => 'SUPER_ADMIN',
                    'status' => '10',
                    'tenant_status' => 'CREATED',
                ]);

            $this->db->table('companies')
                ->where('id', 4)
                ->orLike('route_slug', 'kappi')
                ->update([
                    'registration_type' => 'PUBLIC_REGISTRATION',
                    'status' => '00',
                    'tenant_status' => 'NOT_CREATED',
                    'payment_status' => '00',
                ]);
        }
    }

    public function down(): void
    {
        if ($this->db->tableExists('companies')) {
            $existing = $this->db->getFieldNames('companies');
            if (in_array('registration_type', $existing, true)) {
                $this->forge->dropColumn('companies', 'registration_type');
            }
        }
    }
}
