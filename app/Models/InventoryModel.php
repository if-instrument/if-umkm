<?php

namespace App\Models;

use CodeIgniter\Model;
use Config\Database;

class InventoryModel extends Model
{
    protected $DBGroup = 'default';

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

    public function ingredientPage(int $companyId, int $outletId, array $filters = []): array
    {
        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = min(100, max(1, (int) ($filters['per_page'] ?? $filters['perPage'] ?? 25)));
        $db = Database::connect();
        $builder = $db
            ->table('outlet_ingredients i')
            ->select('i.*, t.code template_code, t.name template_name, t.category template_category, t.unit template_unit')
            ->join('ingredient_templates t', 't.id = i.template_id', 'left')
            ->where('i.outlet_id', $outletId);
        if ($db->fieldExists('company_id', 'outlet_ingredients')) {
            $builder->where('i.company_id', $companyId);
        }

        if (($filters['status'] ?? '') !== '') {
            $builder->where('i.status', (string) $filters['status']);
        }
        if (($filters['category'] ?? '') !== '') {
            $builder->where('i.category', (string) $filters['category']);
        }
        if (($filters['search'] ?? '') !== '') {
            $search = (string) $filters['search'];
            $builder->groupStart()
                ->like('i.name', $search)
                ->orLike('i.sku', $search)
                ->orLike('i.category', $search)
                ->orLike('t.name', $search)
                ->orLike('t.code', $search)
                ->groupEnd();
        }

        $countBuilder = clone $builder;
        $total = $countBuilder->countAllResults();
        $rows = $builder
            ->orderBy('i.name', 'ASC')
            ->limit($perPage, ($page - 1) * $perPage)
            ->get()
            ->getResultArray();

        return ['rows' => $rows, 'total' => $total, 'page' => $page, 'perPage' => $perPage];
    }

    public function ingredientRow(int $companyId, int $outletId, int $id): ?array
    {
        $db = Database::connect();
        $builder = $db
            ->table('outlet_ingredients i')
            ->select('i.*, t.code template_code, t.name template_name, t.category template_category, t.unit template_unit')
            ->join('ingredient_templates t', 't.id = i.template_id', 'left')
            ->where('i.outlet_id', $outletId)
            ->where('i.id', $id)
        ;
        if ($db->fieldExists('company_id', 'outlet_ingredients')) {
            $builder->where('i.company_id', $companyId);
        }
        return $builder->get()->getRowArray() ?: null;
    }

    public function movements(int $companyId, int $outletId, array $filters = []): array
    {
        $db = Database::connect();
        $builder = $db
            ->table('stock_movements m')
            ->select('m.*, i.sku ingredient_sku, i.name ingredient_name, i.unit ingredient_unit')
            ->join('outlet_ingredients i', 'i.id = m.outlet_ingredient_id', 'left')
            ->where('m.outlet_id', $outletId);
        if ($db->fieldExists('company_id', 'stock_movements')) {
            $builder->where('m.company_id', $companyId);
        }

        $ingredientFilter = $filters['outlet_ingredient_id'] ?? $filters['ingredient_id'] ?? null;
        if (! empty($ingredientFilter)) {
            $builder->where('m.outlet_ingredient_id', (int) $ingredientFilter);
        }
        if (! empty($filters['type']) && $filters['type'] !== 'all') {
            $builder->where('m.movement_type', $this->databaseMovementType((string) $filters['type']));
        }
        if (! empty($filters['from'])) {
            $builder->where('m.created_at >=', $filters['from'] . ' 00:00:00');
        }
        if (! empty($filters['to'])) {
            $builder->where('m.created_at <=', $filters['to'] . ' 23:59:59');
        }
        if (! empty($filters['search'])) {
            $builder->like('m.notes', (string) $filters['search']);
        }

        return $builder->orderBy('m.created_at', 'ASC')->get()->getResultArray();
    }

    public function movementPage(int $companyId, int $outletId, array $filters = []): array
    {
        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = min(100, max(1, (int) ($filters['per_page'] ?? $filters['perPage'] ?? 25)));
        $db = Database::connect();
        $builder = $db
            ->table('stock_movements m')
            ->select('m.*, i.sku ingredient_sku, i.name ingredient_name, i.unit ingredient_unit')
            ->join('outlet_ingredients i', 'i.id = m.outlet_ingredient_id', 'left')
            ->where('m.outlet_id', $outletId);
        if ($db->fieldExists('company_id', 'stock_movements')) {
            $builder->where('m.company_id', $companyId);
        }

        $ingredientFilter = $filters['outlet_ingredient_id'] ?? $filters['ingredient_id'] ?? null;
        if (! empty($ingredientFilter)) {
            $builder->where('m.outlet_ingredient_id', (int) $ingredientFilter);
        }
        if (! empty($filters['type']) && $filters['type'] !== 'all') {
            $builder->where('m.movement_type', $this->databaseMovementType((string) $filters['type']));
        }
        if (! empty($filters['from'])) {
            $builder->where('m.created_at >=', $filters['from'] . ' 00:00:00');
        }
        if (! empty($filters['to'])) {
            $builder->where('m.created_at <=', $filters['to'] . ' 23:59:59');
        }
        if (! empty($filters['search'])) {
            $builder->like('m.notes', (string) $filters['search']);
        }

        $countBuilder = clone $builder;
        $total = $countBuilder->countAllResults();
        $rows = $builder
            ->orderBy('m.created_at', 'DESC')
            ->limit($perPage, ($page - 1) * $perPage)
            ->get()
            ->getResultArray();

        return ['rows' => $rows, 'total' => $total, 'page' => $page, 'perPage' => $perPage];
    }

    private function databaseMovementType(string $type): string
    {
        return match ($type) {
            'opening' => 'opening_balance',
            'sale' => 'pos_usage',
            default => $type,
        };
    }
}
