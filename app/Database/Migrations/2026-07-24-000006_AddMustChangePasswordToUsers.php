<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddMustChangePasswordToUsers extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('users')) {
            $existing = $this->db->getFieldNames('users');
            if (! in_array('must_change_password', $existing, true)) {
                $this->forge->addColumn('users', [
                    'must_change_password' => [
                        'type' => 'TINYINT',
                        'constraint' => 1,
                        'default' => 0,
                        'after' => 'status',
                    ],
                ]);
            }
        }
    }

    public function down(): void
    {
        if ($this->db->tableExists('users') && in_array('must_change_password', $this->db->getFieldNames('users'), true)) {
            $this->forge->dropColumn('users', 'must_change_password');
        }
    }
}
