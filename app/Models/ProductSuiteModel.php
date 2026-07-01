<?php

namespace App\Models;

use App\Services\StatusCodeService;
use CodeIgniter\Model;
use Config\Database;

class ProductSuiteModel extends Model
{
    protected $DBGroup = 'default';

    public function categories(int $companyId, ?int $outletId = null): array
    {
        $db = Database::connect();
        $builder = $db->table('categories');
        if ($db->fieldExists('company_id', 'categories')) {
            $builder->where('company_id', $companyId);
        }
        $this->scope($builder, $outletId);
        return $builder->orderBy('name', 'ASC')->get()->getResultArray();
    }

    public function products(int $companyId, ?int $outletId = null): array
    {
        $builder = $this->productBuilder($companyId, $outletId);
        return $builder->orderBy('name', 'ASC')->get()->getResultArray();
    }

    public function productPage(int $companyId, ?int $outletId = null, array $filters = []): array
    {
        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = min(100, max(1, (int) ($filters['per_page'] ?? $filters['perPage'] ?? 25)));
        $builder = $this->productBuilder($companyId, $outletId);

        if (($filters['status'] ?? '') !== '') {
            $builder->where('p.status', StatusCodeService::common((string) $filters['status']));
        }
        if (($filters['category_id'] ?? '') !== '') {
            $builder->where('poc.category_id', (int) $filters['category_id']);
        }
        if (($filters['search'] ?? '') !== '') {
            $search = (string) $filters['search'];
            $builder->groupStart()
                ->like('p.name', $search)
                ->orLike('p.sku', $search)
                ->orLike('p.description', $search)
                ->groupEnd();
        }

        $countBuilder = clone $builder;
        $total = $countBuilder->countAllResults();
        $rows = $builder
            ->orderBy('name', 'ASC')
            ->limit($perPage, ($page - 1) * $perPage)
            ->get()
            ->getResultArray();

        return ['rows' => $rows, 'total' => $total, 'page' => $page, 'perPage' => $perPage];
    }

    public function productRow(int $companyId, ?int $outletId, int $id): ?array
    {
        $builder = $this->productBuilder($companyId, $outletId)
            ->where('p.id', $id);
        return $builder->get()->getRowArray() ?: null;
    }

    public function modifiers(int $companyId, ?int $outletId = null): array
    {
        $db = Database::connect();
        $builder = $db->table('modifiers');
        if ($db->fieldExists('company_id', 'modifiers')) {
            $builder->where('company_id', $companyId);
        }
        $this->scope($builder, $outletId);
        return $builder->orderBy('name', 'ASC')->get()->getResultArray();
    }

    public function ingredients(int $companyId, int $outletId): array
    {
        $db = Database::connect();
        $builder = $db
            ->table('outlet_ingredients i')
            ->select('i.*, t.code template_code, t.name template_name, t.category template_category, t.unit template_unit')
            ->join('ingredient_templates t', 't.id = i.template_id', 'left')
            ->where('i.outlet_id', $outletId)
            ->orderBy('i.name', 'ASC');
        if ($db->fieldExists('company_id', 'outlet_ingredients')) {
            $builder->where('i.company_id', $companyId);
        }
        return $builder->get()->getResultArray();
    }

    public function ingredientMappings(int $companyId, int $outletId): array
    {
        if (! Database::connect()->tableExists('outlet_ingredient_mappings')) return [];

        $db = Database::connect();
        $builder = $db
            ->table('outlet_ingredient_mappings')
            ->where('outlet_id', $outletId)
            ->whereIn('status', [StatusCodeService::ACTIVE, 'active'])
        ;
        if ($db->fieldExists('company_id', 'outlet_ingredient_mappings')) {
            $builder->where('company_id', $companyId);
        }
        return $builder->get()->getResultArray();
    }

    public function ingredientTemplates(int $companyId): array
    {
        $db = Database::connect();
        $builder = $db
            ->table('ingredient_templates')
            ->orderBy('name', 'ASC');
        if ($db->fieldExists('company_id', 'ingredient_templates')) {
            $builder->where('company_id', $companyId);
        }
        return $builder->get()->getResultArray();
    }

    public function recipeRows(int $companyId): array
    {
        $db = Database::connect();
        $builder = $db
            ->table('product_recipe_items')
        ;
        if ($db->fieldExists('company_id', 'product_recipe_items')) {
            $builder->where('company_id', $companyId);
        }
        return $builder->get()->getResultArray();
    }

    public function modifierOptions(array $modifierIds, ?int $companyId = null, ?int $outletId = null): array
    {
        if (! $modifierIds) return [];

        $db = Database::connect();
        $builder = $db->table('modifier_options mo')
            ->select('mo.*')
            ->whereIn('mo.modifier_id', $modifierIds);

        if ($db->tableExists('modifier_option_outlet_prices') && $companyId && $outletId) {
            $priceJoin = 'moop.modifier_option_id = mo.id AND moop.outlet_id = ' . (int) $outletId . " AND moop.status = 'active'";
            if ($db->fieldExists('company_id', 'modifier_option_outlet_prices')) {
                $priceJoin = 'moop.modifier_option_id = mo.id AND moop.company_id = ' . (int) $companyId . ' AND moop.outlet_id = ' . (int) $outletId . " AND moop.status = 'active'";
            }
            $builder
                ->select('moop.price_delta outlet_price_delta, moop.note outlet_price_note, moop.status outlet_price_status')
                ->join('modifier_option_outlet_prices moop', $priceJoin, 'left');
        }

        return $builder
            ->orderBy('mo.id', 'ASC')
            ->get()
            ->getResultArray();
    }

    public function productModifiers(array $productIds): array
    {
        if (! $productIds || ! Database::connect()->tableExists('product_modifiers')) return [];

        return Database::connect()
            ->table('product_modifiers')
            ->whereIn('product_id', $productIds)
            ->get()
            ->getResultArray();
    }

    private function productBuilder(int $companyId, ?int $outletId)
    {
        $db = Database::connect();
        $builder = $db->table('products p')
            ->select('p.*');
        if ($db->fieldExists('company_id', 'products')) {
            $builder->where('p.company_id', $companyId);
        }

        if ($db->tableExists('product_outlet_prices') && $outletId > 0) {
            $priceJoin = 'pop.product_id = p.id AND pop.outlet_id = ' . (int) $outletId . " AND pop.status = 'active'";
            if ($db->fieldExists('company_id', 'product_outlet_prices')) {
                $priceJoin = 'pop.product_id = p.id AND pop.company_id = p.company_id AND pop.outlet_id = ' . (int) $outletId . " AND pop.status = 'active'";
            }
            $builder
                ->select('pop.selling_price outlet_selling_price, pop.status outlet_price_status, pop.note outlet_price_note')
                ->join('product_outlet_prices pop', $priceJoin, 'left');
        }

        if ($db->tableExists('product_outlet_categories') && $outletId > 0) {
            $categoryJoin = 'poc.product_id = p.id AND poc.outlet_id = ' . (int) $outletId;
            if ($db->fieldExists('company_id', 'product_outlet_categories')) {
                $categoryJoin = 'poc.product_id = p.id AND poc.company_id = p.company_id AND poc.outlet_id = ' . (int) $outletId;
            }
            $builder
                ->select('poc.category_id outlet_category_id')
                ->join('product_outlet_categories poc', $categoryJoin, 'left');
        } else {
            $builder->select('NULL outlet_category_id', false);
        }

        $this->scope($builder, $outletId, 'p');
        return $builder;
    }

    private function scope($builder, ?int $outletId, string $alias = ''): void
    {
        if ($outletId === null) return;
        $prefix = $alias ? "{$alias}." : '';

        if ($outletId <= 0) {
            $builder->where('1 = 0', null, false);
            return;
        }

        $builder->groupStart()
            ->where($prefix . 'outlet_id', $outletId)
            ->orWhere($prefix . 'outlet_id', null)
            ->groupEnd();
    }
}
