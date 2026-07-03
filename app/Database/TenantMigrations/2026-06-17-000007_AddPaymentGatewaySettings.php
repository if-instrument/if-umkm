<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddPaymentGatewaySettings extends Migration
{
    public function up(): void
    {
        if (! $this->db->tableExists('app_settings')) {
            return;
        }

        $rows = $this->db->table('outlets')->select('company_id, id AS outlet_id')->get()->getResultArray();
        foreach ($rows as $row) {
            $this->upsertSetting((int) $row['company_id'], (int) $row['outlet_id'], 'payment_gateway_provider', 'xendit');
            $this->upsertSetting((int) $row['company_id'], (int) $row['outlet_id'], 'payment_gateway_mode', 'sandbox');
            $this->upsertSetting((int) $row['company_id'], (int) $row['outlet_id'], 'payment_gateway_timeout', '15');
        }
    }

    public function down(): void
    {
        if (! $this->db->tableExists('app_settings')) {
            return;
        }
        $this->db->table('app_settings')
            ->whereIn('setting_key', ['payment_gateway_provider', 'payment_gateway_mode', 'payment_gateway_timeout', 'xendit_secret_key', 'midtrans_server_key'])
            ->delete();
    }

    private function upsertSetting(int $companyId, int $outletId, string $key, string $value): void
    {
        $existing = $this->db->table('app_settings')
            ->where('company_id', $companyId)
            ->where('outlet_id', $outletId)
            ->where('setting_key', $key)
            ->get()
            ->getRowArray();
        $payload = [
            'company_id' => $companyId,
            'outlet_id' => $outletId,
            'setting_key' => $key,
            'setting_value' => $value,
            'updated_at' => date('Y-m-d H:i:s'),
        ];
        if ($existing) {
            $this->db->table('app_settings')->where('id', $existing['id'])->update($payload);
        } else {
            $payload['created_at'] = date('Y-m-d H:i:s');
            $this->db->table('app_settings')->insert($payload);
        }
    }
}
