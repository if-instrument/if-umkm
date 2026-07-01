<?php

namespace App\Services;

use App\Models\InventoryModel;
use App\Models\IngredientModel;
use App\Models\IngredientTemplateModel;
use App\Models\StockMovementModel;
use CodeIgniter\Database\BaseConnection;
use Config\Database;

class InventoryService
{
    private BaseConnection $db;
    private IngredientModel $ingredients;
    private IngredientTemplateModel $templates;
    private InventoryModel $inventory;
    private StockMovementModel $movements;

    public function __construct()
    {
        $this->db = Database::connect();
        $this->ingredients = new IngredientModel();
        $this->templates = new IngredientTemplateModel();
        $this->inventory = new InventoryModel();
        $this->movements = new StockMovementModel();
    }

    public function data(int $companyId, int $outletId, array $filters = []): array
    {
        $ingredients = $this->inventory->ingredients($companyId, $outletId);
        $movements = $this->inventory->movements($companyId, $outletId, $filters);

        return [
            'ingredients' => array_map(fn ($row) => $this->ingredientPayload($row), $ingredients),
            'stockMovements' => array_map(fn ($row) => $this->movementPayload($row), $movements),
        ];
    }

    public function ingredientPage(int $companyId, int $outletId, array $filters = []): array
    {
        $page = $this->inventory->ingredientPage($companyId, $outletId, $filters);
        return [
            'items' => array_map(fn ($row) => $this->ingredientPayload($row), $page['rows']),
            'meta' => $this->paginationMeta($page['page'], $page['perPage'], $page['total']),
        ];
    }

    public function ingredientDetail(string $legacyId, int $companyId, int $outletId): array
    {
        $id = $this->ingredientId($legacyId);
        $row = $id ? $this->inventory->ingredientRow($companyId, $outletId, $id) : null;
        if (! $row) {
            throw new \InvalidArgumentException('Bahan tidak ditemukan.');
        }

        return $this->ingredientPayload($row);
    }

    public function templatePage(int $companyId, array $filters = []): array
    {
        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = min(100, max(1, (int) ($filters['per_page'] ?? $filters['perPage'] ?? 50)));
        $builder = $this->db->table('ingredient_templates');
        if ($this->hasCompanyColumn('ingredient_templates')) {
            $builder->where('company_id', $companyId);
        }

        if (($filters['status'] ?? '') !== '') {
            $builder->where('status', StatusCodeService::common((string) $filters['status']));
        }
        if (($filters['search'] ?? '') !== '') {
            $search = (string) $filters['search'];
            $builder->groupStart()
                ->like('name', $search)
                ->orLike('code', $search)
                ->orLike('category', $search)
                ->groupEnd();
        }

        $countBuilder = clone $builder;
        $total = $countBuilder->countAllResults();
        $rows = $builder
            ->orderBy('name', 'ASC')
            ->limit($perPage, ($page - 1) * $perPage)
            ->get()
            ->getResultArray();

        return [
            'items' => array_map(fn ($row) => $this->templatePayload($row), $rows),
            'meta' => $this->paginationMeta($page, $perPage, $total),
        ];
    }

    public function saveTemplate(array $payload, int $companyId): array
    {
        $id = $this->templateId($payload['id'] ?? $payload['templateId'] ?? null, $companyId);
        $data = [
            'code' => $payload['code'] ?? $this->nextTemplateCode($companyId, (string) ($payload['name'] ?? 'Bahan')),
            'name' => trim((string) ($payload['name'] ?? 'Master Bahan')),
            'category' => trim((string) ($payload['category'] ?? 'Raw Material')),
            'unit' => trim((string) ($payload['unit'] ?? 'satuan')),
            'status' => StatusCodeService::common($payload['status'] ?? 'active'),
        ];
        $data = $this->withCompanyData('ingredient_templates', $data, $companyId);

        if ($id) {
            $this->templates->update($id, $data);
        } else {
            $this->templates->insert($data);
            $id = (int) $this->templates->getInsertID();
        }

        return $this->templatePayload($this->templates->find($id));
    }

    public function deactivateTemplate(string $legacyId, int $companyId): array
    {
        $id = $this->templateId($legacyId, $companyId);
        if (! $id) {
            throw new \InvalidArgumentException('Master bahan tidak ditemukan.');
        }

        $this->templates->update($id, ['status' => StatusCodeService::INACTIVE]);
        return $this->templatePayload($this->templates->find($id));
    }

    public function movementPage(int $companyId, int $outletId, array $filters = []): array
    {
        $page = $this->inventory->movementPage($companyId, $outletId, $filters);
        return [
            'items' => array_map(fn ($row) => $this->movementPayload($row), $page['rows']),
            'meta' => $this->paginationMeta($page['page'], $page['perPage'], $page['total']),
        ];
    }

    public function saveIngredient(array $payload, int $companyId, int $outletId): array
    {
        $id = $this->ingredientId($payload['id'] ?? '');
        return $id
            ? $this->updateIngredient($id, $payload, $companyId, $outletId)
            : $this->createIngredient($payload, $companyId, $outletId);
    }

    public function saveIngredientMapping(array $payload, int $companyId, int $outletId): array
    {
        $templateId = $this->templateId($payload['templateId'] ?? $payload['template_id'] ?? null, $companyId);
        $ingredientId = $this->ingredientId($payload['ingredientId'] ?? $payload['outlet_ingredient_id'] ?? $payload['ingredient_id'] ?? '');
        if (! $templateId || ! $ingredientId) {
            throw new \InvalidArgumentException('Template dan bahan outlet wajib dipilih.');
        }

        $ingredient = $this->ingredients->find($ingredientId);
        if (! $ingredient || ! $this->rowBelongsToCompany($ingredient, $companyId) || (int) $ingredient['outlet_id'] !== $outletId || StatusCodeService::isInactive($ingredient['status'] ?? '')) {
            throw new \InvalidArgumentException('Bahan outlet tidak ditemukan atau nonaktif.');
        }

        $existing = $this->db->table('outlet_ingredient_mappings')
            ->where('outlet_id', $outletId)
            ->where('template_id', $templateId)
        ;
        if ($this->hasCompanyColumn('outlet_ingredient_mappings')) {
            $existing->where('company_id', $companyId);
        }
        $existing = $existing->get()->getRowArray();

        $data = [
            'outlet_id' => $outletId,
            'template_id' => $templateId,
            'outlet_ingredient_id' => $ingredientId,
            'note' => trim((string) ($payload['note'] ?? '')),
            'status' => StatusCodeService::ACTIVE,
            'updated_at' => date('Y-m-d H:i:s'),
        ];
        $data = $this->withCompanyData('outlet_ingredient_mappings', $data, $companyId);

        if ($existing) {
            $this->db->table('outlet_ingredient_mappings')->where('id', $existing['id'])->update($data);
            $id = (int) $existing['id'];
        } else {
            $data['created_at'] = date('Y-m-d H:i:s');
            $this->db->table('outlet_ingredient_mappings')->insert($data);
            $id = (int) $this->db->insertID();
        }

        return [
            'id' => 'map-' . $id,
            'templateId' => $this->templateCode($this->templates->find($templateId) ?: ['id' => $templateId]),
            'ingredientId' => $this->ingredientCode($ingredient),
        ];
    }

    public function purchase(array $payload, int $companyId, int $outletId): array
    {
        $ingredientId = $this->ingredientId($payload['ingredientId'] ?? $payload['outlet_ingredient_id'] ?? $payload['ingredient_id'] ?? '');
        if (! $ingredientId) {
            throw new \InvalidArgumentException('Bahan tidak ditemukan.');
        }

        $this->receiveStock([
            'company_id' => $companyId,
            'outlet_id' => $outletId,
            'outlet_ingredient_id' => $ingredientId,
            'qty' => (float) ($payload['qty'] ?? 0),
            'total_cost' => (float) ($payload['totalCost'] ?? $payload['total_cost'] ?? 0),
            'reference_type' => 'purchase',
            'notes' => $payload['note'] ?? 'Pembelian stok',
            'manufactured_at' => $payload['manufacturedAt'] ?? $payload['manufactured_at'] ?? null,
            'expired_at' => $payload['expiredAt'] ?? $payload['expired_at'] ?? null,
        ]);

        return $this->ingredientDetail((string) $ingredientId, $companyId, $outletId);
    }

    public function waste(array $payload, int $companyId, int $outletId): array
    {
        $ingredientId = $this->ingredientId($payload['ingredientId'] ?? $payload['outlet_ingredient_id'] ?? $payload['ingredient_id'] ?? '');
        if (! $ingredientId) {
            throw new \InvalidArgumentException('Bahan tidak ditemukan.');
        }

        $this->reduceStock([
            'company_id' => $companyId,
            'outlet_id' => $outletId,
            'outlet_ingredient_id' => $ingredientId,
            'qty' => (float) ($payload['qty'] ?? 0),
            'movement_type' => in_array($payload['type'] ?? '', ['expired', 'waste'], true) ? $payload['type'] : 'waste',
            'reference_type' => 'inventory_loss',
            'notes' => $payload['note'] ?? null,
            'costing_method' => $payload['costingMethod'] ?? 'average',
        ]);

        return $this->ingredientDetail((string) $ingredientId, $companyId, $outletId);
    }

    public function deactivateIngredient(string $legacyId, int $companyId, int $outletId): array
    {
        $id = $this->ingredientId($legacyId);
        $ingredient = $id ? $this->ingredients->find($id) : null;
        if (! $ingredient || ! $this->rowBelongsToCompany($ingredient, $companyId) || (int) $ingredient['outlet_id'] !== $outletId) {
            throw new \InvalidArgumentException('Bahan tidak ditemukan.');
        }
        if ((float) $ingredient['stock_qty'] > 0) {
            throw new \InvalidArgumentException('Bahan hanya bisa dinonaktifkan jika stok sudah habis.');
        }

        $this->ingredients->update($id, ['status' => StatusCodeService::INACTIVE]);
        return $this->ingredientDetail((string) $id, $companyId, $outletId);
    }

    public function receiveStock(array $payload): void
    {
        $this->db->transStart();

        $ingredient = $this->ingredients->find($payload['outlet_ingredient_id']);
        if (! $ingredient) {
            throw new \InvalidArgumentException('Bahan tidak ditemukan.');
        }
        $qtyIn = (float) $payload['qty'];
        $totalCost = (float) $payload['total_cost'];
        $stockBefore = (float) $ingredient['stock_qty'];
        $stockAfter = $stockBefore + $qtyIn;
        $averageCost = $stockAfter > 0
            ? (($stockBefore * (float) $ingredient['average_cost']) + $totalCost) / $stockAfter
            : 0;

        $this->ingredients->update($ingredient['id'], [
            'stock_qty' => $stockAfter,
            'average_cost' => $averageCost,
        ]);

        $this->recordMovement($payload + [
            'movement_type' => 'purchase',
            'stock_before' => $stockBefore,
            'qty_in' => $qtyIn,
            'qty_out' => 0,
            'stock_after' => $stockAfter,
            'unit_cost' => $qtyIn > 0 ? $totalCost / $qtyIn : 0,
            'total_cost' => $totalCost,
        ]);

        if ($qtyIn > 0) {
            $this->createIngredientLot((int) $ingredient['id'], (int) ($payload['company_id'] ?? 1), (int) $payload['outlet_id'], $qtyIn, $qtyIn > 0 ? $totalCost / $qtyIn : 0, [
                'reference_type' => $payload['reference_type'] ?? 'purchase',
                'reference_id' => $payload['reference_id'] ?? null,
                'manufactured_at' => $payload['manufactured_at'] ?? null,
                'expired_at' => $payload['expired_at'] ?? null,
            ]);
        }

        $this->db->transComplete();
    }

    public function reduceStock(array $payload): void
    {
        $this->db->transStart();

        $ingredient = $this->ingredients->find($payload['outlet_ingredient_id']);
        if (! $ingredient) {
            throw new \InvalidArgumentException('Bahan tidak ditemukan.');
        }
        $qtyOut = min((float) $payload['qty'], (float) $ingredient['stock_qty']);
        $stockBefore = (float) $ingredient['stock_qty'];
        $stockAfter = max(0, $stockBefore - $qtyOut);
        $lotConsumption = $this->consumeIngredientLots((int) $ingredient['id'], (int) $payload['outlet_id'], $qtyOut);
        $unitCost = $lotConsumption['qty'] > 0
            ? $lotConsumption['cost'] / $lotConsumption['qty']
            : $this->costFor($ingredient, $payload['costing_method'] ?? 'average');

        $this->ingredients->update($ingredient['id'], ['stock_qty' => $stockAfter]);

        $this->recordMovement($payload + [
            'stock_before' => $stockBefore,
            'qty_in' => 0,
            'qty_out' => $qtyOut,
            'stock_after' => $stockAfter,
            'unit_cost' => $unitCost,
            'total_cost' => $qtyOut * $unitCost,
            'notes' => trim((string) ($payload['notes'] ?? '') . ($lotConsumption['note'] ? ' | FEFO: ' . $lotConsumption['note'] : '')),
        ]);

        $this->db->transComplete();
    }

    public function costFor(array $ingredient, string $method = 'average'): float
    {
        if ($method === 'standard') {
            return (float) $ingredient['standard_cost'];
        }

        return (float) $ingredient['average_cost'];
    }

    private function recordMovement(array $payload): void
    {
        $this->movements->insert($this->withCompanyData('stock_movements', [
            'outlet_id' => $payload['outlet_id'],
            'outlet_ingredient_id' => $payload['outlet_ingredient_id'],
            'movement_type' => $payload['movement_type'],
            'reference_type' => $payload['reference_type'] ?? null,
            'reference_id' => $payload['reference_id'] ?? null,
            'stock_before' => $payload['stock_before'],
            'qty_in' => $payload['qty_in'],
            'qty_out' => $payload['qty_out'],
            'stock_after' => $payload['stock_after'],
            'unit_cost' => $payload['unit_cost'],
            'total_cost' => $payload['total_cost'],
            'notes' => $payload['notes'] ?? null,
            'created_by' => $payload['created_by'] ?? null,
        ], (int) ($payload['company_id'] ?? 1)));
    }

    private function paginationMeta(int $page, int $perPage, int $total): array
    {
        return [
            'page' => $page,
            'perPage' => $perPage,
            'total' => $total,
            'totalPages' => (int) max(1, ceil($total / max(1, $perPage))),
        ];
    }

    private function createIngredient(array $payload, int $companyId, int $outletId): array
    {
        $name = trim((string) ($payload['name'] ?? 'Bahan Baru'));
        $category = trim((string) ($payload['category'] ?? 'Raw Material'));
        $unit = trim((string) ($payload['unit'] ?? 'satuan'));
        $templateId = $this->resolveTemplateForIngredient($payload, $companyId, $name, $category, $unit);
        $duplicate = $this->ingredients
            ->where('outlet_id', $outletId)
            ->where('template_id', $templateId)
        ;
        if ($this->hasCompanyColumn('outlet_ingredients')) {
            $duplicate->where('company_id', $companyId);
        }
        $duplicate = $duplicate->first();
        if ($duplicate) {
            throw new \InvalidArgumentException('Bahan dengan master yang sama sudah ada di outlet ini.');
        }

        $stock = max(0, (float) ($payload['stock'] ?? 0));
        $totalCost = max(0, (float) ($payload['totalCost'] ?? $payload['total_cost'] ?? 0));
        $averageCost = $stock > 0 ? $totalCost / $stock : 0;

        $this->db->transStart();
        $sku = trim((string) ($payload['sku'] ?? '')) ?: $this->nextSku($companyId, $outletId);

        $this->ingredients->insert($this->withCompanyData('outlet_ingredients', [
            'outlet_id' => $outletId,
            'template_id' => $templateId,
            'sku' => $sku,
            'name' => $name,
            'category' => $category,
            'unit' => $unit,
            'stock_qty' => $stock,
            'minimum_stock' => (float) ($payload['minStock'] ?? $payload['minimum_stock'] ?? 0),
            'average_cost' => $averageCost,
            'standard_cost' => (float) ($payload['standardCost'] ?? $payload['standard_cost'] ?? 0),
            'status' => StatusCodeService::ACTIVE,
        ], $companyId));
        $id = (int) $this->ingredients->getInsertID();

        if ($stock > 0) {
            $this->createIngredientLot($id, $companyId, $outletId, $stock, $averageCost, [
                'reference_type' => 'opening',
                'manufactured_at' => $payload['manufacturedAt'] ?? $payload['manufactured_at'] ?? null,
                'expired_at' => $payload['expiredAt'] ?? $payload['expired_at'] ?? null,
            ]);
            $this->recordMovement([
                'company_id' => $companyId,
                'outlet_id' => $outletId,
                'outlet_ingredient_id' => $id,
                'movement_type' => 'opening_balance',
                'reference_type' => 'opening',
                'stock_before' => 0,
                'qty_in' => $stock,
                'qty_out' => 0,
                'stock_after' => $stock,
                'unit_cost' => $averageCost,
                'total_cost' => $totalCost,
                'notes' => $payload['note'] ?? 'Saldo awal bahan baru',
            ]);
        }

        $this->db->transComplete();
        return $this->ingredientDetail((string) $id, $companyId, $outletId);
    }

    private function updateIngredient(int $id, array $payload, int $companyId, int $outletId): array
    {
        $ingredient = $this->ingredients->find($id);
        if (! $ingredient || ! $this->rowBelongsToCompany($ingredient, $companyId) || (int) $ingredient['outlet_id'] !== $outletId) {
            throw new \InvalidArgumentException('Bahan tidak ditemukan.');
        }

        $nextStock = max(0, (float) ($payload['stock'] ?? $ingredient['stock_qty']));
        $stockBefore = (float) $ingredient['stock_qty'];
        $stockDelta = $nextStock - $stockBefore;
        $nextAverageCost = max(0, (float) ($payload['avgCost'] ?? $payload['average_cost'] ?? $ingredient['average_cost']));
        $templateId = array_key_exists('templateId', $payload) || array_key_exists('template_id', $payload)
            ? $this->resolveTemplateForIngredient($payload, $companyId, trim((string) ($payload['name'] ?? $ingredient['name'])), trim((string) ($payload['category'] ?? $ingredient['category'])), trim((string) ($payload['unit'] ?? $ingredient['unit'])))
            : (int) ($ingredient['template_id'] ?? 0);

        if ($templateId && $templateId !== (int) ($ingredient['template_id'] ?? 0)) {
            $duplicate = $this->ingredients
                ->where('outlet_id', $outletId)
                ->where('template_id', $templateId)
                ->where('id !=', $id)
            ;
            if ($this->hasCompanyColumn('outlet_ingredients')) {
                $duplicate->where('company_id', $companyId);
            }
            $duplicate = $duplicate->first();
            if ($duplicate) {
                throw new \InvalidArgumentException('Master bahan ini sudah dipakai bahan lain di outlet ini.');
            }
        }

        $this->db->transStart();
        $this->ingredients->update($id, [
            'template_id' => $templateId ?: null,
            'sku' => trim((string) ($payload['sku'] ?? $ingredient['sku'])),
            'name' => trim((string) ($payload['name'] ?? $ingredient['name'])),
            'category' => trim((string) ($payload['category'] ?? $ingredient['category'])),
            'unit' => trim((string) ($payload['unit'] ?? $ingredient['unit'])),
            'stock_qty' => $nextStock,
            'minimum_stock' => (float) ($payload['minStock'] ?? $payload['minimum_stock'] ?? $ingredient['minimum_stock']),
            'average_cost' => $nextAverageCost,
            'standard_cost' => (float) ($payload['standardCost'] ?? $payload['standard_cost'] ?? $ingredient['standard_cost']),
            'status' => StatusCodeService::common($payload['status'] ?? $ingredient['status'] ?? 'active'),
        ]);

        if (abs($stockDelta) > 0.0001) {
            $this->recordMovement([
                'company_id' => $companyId,
                'outlet_id' => $outletId,
                'outlet_ingredient_id' => $id,
                'movement_type' => 'adjustment',
                'reference_type' => 'stock_correction',
                'stock_before' => $stockBefore,
                'qty_in' => $stockDelta > 0 ? $stockDelta : 0,
                'qty_out' => $stockDelta < 0 ? abs($stockDelta) : 0,
                'stock_after' => $nextStock,
                'unit_cost' => $nextAverageCost,
                'total_cost' => abs($stockDelta) * $nextAverageCost,
                'notes' => $payload['note'] ?? 'Koreksi data bahan',
            ]);
        }

        $this->db->transComplete();
        return $this->ingredientDetail((string) $id, $companyId, $outletId);
    }

    private function nextSku(int $companyId, int $outletId): string
    {
        $count = $this->ingredients->where('outlet_id', $outletId);
        if ($this->hasCompanyColumn('outlet_ingredients')) {
            $count->where('company_id', $companyId);
        }
        $count = $count->countAllResults();

        return 'ING-' . str_pad((string) ($count + 1), 4, '0', STR_PAD_LEFT);
    }

    private function ingredientId(string|int|null $legacyId): ?int
    {
        if (! $legacyId) return null;
        if (is_numeric($legacyId)) return (int) $legacyId;
        if (preg_match('/^ing-(\d+)$/', (string) $legacyId, $matches)) return (int) $matches[1];

        return null;
    }

    private function ingredientPayload(array $row): array
    {
        return [
            'id' => $this->ingredientCode($row),
            'templateId' => ! empty($row['template_id']) ? $this->templateCode($row) : '',
            'templateCode' => $row['template_code'] ?? '',
            'templateName' => $row['template_name'] ?? '',
            'templateCategory' => $row['template_category'] ?? '',
            'templateUnit' => $row['template_unit'] ?? '',
            'companyId' => $this->companyCode((int) ($row['company_id'] ?? 1)),
            'outletId' => $this->outletCode((int) $row['outlet_id']),
            'sku' => $row['sku'],
            'name' => $row['name'],
            'category' => $row['category'],
            'unit' => $row['unit'],
            'stock' => (float) $row['stock_qty'],
            'avgCost' => (float) $row['average_cost'],
            'standardCost' => (float) $row['standard_cost'],
            'minStock' => (float) $row['minimum_stock'],
            'status' => StatusCodeService::common($row['status'] ?? ''),
            'lots' => $this->ingredientLotsPayload((int) $row['id']),
        ];
    }

    private function createIngredientLot(int $ingredientId, int $companyId, int $outletId, float $qty, float $unitCost, array $meta = []): void
    {
        if ($qty <= 0 || ! $this->db->tableExists('ingredient_lots')) return;
        $now = date('Y-m-d H:i:s');
        $this->db->table('ingredient_lots')->insert($this->withCompanyData('ingredient_lots', [
            'outlet_id' => $outletId,
            'outlet_ingredient_id' => $ingredientId,
            'lot_no' => $meta['lot_no'] ?? ('INGLOT-' . date('YmdHis') . '-' . $ingredientId),
            'qty_initial' => $qty,
            'qty_remaining' => $qty,
            'unit_cost' => $unitCost,
            'manufactured_at' => $this->dateOrNull($meta['manufactured_at'] ?? null),
            'expired_at' => $this->dateOrNull($meta['expired_at'] ?? null),
            'reference_type' => $meta['reference_type'] ?? null,
            'reference_id' => $meta['reference_id'] ?? null,
            'status' => StatusCodeService::ACTIVE,
            'created_at' => $now,
            'updated_at' => $now,
        ], $companyId));
    }

    private function consumeIngredientLots(int $ingredientId, int $outletId, float $qty): array
    {
        if ($qty <= 0 || ! $this->db->tableExists('ingredient_lots')) return ['qty' => 0, 'cost' => 0, 'note' => ''];

        $remaining = $qty;
        $usedQty = 0;
        $cost = 0;
        $notes = [];
        $lots = $this->db->table('ingredient_lots')
            ->where('outlet_ingredient_id', $ingredientId)
            ->where('outlet_id', $outletId)
            ->whereIn('status', [StatusCodeService::ACTIVE, 'active'])
            ->where('qty_remaining >', 0)
            ->orderBy('expired_at IS NULL', 'ASC', false)
            ->orderBy('expired_at', 'ASC')
            ->orderBy('created_at', 'ASC')
            ->get()
            ->getResultArray();

        foreach ($lots as $lot) {
            if ($remaining <= 0) break;
            $take = min($remaining, (float) $lot['qty_remaining']);
            $nextQty = (float) $lot['qty_remaining'] - $take;
            $this->db->table('ingredient_lots')->where('id', $lot['id'])->update([
                'qty_remaining' => $nextQty,
                'status' => $nextQty <= 0.0001 ? StatusCodeService::INACTIVE : StatusCodeService::common($lot['status'] ?? 'active'),
                'updated_at' => date('Y-m-d H:i:s'),
            ]);
            $remaining -= $take;
            $usedQty += $take;
            $cost += $take * (float) $lot['unit_cost'];
            $notes[] = $lot['lot_no'] . ($lot['expired_at'] ? ' exp ' . $lot['expired_at'] : '');
        }

        return ['qty' => $usedQty, 'cost' => $cost, 'note' => implode(', ', $notes)];
    }

    private function ingredientLotsPayload(int $ingredientId): array
    {
        if (! $this->db->tableExists('ingredient_lots')) return [];
        $lots = $this->db->table('ingredient_lots')
            ->where('outlet_ingredient_id', $ingredientId)
            ->where('qty_remaining >', 0)
            ->orderBy('expired_at IS NULL', 'ASC', false)
            ->orderBy('expired_at', 'ASC')
            ->get()
            ->getResultArray();

        return array_map(fn ($lot) => [
            'id' => 'inglot-' . $lot['id'],
            'lotNo' => $lot['lot_no'],
            'createdAt' => $this->isoDate($lot['created_at'] ?? null),
            'manufacturedAt' => $lot['manufactured_at'] ?: '',
            'expiredAt' => $lot['expired_at'] ?: '',
            'remainingQty' => (float) $lot['qty_remaining'],
            'unitCost' => (float) $lot['unit_cost'],
        ], $lots);
    }

    private function movementPayload(array $row): array
    {
        $qty = (float) $row['qty_in'] > 0 ? (float) $row['qty_in'] : -1 * (float) $row['qty_out'];
        $totalCost = (float) $row['total_cost'];
        if ((float) $row['qty_out'] > 0 && $row['movement_type'] === 'adjustment') {
            $totalCost *= -1;
        }

        return [
            'id' => 'mov-' . $row['id'],
            'createdAt' => $this->isoDate($row['created_at'] ?? null),
            'companyId' => $this->companyCode((int) ($row['company_id'] ?? 1)),
            'outletId' => $this->outletCode((int) $row['outlet_id']),
            'ingredientId' => $this->ingredientCode([
                'id' => $row['outlet_ingredient_id'],
                'sku' => $row['ingredient_sku'] ?? '',
            ]),
            'type' => $this->uiMovementType($row['movement_type']),
            'category' => in_array($row['movement_type'], ['waste', 'expired'], true) ? 'inventory_loss' : '',
            'beforeQty' => (float) $row['stock_before'],
            'qty' => $qty,
            'afterQty' => (float) $row['stock_after'],
            'unitCost' => (float) $row['unit_cost'],
            'totalCost' => $totalCost,
            'note' => $row['notes'] ?? '',
        ];
    }

    private function ingredientCode(array $row): string
    {
        return 'ing-' . ($row['id'] ?? uniqid());
    }

    private function templateCode(array $row): string
    {
        return $row['template_code'] ?? $row['code'] ?? ('tpl-' . ($row['template_id'] ?? $row['id'] ?? uniqid()));
    }

    private function templatePayload(array $row): array
    {
        return [
            'id' => $this->templateCode($row),
            'companyId' => $this->companyCode((int) ($row['company_id'] ?? 1)),
            'code' => $row['code'],
            'name' => $row['name'],
            'category' => $row['category'],
            'unit' => $row['unit'],
            'status' => StatusCodeService::common($row['status'] ?? ''),
        ];
    }

    private function resolveTemplateForIngredient(array $payload, int $companyId, string $name, string $category, string $unit): int
    {
        $templateId = $this->templateId($payload['templateId'] ?? $payload['template_id'] ?? null, $companyId);
        if ($templateId) {
            return $templateId;
        }

        $existing = $this->templates->where('LOWER(name)', strtolower($name));
        if ($this->hasCompanyColumn('ingredient_templates')) {
            $existing->where('company_id', $companyId);
        }
        $existing = $existing->first();
        if ($existing) {
            return (int) $existing['id'];
        }

        $this->templates->insert($this->withCompanyData('ingredient_templates', [
            'code' => $this->nextTemplateCode($companyId, $name),
            'name' => $name,
            'category' => $category,
            'unit' => $unit,
            'status' => StatusCodeService::ACTIVE,
        ], $companyId));

        return (int) $this->templates->getInsertID();
    }

    private function templateId(string|int|null $value, int $companyId): ?int
    {
        if (! $value || $value === 'new') return null;
        if (is_numeric($value)) {
            if ($this->hasCompanyColumn('ingredient_templates')) {
                $this->templates->where('company_id', $companyId);
            }
            $row = $this->templates->find((int) $value);
            return $row ? (int) $row['id'] : null;
        }

        $value = (string) $value;
        if (preg_match('/^tpl-(\d+)$/', $value, $matches)) {
            if ($this->hasCompanyColumn('ingredient_templates')) {
                $this->templates->where('company_id', $companyId);
            }
            $row = $this->templates->find((int) $matches[1]);
            return $row ? (int) $row['id'] : null;
        }

        $row = $this->templates->where('code', $value);
        if ($this->hasCompanyColumn('ingredient_templates')) {
            $row->where('company_id', $companyId);
        }
        $row = $row->first();
        return $row ? (int) $row['id'] : null;
    }

    private function nextTemplateCode(int $companyId, string $name): string
    {
        $slug = strtolower(trim(preg_replace('/[^a-zA-Z0-9]+/', '-', $name), '-')) ?: 'bahan';
        $base = 'tpl-' . $slug;
        $code = $base;
        $counter = 2;
        while ($this->templateCodeExists($code, $companyId)) {
            $code = $base . '-' . $counter;
            $counter++;
        }

        return $code;
    }

    private function companyCode(int $id): string
    {
        return $id === 1 ? 'company-main' : 'company-' . $id;
    }

    private function templateCodeExists(string $code, int $companyId): bool
    {
        $builder = $this->templates->where('code', $code);
        if ($this->hasCompanyColumn('ingredient_templates')) {
            $builder->where('company_id', $companyId);
        }
        return (bool) $builder->first();
    }

    private function outletCode(int $id): string
    {
        return match ($id) {
            1 => 'outlet-main',
            2 => 'outlet-north',
            3 => 'outlet-south',
            default => 'outlet-' . $id,
        };
    }

    private function uiMovementType(string $type): string
    {
        return match ($type) {
            'opening_balance' => 'opening',
            'pos_usage' => 'sale',
            'production_usage' => 'production',
            default => $type,
        };
    }

    private function dateOrNull(?string $value): ?string
    {
        if (! $value) return null;
        $time = strtotime($value);
        return $time ? date('Y-m-d', $time) : null;
    }

    private function isoDate(?string $value): string
    {
        return $value ? date(DATE_ATOM, strtotime($value)) : date(DATE_ATOM);
    }

    private function hasCompanyColumn(string $table): bool
    {
        return $this->db->tableExists($table) && $this->db->fieldExists('company_id', $table);
    }

    private function withCompanyData(string $table, array $data, int $companyId): array
    {
        if ($this->hasCompanyColumn($table)) {
            $data['company_id'] = $companyId;
        } else {
            unset($data['company_id']);
        }

        return $data;
    }

    private function rowBelongsToCompany(array $row, int $companyId): bool
    {
        return ! array_key_exists('company_id', $row) || (int) $row['company_id'] === $companyId;
    }
}
