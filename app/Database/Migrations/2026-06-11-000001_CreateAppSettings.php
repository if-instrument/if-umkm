<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateAppSettings extends Migration
{
    public function up(): void
    {
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'company_id' => ['type' => 'INT', 'unsigned' => true],
            'outlet_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'setting_key' => ['type' => 'VARCHAR', 'constraint' => 120],
            'setting_value' => ['type' => 'TEXT', 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
            'deleted_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['company_id', 'outlet_id', 'setting_key']);
        $this->forge->createTable('app_settings');
    }

    public function down(): void
    {
        $this->forge->dropTable('app_settings', true);
    }
}
