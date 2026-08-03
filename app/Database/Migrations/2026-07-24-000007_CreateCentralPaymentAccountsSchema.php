<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateCentralPaymentAccountsSchema extends Migration
{
    public function up(): void
    {
        if (! $this->db->tableExists('central_payment_accounts')) {
            $this->forge->addField([
                'id' => [
                    'type' => 'INT',
                    'constraint' => 11,
                    'unsigned' => true,
                    'auto_increment' => true,
                ],
                'bank_name' => [
                    'type' => 'VARCHAR',
                    'constraint' => 80,
                ],
                'account_number' => [
                    'type' => 'VARCHAR',
                    'constraint' => 80,
                ],
                'account_holder' => [
                    'type' => 'VARCHAR',
                    'constraint' => 160,
                ],
                'notes' => [
                    'type' => 'TEXT',
                    'null' => true,
                ],
                'status' => [
                    'type' => 'VARCHAR',
                    'constraint' => 2,
                    'default' => '10',
                ],
                'created_at' => [
                    'type' => 'DATETIME',
                    'null' => true,
                ],
                'updated_at' => [
                    'type' => 'DATETIME',
                    'null' => true,
                ],
            ]);
            $this->forge->addKey('id', true);
            $this->forge->createTable('central_payment_accounts');

            // Initial Seed
            $this->db->table('central_payment_accounts')->insertBatch([
                [
                    'bank_name' => 'Bank BCA',
                    'account_number' => '8830-192-881',
                    'account_holder' => 'PT IF Instrument SaaS',
                    'notes' => 'Transfer via ATM / Mobile Banking BCA.',
                    'status' => '10',
                    'created_at' => date('Y-m-d H:i:s'),
                    'updated_at' => date('Y-m-d H:i:s'),
                ],
                [
                    'bank_name' => 'Bank Mandiri',
                    'account_number' => '1400-019-288-100',
                    'account_holder' => 'PT IF Instrument SaaS',
                    'notes' => 'Transfer via Livin by Mandiri / ATM.',
                    'status' => '10',
                    'created_at' => date('Y-m-d H:i:s'),
                    'updated_at' => date('Y-m-d H:i:s'),
                ],
            ]);
        }
    }

    public function down(): void
    {
        if ($this->db->tableExists('central_payment_accounts')) {
            $this->forge->dropTable('central_payment_accounts', true);
        }
    }
}
