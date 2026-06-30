<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddRoleResponsibility extends Migration
{
    public function up(): void
    {
        if (! $this->db->fieldExists('responsibility', 'roles')) {
            $this->forge->addColumn('roles', [
                'responsibility' => [
                    'type' => 'TEXT',
                    'null' => true,
                    'after' => 'scope',
                ],
            ]);
        }
    }

    public function down(): void
    {
        if ($this->db->fieldExists('responsibility', 'roles')) {
            $this->forge->dropColumn('roles', 'responsibility');
        }
    }
}
