<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class UseNumericOrderStatusCodes extends Migration
{
    public function up()
    {
        if (! $this->db->tableExists('orders') || ! $this->db->fieldExists('status', 'orders')) {
            return;
        }

        $map = [
            'pending_cashier' => '00',
            'waiting' => '10',
            'preparing' => '20',
            'ready' => '30',
            'completed' => '90',
            'cancelled' => '99',
        ];

        foreach ($map as $old => $new) {
            $this->db->table('orders')->where('status', $old)->update(['status' => $new]);
        }

        $this->forge->modifyColumn('orders', [
            'status' => ['type' => 'VARCHAR', 'constraint' => 2, 'default' => '10'],
        ]);
    }

    public function down()
    {
        if (! $this->db->tableExists('orders') || ! $this->db->fieldExists('status', 'orders')) {
            return;
        }

        $map = [
            '00' => 'pending_cashier',
            '10' => 'waiting',
            '20' => 'preparing',
            '30' => 'ready',
            '90' => 'completed',
            '99' => 'cancelled',
        ];

        foreach ($map as $old => $new) {
            $this->db->table('orders')->where('status', $old)->update(['status' => $new]);
        }

        $this->forge->modifyColumn('orders', [
            'status' => ['type' => 'VARCHAR', 'constraint' => 32, 'default' => 'waiting'],
        ]);
    }
}
