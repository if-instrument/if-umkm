<?php

namespace App\Database\TenantMigrations;

use CodeIgniter\Database\Migration;

class AddProductPreorderSupport extends Migration
{
    public function up()
    {
        if (! $this->db->fieldExists('is_preorder', 'products')) {

            $this->forge->addColumn('products', [
                'is_preorder' => [
                    'type' => 'TINYINT',
                    'constraint' => 1,
                    'default' => 0,
                    'after' => 'status',
                ],
            ]);
        }

        if (! $this->db->fieldExists('preorder_note', 'products')) {

            $this->forge->addColumn('products', [
                'preorder_note' => [
                    'type' => 'VARCHAR',
                    'constraint' => 255,
                    'null' => true,
                    'after' => 'is_preorder',
                ],
            ]);
        }
    }

    public function down(): void
    {
        if ($this->db->fieldExists('preorder_note', 'products')) {
            $this->db->query("
                ALTER TABLE products
                DROP COLUMN preorder_note
            ");
        }

        if ($this->db->fieldExists('is_preorder', 'products')) {
            $this->db->query("
                ALTER TABLE products
                DROP COLUMN is_preorder
            ");
        }
    }
}