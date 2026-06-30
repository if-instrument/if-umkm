<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class NormalizeCardPaymentMethods extends Migration
{
    public function up()
    {
        if (! $this->db->tableExists('payment_methods')) {
            return;
        }

        $fields = $this->db->getFieldNames('payment_methods');
        if (! in_array('gateway_provider', $fields, true) || ! in_array('channel_code', $fields, true)) {
            return;
        }

        $this->db->table('payment_methods')
            ->where('type', 'card')
            ->where('gateway_provider', 'midtrans')
            ->update([
                'gateway_provider' => 'manual',
                'channel_code' => 'BCA',
            ]);

        $this->db->table('payment_methods')
            ->where('type', 'card')
            ->where('gateway_provider', 'manual')
            ->whereIn('channel_code', ['EDC', ''])
            ->update(['channel_code' => 'BCA']);
    }

    public function down()
    {
        if (! $this->db->tableExists('payment_methods')) {
            return;
        }

        $fields = $this->db->getFieldNames('payment_methods');
        if (! in_array('gateway_provider', $fields, true) || ! in_array('channel_code', $fields, true)) {
            return;
        }

        $this->db->table('payment_methods')
            ->where('type', 'card')
            ->where('gateway_provider', 'manual')
            ->where('channel_code', 'BCA')
            ->update([
                'gateway_provider' => 'midtrans',
                'channel_code' => 'EDC',
            ]);
    }
}
