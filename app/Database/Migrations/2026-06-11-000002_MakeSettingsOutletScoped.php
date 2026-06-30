<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class MakeSettingsOutletScoped extends Migration
{
    public function up(): void
    {
        if (! $this->db->fieldExists('outlet_id', 'payment_methods')) {
            $this->forge->addColumn('payment_methods', [
                'outlet_id' => [
                    'type' => 'INT',
                    'unsigned' => true,
                    'null' => true,
                    'after' => 'company_id',
                ],
            ]);
        }

        $now = date('Y-m-d H:i:s');
        $this->db->table('payment_methods')
            ->groupStart()
            ->where('outlet_id', null)
            ->orWhere('outlet_id', 0)
            ->groupEnd()
            ->update(['outlet_id' => 1, 'updated_at' => $now]);

        $this->db->table('packaging_rules')
            ->groupStart()
            ->where('outlet_id', null)
            ->orWhere('outlet_id', 0)
            ->groupEnd()
            ->update(['outlet_id' => 1, 'updated_at' => $now]);
    }

    public function down(): void
    {
        if ($this->db->fieldExists('outlet_id', 'payment_methods')) {
            $this->forge->dropColumn('payment_methods', 'outlet_id');
        }
    }
}
