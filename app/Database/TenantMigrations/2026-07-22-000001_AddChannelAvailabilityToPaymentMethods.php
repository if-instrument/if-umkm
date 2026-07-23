<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddChannelAvailabilityToPaymentMethods extends Migration
{
    public function up(): void
    {
        if (! $this->db->tableExists('payment_methods')) {
            return;
        }

        if (! $this->db->fieldExists('is_available_pos', 'payment_methods')) {
            $this->forge->addColumn('payment_methods', [
                'is_available_pos' => [
                    'type' => 'TINYINT',
                    'constraint' => 1,
                    'default' => 1,
                    'after' => 'status',
                ],
            ]);
        }

        if (! $this->db->fieldExists('is_available_online', 'payment_methods')) {
            $this->forge->addColumn('payment_methods', [
                'is_available_online' => [
                    'type' => 'TINYINT',
                    'constraint' => 1,
                    'default' => 1,
                    'after' => 'is_available_pos',
                ],
            ]);
        }
    }

    public function down(): void
    {
        if (! $this->db->tableExists('payment_methods')) {
            return;
        }

        foreach (['is_available_online', 'is_available_pos'] as $field) {
            if ($this->db->fieldExists($field, 'payment_methods')) {
                $this->forge->dropColumn('payment_methods', $field);
            }
        }
    }
}
