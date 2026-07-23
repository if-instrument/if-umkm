<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddApiKeyToCentralPaymentGateways extends Migration
{
    public function up(): void
    {
        if (! $this->db->tableExists('payment_gateways')) {
            return;
        }

        if (! $this->db->fieldExists('api_key', 'payment_gateways')) {
            $this->forge->addColumn('payment_gateways', [
                'api_key' => [
                    'type' => 'VARCHAR',
                    'constraint' => 255,
                    'null' => true,
                    'after' => 'provider',
                ],
            ]);
        }
    }

    public function down(): void
    {
        if (! $this->db->tableExists('payment_gateways')) {
            return;
        }

        if ($this->db->fieldExists('api_key', 'payment_gateways')) {
            $this->forge->dropColumn('payment_gateways', 'api_key');
        }
    }
}
