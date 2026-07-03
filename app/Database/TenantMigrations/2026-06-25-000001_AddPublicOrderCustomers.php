<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddPublicOrderCustomers extends Migration
{
    public function up()
    {
        if (! $this->db->tableExists('customer_members')) {
            $this->forge->addField([
                'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
                'company_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
                'outlet_id' => ['type' => 'INT', 'unsigned' => true],
                'name' => ['type' => 'VARCHAR', 'constraint' => 160],
                'email' => ['type' => 'VARCHAR', 'constraint' => 160],
                'phone' => ['type' => 'VARCHAR', 'constraint' => 40, 'null' => true],
                'status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'active'],
                'last_order_at' => ['type' => 'DATETIME', 'null' => true],
                'created_at' => ['type' => 'DATETIME', 'null' => true],
                'updated_at' => ['type' => 'DATETIME', 'null' => true],
                'deleted_at' => ['type' => 'DATETIME', 'null' => true],
            ]);
            $this->forge->addKey('id', true);
            $this->forge->addKey(['outlet_id', 'name']);
            $this->forge->addUniqueKey(['outlet_id', 'email']);
            $this->forge->createTable('customer_members');
        }

        if ($this->db->tableExists('orders')) {
            $fields = [];
            if (! $this->db->fieldExists('customer_email', 'orders')) {
                $fields['customer_email'] = ['type' => 'VARCHAR', 'constraint' => 160, 'null' => true, 'after' => 'customer_name'];
            }
            if (! $this->db->fieldExists('customer_phone', 'orders')) {
                $fields['customer_phone'] = ['type' => 'VARCHAR', 'constraint' => 40, 'null' => true, 'after' => 'customer_email'];
            }
            if (! $this->db->fieldExists('customer_member_id', 'orders')) {
                $fields['customer_member_id'] = ['type' => 'INT', 'unsigned' => true, 'null' => true, 'after' => 'customer_phone'];
            }
            if ($fields) {
                $this->forge->addColumn('orders', $fields);
            }
        }
    }

    public function down()
    {
        if ($this->db->tableExists('orders')) {
            foreach (['customer_member_id', 'customer_phone', 'customer_email'] as $field) {
                if ($this->db->fieldExists($field, 'orders')) {
                    $this->forge->dropColumn('orders', $field);
                }
            }
        }
        if ($this->db->tableExists('customer_members')) {
            $this->forge->dropTable('customer_members');
        }
    }
}
