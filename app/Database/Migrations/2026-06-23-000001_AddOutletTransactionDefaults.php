<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddOutletTransactionDefaults extends Migration
{
    public function up()
    {
        if (! $this->db->tableExists('outlets') || ! $this->db->tableExists('app_settings')) {
            return;
        }

        $defaults = [
            'tax_rate' => '0',
            'dine_in_service_rate' => '0',
            'printer_name' => '',
            'order_channel_dine_in' => '0',
            'order_channel_take_away' => '1',
            'order_channel_delivery' => '0',
        ];
        $now = date('Y-m-d H:i:s');
        $outlets = $this->db->table('outlets')->select('id, company_id')->get()->getResultArray();

        foreach ($outlets as $outlet) {
            foreach ($defaults as $key => $value) {
                $exists = $this->db->table('app_settings')
                    ->where('company_id', (int) $outlet['company_id'])
                    ->where('outlet_id', (int) $outlet['id'])
                    ->where('setting_key', $key)
                    ->get()
                    ->getRowArray();

                if ($exists) {
                    continue;
                }

                $this->db->table('app_settings')->insert([
                    'company_id' => (int) $outlet['company_id'],
                    'outlet_id' => (int) $outlet['id'],
                    'setting_key' => $key,
                    'setting_value' => $value,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }

    public function down()
    {
        // Do not remove outlet settings that may already be edited by users.
    }
}
