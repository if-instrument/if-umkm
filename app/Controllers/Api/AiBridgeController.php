<?php

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Services\ProductSuiteService;
use App\Services\SalesService;
use App\Services\InventoryService;
use App\Services\TenantDatabaseService;
use Config\Database;

class AiBridgeController extends BaseController
{

    protected $format = 'json';

    /**
     * Remote Application Tool Contract Execution Bridge.
     * Receives tool execution requests from Python AIService, verifies HMAC, and returns structured data.
     * Route: POST /api/ai/tool-execute
     */
    public function executeTool()
    {
        $apiKey = $this->request->getHeaderLine('X-API-Key');
        $expectedApiKey = (string) env('AI_SERVICE_API_KEY', 'pos_ai_secret_key_2026');
        if ($apiKey !== $expectedApiKey) {
            return $this->failUnauthorized('Invalid X-API-Key header');
        }

        $rawBody = (string) $this->request->getBody();
        $signature = $this->request->getHeaderLine('X-Signature');
        $hmacSecret = (string) env('AI_SERVICE_HMAC_SECRET', 'pos_ai_hmac_secret_2026');
        
        if ($signature !== '') {
            $expectedSig = hash_hmac('sha256', $rawBody, $hmacSecret);
            if (! hash_equals($expectedSig, $signature)) {
                return $this->failForbidden('HMAC signature verification failed');
            }
        }

        $payload = json_decode($rawBody, true) ?: [];
        $toolName = (string) ($payload['tool_name'] ?? '');
        $companyId = (string) ($payload['company_id'] ?? '');
        $arguments = (array) ($payload['arguments'] ?? []);

        if ($toolName === '') {
            return $this->failValidationError('Tool name is required');
        }

        // Connect to tenant DB context if company_id is provided
        $db = Database::connect();
        if ($companyId !== '') {
            $tenantService = new TenantDatabaseService();
            $company = $tenantService->rawCompanyBySlug($companyId);
            $dbName = (! empty($company['db_name'])) ? $company['db_name'] : 'if_umkm_ifresso_coffee';
            $db->setDatabase($dbName);
        }

        try {
            $data = [];
            switch ($toolName) {
                case 'get_product_list':
                    $data = $this->fetchProductList($db, $arguments);
                    break;
                case 'get_product_performance':
                    $data = $this->fetchProductPerformance($db, $arguments);
                    break;
                case 'get_sales_summary':
                    $data = $this->fetchSalesSummary($db, $arguments);
                    break;
                case 'get_inventory_status':
                    $data = $this->fetchInventoryStatus($db, $arguments);
                    break;
                case 'get_recipe_ingredients':
                    $data = $this->fetchRecipeIngredients($db, $arguments);
                    break;
                default:
                    return $this->failNotFound("Tool '{$toolName}' is not implemented on this application adapter.");
            }

            return $this->respond([
                'ok' => true,
                'tool_name' => $toolName,
                'company_id' => $companyId,
                'data' => $data,
            ]);
        } catch (\Throwable $e) {
            return $this->respond([
                'ok' => false,
                'tool_name' => $toolName,
                'error' => $e->getMessage(),
                'data' => [],
            ], 500);
        }
    }

    private function fetchProductPerformance($db, array $args): array
    {
        $search = trim((string) ($args['search'] ?? $args['product'] ?? ''));
        $limit = (int) ($args['limit'] ?? 10);

        if (! $db->tableExists('products')) {
            return [];
        }

        $hasOrderItems = $db->tableExists('order_items');

        $builder = $db->table('products p')
            ->select('p.id, p.sku, p.name as product_name, p.selling_price as price, p.status, c.name as category_name')
            ->join('product_outlet_categories poc', 'poc.product_id = p.id', 'left')
            ->join('categories c', 'c.id = poc.category_id', 'left')
            ->where('p.deleted_at', null);

        if ($search !== '') {
            $builder->like('p.name', $search);
        }

        $products = $builder->limit($limit)->get()->getResultArray();
        if (empty($products)) {
            return [];
        }

        return array_map(function ($r) use ($db, $hasOrderItems) {
            $price = (float) ($r['price'] ?? 0);

            $salesVol = 0;
            if ($hasOrderItems) {
                $salesRow = $db->table('order_items')
                    ->selectSum('qty', 'total_qty')
                    ->where('product_id', $r['id'])
                    ->get()
                    ->getRowArray();
                $salesVol = (int) ($salesRow['total_qty'] ?? 0);
            }

            return [
                'sku' => $r['sku'] ?? '',
                'product_name' => $r['product_name'] ?? '',
                'category' => ! empty($r['category_name']) ? $r['category_name'] : 'General',
                'selling_price' => $price,
                'sales_volume' => $salesVol,
            ];
        }, $products);
    }

    private function fetchSalesSummary($db, array $args): array
    {
        if ($db->tableExists('orders')) {
            $row = $db->table('orders')
                ->selectSum('grand_total', 'total_revenue')
                ->selectCount('id', 'total_orders')
                ->where('status !=', 'cancelled')
                ->get()
                ->getRowArray();

            $totalRevenue = (float) ($row['total_revenue'] ?? 0);
            $totalOrders = (int) ($row['total_orders'] ?? 0);
            $avgBasket = $totalOrders > 0 ? round($totalRevenue / $totalOrders) : 0;

            return [
                'period' => $args['period'] ?? '30d',
                'total_revenue' => $totalRevenue,
                'total_orders' => $totalOrders,
                'average_basket_size' => $avgBasket,
            ];
        }

        return [];
    }

    private function fetchInventoryStatus($db, array $args): array
    {
        $tableName = $db->tableExists('outlet_ingredients') ? 'outlet_ingredients' : ($db->tableExists('ingredients') ? 'ingredients' : '');

        if ($tableName !== '') {
            $rows = $db->table($tableName)
                ->select('name as item_name, category, stock_qty as current_stock, unit, minimum_stock as reorder_point, average_cost')
                ->where('deleted_at', null)
                ->limit(20)
                ->get()
                ->getResultArray();

            if (! empty($rows)) {
                return array_map(function ($r) {
                    $stock = (float) ($r['current_stock'] ?? 0);
                    $min = (float) ($r['reorder_point'] ?? 5);
                    $r['status'] = $stock <= $min ? 'LOW_STOCK' : 'NORMAL';
                    return $r;
                }, $rows);
            }
        }

        return [];
    }

    private function fetchRecipeIngredients($db, array $args): array
    {
        $tableName = $db->tableExists('outlet_ingredients') ? 'outlet_ingredients' : ($db->tableExists('ingredients') ? 'ingredients' : '');

        if ($tableName !== '') {
            $rows = $db->table($tableName)
                ->select('name as ingredient, category, stock_qty as stock, unit, average_cost as unit_cost')
                ->where('deleted_at', null)
                ->limit(20)
                ->get()
                ->getResultArray();

            if (! empty($rows)) {
                return array_map(function ($r) {
                    $r['available_stock'] = ($r['stock'] ?? '0') . ' ' . ($r['unit'] ?? '');
                    $r['unit_cost'] = (float) ($r['unit_cost'] ?? 0);
                    return $r;
                }, $rows);
            }
        }

        return [];
    }

    private function fetchProductList($db, array $args): array
    {
        $search = trim((string) ($args['search'] ?? ''));
        $limit = (int) ($args['limit'] ?? 20);

        if (! $db->tableExists('products')) {
            return [];
        }

        $builder = $db->table('products p')
            ->select('p.id, p.sku, p.name as product_name, p.selling_price as price, p.status, c.name as category_name')
            ->join('product_outlet_categories poc', 'poc.product_id = p.id', 'left')
            ->join('categories c', 'c.id = poc.category_id', 'left')
            ->where('p.deleted_at', null);

        if ($search !== '') {
            $builder->like('p.name', $search);
        }

        $rows = $builder->limit($limit)->get()->getResultArray();

        return array_map(function ($r) {
            $st = ($r['status'] ?? '10') === '10' ? 'ACTIVE' : 'INACTIVE';
            $price = (float) ($r['price'] ?? 0);
            return [
                'sku' => ! empty($r['sku']) ? $r['sku'] : ('PRD-' . str_pad($r['id'] ?? 1, 4, '0', STR_PAD_LEFT)),
                'product_name' => $r['product_name'] ?? 'Produk',
                'category' => ! empty($r['category_name']) ? $r['category_name'] : 'General',
                'price' => $price,
                'status' => $st,
            ];
        }, $rows);
    }
}
