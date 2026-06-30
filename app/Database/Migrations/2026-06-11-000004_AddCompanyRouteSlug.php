<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddCompanyRouteSlug extends Migration
{
    public function up(): void
    {
        if (! $this->db->fieldExists('route_slug', 'companies')) {
            $this->forge->addColumn('companies', [
                'route_slug' => [
                    'type' => 'VARCHAR',
                    'constraint' => 120,
                    'null' => true,
                    'after' => 'brand_name',
                ],
            ]);
        }

        $companies = $this->db->table('companies')->get()->getResultArray();
        foreach ($companies as $company) {
            if (! empty($company['route_slug'])) continue;

            $slug = $this->uniqueSlug($this->slugify($company['name'] ?? 'company'), (int) $company['id']);
            $this->db->table('companies')->where('id', $company['id'])->update(['route_slug' => $slug]);
        }

        if (! $this->hasRouteSlugIndex()) {
            $this->forge->addUniqueKey('route_slug', 'companies_route_slug_unique');
            $this->forge->processIndexes('companies');
        }
    }

    public function down(): void
    {
        if ($this->db->fieldExists('route_slug', 'companies')) {
            $this->forge->dropColumn('companies', 'route_slug');
        }
    }

    private function uniqueSlug(string $slug, int $companyId): string
    {
        $candidate = $slug;
        $counter = 2;
        while ($this->db->table('companies')->where('route_slug', $candidate)->where('id !=', $companyId)->countAllResults() > 0) {
            $candidate = $slug . '-' . $counter;
            $counter++;
        }
        return $candidate;
    }

    private function slugify(string $value): string
    {
        $value = preg_replace('/[^A-Za-z0-9]+/', '-', trim($value)) ?: 'company';
        return trim($value, '-') ?: 'company';
    }

    private function hasRouteSlugIndex(): bool
    {
        foreach ($this->db->getIndexData('companies') as $item) {
            if (in_array('route_slug', $item->fields ?? [], true)) return true;
        }
        return false;
    }
}
