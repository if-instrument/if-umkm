<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class DropRecipeIngredientOutletLink extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('product_recipe_items') && $this->db->fieldExists('outlet_ingredient_id', 'product_recipe_items')) {
            $this->forge->dropColumn('product_recipe_items', 'outlet_ingredient_id');
        }
    }

    public function down(): void
    {
        if ($this->db->tableExists('product_recipe_items') && ! $this->db->fieldExists('outlet_ingredient_id', 'product_recipe_items')) {
            $this->forge->addColumn('product_recipe_items', [
                'outlet_ingredient_id' => [
                    'type' => 'INT',
                    'unsigned' => true,
                    'null' => true,
                    'after' => 'template_id',
                ],
            ]);
        }
    }
}
