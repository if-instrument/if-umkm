<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateCentralSaasSchema extends Migration
{
    public function up(): void
    {
        $this->createCompanies();
        $this->createUsers();
        $this->createUserInvitations();
    }

    public function down(): void
    {
        $this->forge->dropTable('user_invitations', true);
        $this->forge->dropTable('users', true);
        $this->forge->dropTable('companies', true);
    }

    private function timestamps(): array
    {
        return [
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
            'deleted_at' => ['type' => 'DATETIME', 'null' => true],
        ];
    }

    private function createCompanies(): void
    {
        if (! $this->db->tableExists('companies')) {
            $this->forge->addField([
                'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
                'name' => ['type' => 'VARCHAR', 'constraint' => 160],
                'brand_name' => ['type' => 'VARCHAR', 'constraint' => 160],
                'route_slug' => ['type' => 'VARCHAR', 'constraint' => 120, 'null' => true],
                'tagline' => ['type' => 'VARCHAR', 'constraint' => 160, 'null' => true],
                'logo_path' => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
                'theme_color' => ['type' => 'VARCHAR', 'constraint' => 32, 'default' => '#6e3a16'],
                'db_mode' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'dedicated'],
                'db_host' => ['type' => 'VARCHAR', 'constraint' => 120, 'null' => true],
                'db_name' => ['type' => 'VARCHAR', 'constraint' => 120, 'null' => true],
                'db_username' => ['type' => 'VARCHAR', 'constraint' => 120, 'null' => true],
                'db_password' => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
                'db_port' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
                'status' => ['type' => 'VARCHAR', 'constraint' => 2, 'default' => '10'],
            ] + $this->timestamps());
            $this->forge->addKey('id', true);
            $this->forge->addUniqueKey('route_slug');
            $this->forge->createTable('companies');
            return;
        }

        $this->ensureColumns('companies', [
            'brand_name' => ['type' => 'VARCHAR', 'constraint' => 160, 'null' => true],
            'route_slug' => ['type' => 'VARCHAR', 'constraint' => 120, 'null' => true],
            'tagline' => ['type' => 'VARCHAR', 'constraint' => 160, 'null' => true],
            'logo_path' => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'theme_color' => ['type' => 'VARCHAR', 'constraint' => 32, 'default' => '#6e3a16'],
            'db_mode' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'dedicated'],
            'db_host' => ['type' => 'VARCHAR', 'constraint' => 120, 'null' => true],
            'db_name' => ['type' => 'VARCHAR', 'constraint' => 120, 'null' => true],
            'db_username' => ['type' => 'VARCHAR', 'constraint' => 120, 'null' => true],
            'db_password' => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'db_port' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'status' => ['type' => 'VARCHAR', 'constraint' => 2, 'default' => '10'],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
            'deleted_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
    }

    private function createUsers(): void
    {
        if ($this->db->tableExists('users')) {
            $this->ensureColumns('users', [
                'company_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
                'name' => ['type' => 'VARCHAR', 'constraint' => 160],
                'email' => ['type' => 'VARCHAR', 'constraint' => 160],
                'password_hash' => ['type' => 'VARCHAR', 'constraint' => 255],
                'type' => ['type' => 'VARCHAR', 'constraint' => 32, 'default' => 'company_user'],
                'status' => ['type' => 'VARCHAR', 'constraint' => 2, 'default' => '10'],
                'created_at' => ['type' => 'DATETIME', 'null' => true],
                'updated_at' => ['type' => 'DATETIME', 'null' => true],
                'deleted_at' => ['type' => 'DATETIME', 'null' => true],
            ]);
            return;
        }

        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'company_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'name' => ['type' => 'VARCHAR', 'constraint' => 160],
            'email' => ['type' => 'VARCHAR', 'constraint' => 160],
            'password_hash' => ['type' => 'VARCHAR', 'constraint' => 255],
            'type' => ['type' => 'VARCHAR', 'constraint' => 32, 'default' => 'company_user'],
            'status' => ['type' => 'VARCHAR', 'constraint' => 2, 'default' => '10'],
        ] + $this->timestamps());
        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('email');
        $this->forge->createTable('users');
    }

    private function createUserInvitations(): void
    {
        if ($this->db->tableExists('user_invitations')) {
            $this->ensureColumns('user_invitations', [
                'company_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
                'user_id' => ['type' => 'INT', 'unsigned' => true],
                'email' => ['type' => 'VARCHAR', 'constraint' => 160],
                'token_hash' => ['type' => 'CHAR', 'constraint' => 64],
                'expires_at' => ['type' => 'DATETIME'],
                'accepted_at' => ['type' => 'DATETIME', 'null' => true],
                'sent_at' => ['type' => 'DATETIME', 'null' => true],
                'status' => ['type' => 'VARCHAR', 'constraint' => 2, 'default' => '00'],
                'created_at' => ['type' => 'DATETIME', 'null' => true],
                'updated_at' => ['type' => 'DATETIME', 'null' => true],
                'deleted_at' => ['type' => 'DATETIME', 'null' => true],
            ]);
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
            'status' => ['type' => 'VARCHAR', 'constraint' => 2, 'default' => '00'],
        ] + $this->timestamps());
        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('token_hash');
        $this->forge->addKey(['user_id', 'status']);
        $this->forge->createTable('user_invitations');
    }

    private function ensureColumns(string $table, array $columns): void
    {
        $existing = $this->db->getFieldNames($table);
        $missing = [];
        foreach ($columns as $name => $definition) {
            if (! in_array($name, $existing, true)) {
                $missing[$name] = $definition;
            }
        }

        if ($missing !== []) {
            $this->forge->addColumn($table, $missing);
        }
    }
}
