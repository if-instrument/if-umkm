<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddStaticQrisPaymentFields extends Migration
{
    public function up(): void
    {
        if (! $this->db->fieldExists('qris_mode', 'payment_methods')) {
            $this->forge->addColumn('payment_methods', [
                'qris_mode' => [
                    'type' => 'VARCHAR',
                    'constraint' => 16,
                    'default' => 'online',
                    'after' => 'gateway_provider',
                ],
            ]);
        }
        if (! $this->db->fieldExists('qris_image_path', 'payment_methods')) {
            $this->forge->addColumn('payment_methods', [
                'qris_image_path' => [
                    'type' => 'VARCHAR',
                    'constraint' => 255,
                    'null' => true,
                    'after' => 'qris_mode',
                ],
            ]);
        }
    }

    public function down(): void
    {
        foreach (['qris_image_path', 'qris_mode'] as $field) {
            if ($this->db->fieldExists($field, 'payment_methods')) {
                $this->forge->dropColumn('payment_methods', $field);
            }
        }
    }
}
