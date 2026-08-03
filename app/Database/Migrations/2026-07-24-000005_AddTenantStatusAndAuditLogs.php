<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddTenantStatusAndAuditLogs extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('companies')) {
            $existing = $this->db->getFieldNames('companies');
            if (! in_array('tenant_status', $existing, true)) {
                $this->forge->addColumn('companies', [
                    'tenant_status' => [
                        'type' => 'VARCHAR',
                        'constraint' => 32,
                        'default' => 'NOT_CREATED',
                        'after' => 'payment_notes',
                    ],
                ]);
            }
        }

        if (! $this->db->tableExists('audit_logs')) {
            $this->forge->addField([
                'id' => [
                    'type' => 'INT',
                    'constraint' => 11,
                    'unsigned' => true,
                    'auto_increment' => true,
                ],
                'company_id' => [
                    'type' => 'INT',
                    'constraint' => 11,
                    'unsigned' => true,
                    'null' => true,
                ],
                'user_id' => [
                    'type' => 'INT',
                    'constraint' => 11,
                    'unsigned' => true,
                    'null' => true,
                ],
                'action' => [
                    'type' => 'VARCHAR',
                    'constraint' => 100,
                ],
                'details' => [
                    'type' => 'TEXT',
                    'null' => true,
                ],
                'created_at' => [
                    'type' => 'DATETIME',
                    'null' => true,
                ],
            ]);
            $this->forge->addKey('id', true);
            $this->forge->createTable('audit_logs', true);
        }
    }

    public function down(): void
    {
        if ($this->db->tableExists('companies') && in_array('tenant_status', $this->db->getFieldNames('companies'), true)) {
            $this->forge->dropColumn('companies', 'tenant_status');
        }
        if ($this->db->tableExists('audit_logs')) {
            $this->forge->dropTable('audit_logs', true);
        }
    }
}
