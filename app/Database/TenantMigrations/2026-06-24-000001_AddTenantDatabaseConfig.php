<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddTenantDatabaseConfig extends Migration
{
    public function up(): void
    {
        $fields = $this->db->getFieldNames('companies');
        $add = [];
        if (! in_array('db_mode', $fields, true)) {
            $add['db_mode'] = ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'dedicated', 'after' => 'theme_color'];
        }
        if (! in_array('db_host', $fields, true)) {
            $add['db_host'] = ['type' => 'VARCHAR', 'constraint' => 120, 'null' => true, 'after' => 'db_mode'];
        }
        if (! in_array('db_name', $fields, true)) {
            $add['db_name'] = ['type' => 'VARCHAR', 'constraint' => 120, 'null' => true, 'after' => 'db_host'];
        }
        if (! in_array('db_username', $fields, true)) {
            $add['db_username'] = ['type' => 'VARCHAR', 'constraint' => 120, 'null' => true, 'after' => 'db_name'];
        }
        if (! in_array('db_password', $fields, true)) {
            $add['db_password'] = ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true, 'after' => 'db_username'];
        }
        if (! in_array('db_port', $fields, true)) {
            $add['db_port'] = ['type' => 'INT', 'unsigned' => true, 'null' => true, 'after' => 'db_password'];
        }
        if ($add) {
            $this->forge->addColumn('companies', $add);
        }
    }

    public function down(): void
    {
        foreach (['db_port', 'db_password', 'db_username', 'db_name', 'db_host', 'db_mode'] as $field) {
            if (in_array($field, $this->db->getFieldNames('companies'), true)) {
                $this->forge->dropColumn('companies', $field);
            }
        }
    }
}
