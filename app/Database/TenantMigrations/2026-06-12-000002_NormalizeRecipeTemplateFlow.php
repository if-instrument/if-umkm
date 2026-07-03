<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class NormalizeRecipeTemplateFlow extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('product_recipe_items') && $this->db->fieldExists('outlet_ingredient_id', 'product_recipe_items')) {
            $this->forge->modifyColumn('product_recipe_items', [
                'outlet_ingredient_id' => [
                    'name' => 'outlet_ingredient_id',
                    'type' => 'INT',
                    'unsigned' => true,
                    'null' => true,
                ],
            ]);

            $this->db->table('product_recipe_items')
                ->where('outlet_ingredient_id', 0)
                ->update(['outlet_ingredient_id' => null]);
        }
    }

    public function down(): void
    {
        if ($this->db->tableExists('product_recipe_items') && $this->db->fieldExists('outlet_ingredient_id', 'product_recipe_items')) {
            $this->db->table('product_recipe_items')
                ->where('outlet_ingredient_id', null)
                ->update(['outlet_ingredient_id' => 0]);

            $this->forge->modifyColumn('product_recipe_items', [
                'outlet_ingredient_id' => [
                    'name' => 'outlet_ingredient_id',
                    'type' => 'INT',
                    'unsigned' => true,
                    'null' => false,
                ],
            ]);
        }
    }
}
