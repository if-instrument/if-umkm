<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddPriceToSaasPlans extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('saas_plans')) {
            $existing = $this->db->getFieldNames('saas_plans');
            if (! in_array('price', $existing, true)) {
                $this->forge->addColumn('saas_plans', [
                    'price' => ['type' => 'DECIMAL', 'constraint' => '14,2', 'default' => 0.00, 'after' => 'max_outlets'],
                ]);
            }
        }
    }

    public function down(): void
    {
        if ($this->db->tableExists('saas_plans')) {
            $existing = $this->db->getFieldNames('saas_plans');
            if (in_array('price', $existing, true)) {
                $this->forge->dropColumn('saas_plans', 'price');
            }
        }
    }
}
