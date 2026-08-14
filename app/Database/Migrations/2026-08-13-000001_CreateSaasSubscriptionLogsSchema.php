<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateSaasSubscriptionLogsSchema extends Migration
{
    public function up(): void
    {
        if (! $this->db->tableExists('saas_subscription_logs')) {
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
                ],
                'company_name' => [
                    'type' => 'VARCHAR',
                    'constraint' => 150,
                ],
                'action_type' => [
                    'type' => 'VARCHAR',
                    'constraint' => 50,
                    'default' => 'RENEWAL',
                ],
                'from_plan_code' => [
                    'type' => 'VARCHAR',
                    'constraint' => 50,
                    'null' => true,
                ],
                'from_plan_name' => [
                    'type' => 'VARCHAR',
                    'constraint' => 100,
                    'null' => true,
                ],
                'to_plan_code' => [
                    'type' => 'VARCHAR',
                    'constraint' => 50,
                ],
                'to_plan_name' => [
                    'type' => 'VARCHAR',
                    'constraint' => 100,
                ],
                'price_paid' => [
                    'type' => 'DECIMAL',
                    'constraint' => '12,2',
                    'default' => 0.00,
                ],
                'duration_days' => [
                    'type' => 'INT',
                    'constraint' => 11,
                    'default' => 365,
                ],
                'max_outlets' => [
                    'type' => 'INT',
                    'constraint' => 11,
                    'default' => 5,
                ],
                'has_ai_biometrics' => [
                    'type' => 'TINYINT',
                    'constraint' => 1,
                    'default' => 1,
                ],
                'prev_expires_at' => [
                    'type' => 'VARCHAR',
                    'constraint' => 50,
                    'null' => true,
                ],
                'new_expires_at' => [
                    'type' => 'VARCHAR',
                    'constraint' => 50,
                    'null' => true,
                ],
                'payment_method' => [
                    'type' => 'VARCHAR',
                    'constraint' => 50,
                    'default' => 'BANK_TRANSFER',
                ],
                'payment_proof_path' => [
                    'type' => 'VARCHAR',
                    'constraint' => 255,
                    'null' => true,
                ],
                'notes' => [
                    'type' => 'TEXT',
                    'null' => true,
                ],
                'created_by_user_id' => [
                    'type' => 'INT',
                    'constraint' => 11,
                    'null' => true,
                ],
                'created_by_name' => [
                    'type' => 'VARCHAR',
                    'constraint' => 100,
                    'null' => true,
                ],
                'created_at' => [
                    'type' => 'DATETIME',
                    'null' => true,
                ],
            ]);
            $this->forge->addKey('id', true);
            $this->forge->addKey('company_id');
            $this->forge->addKey('action_type');
            $this->forge->createTable('saas_subscription_logs');
        }
    }

    public function down(): void
    {
        if ($this->db->tableExists('saas_subscription_logs')) {
            $this->forge->dropTable('saas_subscription_logs', true);
        }
    }
}
