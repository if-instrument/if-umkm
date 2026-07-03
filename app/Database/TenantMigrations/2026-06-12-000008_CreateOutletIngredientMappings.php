<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateOutletIngredientMappings extends Migration
{
    public function up(): void
    {
        if (! $this->db->tableExists('outlet_ingredient_mappings')) {
            $this->forge->addField([
                'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
                'company_id' => ['type' => 'INT', 'unsigned' => true],
                'outlet_id' => ['type' => 'INT', 'unsigned' => true],
                'template_id' => ['type' => 'INT', 'unsigned' => true],
                'outlet_ingredient_id' => ['type' => 'INT', 'unsigned' => true],
                'note' => ['type' => 'TEXT', 'null' => true],
                'status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'active'],
                'created_at' => ['type' => 'DATETIME', 'null' => true],
                'updated_at' => ['type' => 'DATETIME', 'null' => true],
                'deleted_at' => ['type' => 'DATETIME', 'null' => true],
            ]);
            $this->forge->addKey('id', true);
            $this->forge->addUniqueKey(['company_id', 'outlet_id', 'template_id'], 'uq_outlet_template_mapping');
            $this->forge->addKey(['outlet_ingredient_id', 'status'], false, false, 'idx_outlet_mapping_ingredient');
            $this->forge->createTable('outlet_ingredient_mappings');

            $this->addForeign('outlet_ingredient_mappings', 'fk_outlet_mappings_company', ['company_id'], 'companies', ['id']);
            $this->addForeign('outlet_ingredient_mappings', 'fk_outlet_mappings_outlet', ['outlet_id'], 'outlets', ['id']);
            $this->addForeign('outlet_ingredient_mappings', 'fk_outlet_mappings_template', ['template_id'], 'ingredient_templates', ['id']);
            $this->addForeign('outlet_ingredient_mappings', 'fk_outlet_mappings_ingredient', ['outlet_ingredient_id'], 'outlet_ingredients', ['id']);
        }

        $this->backfillFromIngredientTemplate();
    }

    public function down(): void
    {
        foreach (['fk_outlet_mappings_ingredient', 'fk_outlet_mappings_template', 'fk_outlet_mappings_outlet', 'fk_outlet_mappings_company'] as $constraint) {
            if ($this->foreignKeyExists($constraint)) {
                $this->db->query("ALTER TABLE `outlet_ingredient_mappings` DROP FOREIGN KEY `{$constraint}`");
            }
        }
        $this->forge->dropTable('outlet_ingredient_mappings', true);
    }

    private function backfillFromIngredientTemplate(): void
    {
        if (! $this->db->tableExists('outlet_ingredients')) return;
        $now = date('Y-m-d H:i:s');
        $rows = $this->db->table('outlet_ingredients')
            ->select('company_id, outlet_id, template_id, id outlet_ingredient_id')
            ->where('template_id IS NOT NULL')
            ->get()
            ->getResultArray();

        foreach ($rows as $row) {
            $exists = $this->db->table('outlet_ingredient_mappings')
                ->where('company_id', $row['company_id'])
                ->where('outlet_id', $row['outlet_id'])
                ->where('template_id', $row['template_id'])
                ->get()
                ->getRowArray();
            if ($exists) continue;

            $this->db->table('outlet_ingredient_mappings')->insert($row + [
                'note' => 'Migrasi dari mapping bahan lama',
                'status' => 'active',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    private function addForeign(string $table, string $name, array $columns, string $refTable, array $refColumns): void
    {
        if (! $this->db->tableExists($table) || ! $this->db->tableExists($refTable) || $this->foreignKeyExists($name)) return;
        $cols = implode('`,`', $columns);
        $refCols = implode('`,`', $refColumns);
        $this->db->query("ALTER TABLE `{$table}` ADD CONSTRAINT `{$name}` FOREIGN KEY (`{$cols}`) REFERENCES `{$refTable}` (`{$refCols}`) ON DELETE RESTRICT ON UPDATE CASCADE");
    }

    private function foreignKeyExists(string $name): bool
    {
        return (bool) $this->db->query(
            'SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ? LIMIT 1',
            [$name]
        )->getRowArray();
    }
}
