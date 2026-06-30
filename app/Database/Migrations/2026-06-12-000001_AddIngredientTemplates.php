<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddIngredientTemplates extends Migration
{
    public function up(): void
    {
        if (! $this->db->tableExists('ingredient_templates')) {
            $this->forge->addField([
                'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
                'company_id' => ['type' => 'INT', 'unsigned' => true],
                'code' => ['type' => 'VARCHAR', 'constraint' => 80],
                'name' => ['type' => 'VARCHAR', 'constraint' => 160],
                'category' => ['type' => 'VARCHAR', 'constraint' => 80, 'null' => true],
                'unit' => ['type' => 'VARCHAR', 'constraint' => 32],
                'status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'active'],
                'created_at' => ['type' => 'DATETIME', 'null' => true],
                'updated_at' => ['type' => 'DATETIME', 'null' => true],
                'deleted_at' => ['type' => 'DATETIME', 'null' => true],
            ]);
            $this->forge->addKey('id', true);
            $this->forge->addUniqueKey(['company_id', 'code']);
            $this->forge->createTable('ingredient_templates');
        }

        if (! $this->db->fieldExists('template_id', 'outlet_ingredients')) {
            $this->forge->addColumn('outlet_ingredients', [
                'template_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true, 'after' => 'outlet_id'],
            ]);
        }

        if (! $this->db->fieldExists('template_id', 'product_recipe_items')) {
            $this->forge->addColumn('product_recipe_items', [
                'template_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true, 'after' => 'product_id'],
            ]);
        }

        $this->backfillTemplates();
    }

    public function down(): void
    {
        if ($this->db->fieldExists('template_id', 'product_recipe_items')) {
            $this->forge->dropColumn('product_recipe_items', 'template_id');
        }
        if ($this->db->fieldExists('template_id', 'outlet_ingredients')) {
            $this->forge->dropColumn('outlet_ingredients', 'template_id');
        }
        $this->forge->dropTable('ingredient_templates', true);
    }

    private function backfillTemplates(): void
    {
        $now = date('Y-m-d H:i:s');
        $ingredients = $this->db->table('outlet_ingredients')->orderBy('id')->get()->getResultArray();
        $templateByIngredient = [];

        foreach ($ingredients as $ingredient) {
            $companyId = (int) $ingredient['company_id'];
            $code = $this->templateCode($ingredient);
            $template = $this->db->table('ingredient_templates')
                ->where('company_id', $companyId)
                ->where('code', $code)
                ->get()
                ->getRowArray();

            if (! $template) {
                $this->db->table('ingredient_templates')->insert([
                    'company_id' => $companyId,
                    'code' => $code,
                    'name' => $ingredient['name'],
                    'category' => $ingredient['category'],
                    'unit' => $ingredient['unit'],
                    'status' => 'active',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
                $templateId = (int) $this->db->insertID();
            } else {
                $templateId = (int) $template['id'];
            }

            $templateByIngredient[(int) $ingredient['id']] = $templateId;
            $this->db->table('outlet_ingredients')->where('id', $ingredient['id'])->update([
                'template_id' => $templateId,
                'updated_at' => $now,
            ]);
        }

        if (! $this->db->fieldExists('outlet_ingredient_id', 'product_recipe_items')) {
            return;
        }

        $recipes = $this->db->table('product_recipe_items')->get()->getResultArray();
        foreach ($recipes as $recipe) {
            $ingredientId = (int) ($recipe['outlet_ingredient_id'] ?? 0);
            if (! isset($templateByIngredient[$ingredientId])) {
                continue;
            }
            $this->db->table('product_recipe_items')->where('id', $recipe['id'])->update([
                'template_id' => $templateByIngredient[$ingredientId],
                'updated_at' => $now,
            ]);
        }
    }

    private function templateCode(array $ingredient): string
    {
        return match ($ingredient['sku'] ?? '') {
            'BEAN-001' => 'tpl-arabica',
            'MILK-001' => 'tpl-milk',
            'SYRUP-001' => 'tpl-syrup',
            'CUP-12' => 'tpl-cup12',
            'ICE-001' => 'tpl-ice',
            'CHOCO-001' => 'tpl-choco',
            'PACK-001' => 'tpl-pack-bag-1',
            'PACK-002' => 'tpl-pack-carrier-2',
            'PACK-004' => 'tpl-pack-carrier-4',
            default => 'tpl-' . strtolower(preg_replace('/[^A-Za-z0-9]+/', '-', trim((string) $ingredient['name']))),
        };
    }
}
