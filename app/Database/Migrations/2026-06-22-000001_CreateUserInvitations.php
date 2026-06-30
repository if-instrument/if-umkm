<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateUserInvitations extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('user_invitations')) {
            return;
        }

        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'company_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'user_id' => ['type' => 'INT', 'unsigned' => true],
            'email' => ['type' => 'VARCHAR', 'constraint' => 160],
            'token_hash' => ['type' => 'CHAR', 'constraint' => 64],
            'expires_at' => ['type' => 'DATETIME'],
            'accepted_at' => ['type' => 'DATETIME', 'null' => true],
            'sent_at' => ['type' => 'DATETIME', 'null' => true],
            'status' => ['type' => 'VARCHAR', 'constraint' => 32, 'default' => 'pending'],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
            'deleted_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('token_hash');
        $this->forge->addKey(['user_id', 'status']);
        $this->forge->createTable('user_invitations');
    }

    public function down(): void
    {
        $this->forge->dropTable('user_invitations', true);
    }
}
