<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddPaymentFeePolicy extends Migration
{
    public function up()
    {
        if ($this->db->tableExists('payment_methods') && ! $this->db->fieldExists('fee_payer', 'payment_methods')) {
            $this->forge->addColumn('payment_methods', [
                'fee_payer' => [
                    'type' => 'VARCHAR',
                    'constraint' => 24,
                    'default' => 'merchant',
                    'after' => 'fee_rate',
                ],
            ]);
        }

        if ($this->db->tableExists('orders')) {
            $fields = [];
            if (! $this->db->fieldExists('payment_fee', 'orders')) {
                $fields['payment_fee'] = [
                    'type' => 'DECIMAL',
                    'constraint' => '14,2',
                    'default' => 0,
                    'after' => 'packaging_fee',
                ];
            }
            if (! $this->db->fieldExists('payment_fee_payer', 'orders')) {
                $fields['payment_fee_payer'] = [
                    'type' => 'VARCHAR',
                    'constraint' => 24,
                    'default' => 'merchant',
                    'after' => 'payment_fee',
                ];
            }
            if ($fields) {
                $this->forge->addColumn('orders', $fields);
            }
        }
    }

    public function down()
    {
        if ($this->db->tableExists('orders')) {
            foreach (['payment_fee_payer', 'payment_fee'] as $field) {
                if ($this->db->fieldExists($field, 'orders')) {
                    $this->forge->dropColumn('orders', $field);
                }
            }
        }

        if ($this->db->tableExists('payment_methods') && $this->db->fieldExists('fee_payer', 'payment_methods')) {
            $this->forge->dropColumn('payment_methods', 'fee_payer');
        }
    }
}
