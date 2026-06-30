<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class BackfillDefaultOutletSettings extends Migration
{
    public function up(): void
    {
        if (! $this->db->tableExists('outlets') || ! $this->db->tableExists('app_settings')) {
            return;
        }

        $now = date('Y-m-d H:i:s');
        $outlets = $this->db->table('outlets')->select('id, company_id')->get()->getResultArray();
        foreach ($outlets as $outlet) {
            $defaults = [
                'costing_method' => 'average',
                'table_service_mode' => 'free_seating_pay_first',
            ];
            foreach ($defaults as $key => $value) {
                $exists = $this->db->table('app_settings')
                    ->where('company_id', (int) $outlet['company_id'])
                    ->where('outlet_id', (int) $outlet['id'])
                    ->where('setting_key', $key)
                    ->get()
                    ->getRowArray();
                if (! $exists) {
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
    }

    public function down(): void
    {
        // Defaults may have been edited after migration; keep outlet configuration intact.
    }
}
