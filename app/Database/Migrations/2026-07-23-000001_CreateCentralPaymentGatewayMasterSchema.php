<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateCentralPaymentGatewayMasterSchema extends Migration
{
    public function up(): void
    {
        if (! $this->db->tableExists('payment_gateways')) {
            $this->forge->addField([
                'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
                'provider' => ['type' => 'VARCHAR', 'constraint' => 32], // xendit / midtrans
                'status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'active'], // active / inactive
                'qris_rate' => ['type' => 'DECIMAL', 'constraint' => '5,2', 'default' => '0.70'],
                'card_rate' => ['type' => 'DECIMAL', 'constraint' => '5,2', 'default' => '2.00'],
                'va_fee' => ['type' => 'DECIMAL', 'constraint' => '10,2', 'default' => '4000.00'],
                'ewallet_rate' => ['type' => 'DECIMAL', 'constraint' => '5,2', 'default' => '1.50'],
                'created_at' => ['type' => 'DATETIME', 'null' => true],
                'updated_at' => ['type' => 'DATETIME', 'null' => true],
            ]);
            $this->forge->addKey('id', true);
            $this->forge->addUniqueKey('provider');
            $this->forge->createTable('payment_gateways');
        }

        // Seed default central rates for Xendit & Midtrans if missing
        $defaults = [
            [
                'provider' => 'xendit',
                'status' => 'active',
                'qris_rate' => 0.70,
                'card_rate' => 2.00,
                'va_fee' => 4500.00,
                'ewallet_rate' => 1.50,
                'created_at' => date('Y-m-d H:i:s'),
                'updated_at' => date('Y-m-d H:i:s'),
            ],
            [
                'provider' => 'midtrans',
                'status' => 'active',
                'qris_rate' => 0.70,
                'card_rate' => 1.90,
                'va_fee' => 4000.00,
                'ewallet_rate' => 1.70,
                'created_at' => date('Y-m-d H:i:s'),
                'updated_at' => date('Y-m-d H:i:s'),
            ],
        ];

        foreach ($defaults as $row) {
            $existing = $this->db->table('payment_gateways')->where('provider', $row['provider'])->get()->getRowArray();
            if (! $existing) {
                $this->db->table('payment_gateways')->insert($row);
            }
        }
    }

    public function down(): void
    {
        $this->forge->dropTable('payment_gateways', true);
    }
}
