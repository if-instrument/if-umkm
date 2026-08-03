<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateSaasPlansSchema extends Migration
{
    public function up(): void
    {
        if (! $this->db->tableExists('saas_plans')) {
            $this->forge->addField([
                'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
                'code' => ['type' => 'VARCHAR', 'constraint' => 64],
                'name' => ['type' => 'VARCHAR', 'constraint' => 160],
                'max_outlets' => ['type' => 'INT', 'unsigned' => true, 'default' => 5],
                'duration_days' => ['type' => 'INT', 'unsigned' => true, 'default' => 365],
                'description' => ['type' => 'TEXT', 'null' => true],
                'is_featured' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 0],
                'status' => ['type' => 'VARCHAR', 'constraint' => 2, 'default' => '10'],
                'created_at' => ['type' => 'DATETIME', 'null' => true],
                'updated_at' => ['type' => 'DATETIME', 'null' => true],
                'deleted_at' => ['type' => 'DATETIME', 'null' => true],
            ]);
            $this->forge->addKey('id', true);
            $this->forge->addUniqueKey('code');
            $this->forge->createTable('saas_plans');

            $this->db->table('saas_plans')->insertBatch([
                ['code' => 'Starter', 'name' => 'Starter Plan', 'max_outlets' => 3, 'duration_days' => 90, 'description' => 'Masa aktif langganan standar 90 hari dengan batas 3 outlet.', 'is_featured' => 0, 'status' => '10', 'created_at' => date('Y-m-d H:i:s')],
                ['code' => 'Professional', 'name' => 'Professional Plan', 'max_outlets' => 10, 'duration_days' => 365, 'description' => 'Lisensi penuh 1 tahun, multi-outlet, CRM, & payment gateway.', 'is_featured' => 1, 'status' => '10', 'created_at' => date('Y-m-d H:i:s')],
                ['code' => 'Enterprise', 'name' => 'Enterprise Plan', 'max_outlets' => 999, 'duration_days' => 0, 'description' => 'Akses unlimited outlet, masa aktif tidak terbatas & dedicated DB.', 'is_featured' => 0, 'status' => '10', 'created_at' => date('Y-m-d H:i:s')],
            ]);
        }
    }

    public function down(): void
    {
        $this->forge->dropTable('saas_plans', true);
    }
}
