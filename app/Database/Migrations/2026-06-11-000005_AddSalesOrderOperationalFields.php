<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddSalesOrderOperationalFields extends Migration
{
    public function up()
    {
        $fields = [];
        if (! $this->db->fieldExists('payment_method', 'orders')) {
            $fields['payment_method'] = ['type' => 'VARCHAR', 'constraint' => 80, 'null' => true, 'after' => 'payment_status'];
        }
        if (! $this->db->fieldExists('paid_at', 'orders')) {
            $fields['paid_at'] = ['type' => 'DATETIME', 'null' => true, 'after' => 'payment_method'];
        }
        if (! $this->db->fieldExists('status_updated_at', 'orders')) {
            $fields['status_updated_at'] = ['type' => 'DATETIME', 'null' => true, 'after' => 'status'];
        }
        if (! $this->db->fieldExists('ready_item_keys', 'orders')) {
            $fields['ready_item_keys'] = ['type' => 'JSON', 'null' => true, 'after' => 'status_updated_at'];
        }
        if (! $this->db->fieldExists('table_flow', 'orders')) {
            $fields['table_flow'] = ['type' => 'VARCHAR', 'constraint' => 80, 'null' => true, 'after' => 'table_name'];
        }
        if (! $this->db->fieldExists('packaging_source', 'orders')) {
            $fields['packaging_source'] = ['type' => 'VARCHAR', 'constraint' => 40, 'null' => true, 'after' => 'gross_profit'];
        }
        if (! $this->db->fieldExists('packaging_note', 'orders')) {
            $fields['packaging_note'] = ['type' => 'TEXT', 'null' => true, 'after' => 'packaging_source'];
        }
        if (! $this->db->fieldExists('last_order_added_at', 'orders')) {
            $fields['last_order_added_at'] = ['type' => 'DATETIME', 'null' => true, 'after' => 'packaging_note'];
        }

        if ($fields) {
            $this->forge->addColumn('orders', $fields);
        }
    }

    public function down()
    {
        foreach (['last_order_added_at', 'packaging_note', 'packaging_source', 'table_flow', 'ready_item_keys', 'status_updated_at', 'paid_at', 'payment_method'] as $field) {
            if ($this->db->fieldExists($field, 'orders')) {
                $this->forge->dropColumn('orders', $field);
            }
        }
    }
}
