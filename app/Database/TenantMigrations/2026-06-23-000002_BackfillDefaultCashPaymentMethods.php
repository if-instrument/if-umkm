<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class BackfillDefaultCashPaymentMethods extends Migration
{
    public function up()
    {
        if (! $this->db->tableExists('outlets') || ! $this->db->tableExists('payment_methods')) {
            return;
        }

        $now = date('Y-m-d H:i:s');
        $outlets = $this->db->table('outlets')->select('id, company_id')->get()->getResultArray();
        foreach ($outlets as $outlet) {
            $exists = $this->db->table('payment_methods')
                ->where('company_id', (int) $outlet['company_id'])
                ->where('outlet_id', (int) $outlet['id'])
                ->where('type', 'cash')
                ->get()
                ->getRowArray();
            if ($exists) {
                continue;
            }

            $this->db->table('payment_methods')->insert([
                'company_id' => (int) $outlet['company_id'],
                'outlet_id' => (int) $outlet['id'],
                'name' => 'Cash',
                'type' => 'cash',
                'gateway_provider' => 'manual',
                'channel_code' => 'CASH',
                'terminal_id' => '',
                'edc_mode' => 'manual',
                'merchant_id' => '',
                'terminal_serial' => '',
                'connector_status' => 'not_configured',
                'use_sandbox' => 1,
                'fee_rate' => 0,
                'fee_payer' => 'merchant',
                'account' => 'Kas Tunai',
                'sort_order' => 1,
                'status' => 'active',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down()
    {
        // Keep payment methods because outlets may already use them in transactions.
    }
}
