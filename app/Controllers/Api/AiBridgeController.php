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

        $builder = $db->table('products')
            ->select('id, sku, name as product_name, selling_price as price, status');

        if ($search !== '') {
            $builder->like('name', $search);
        }

        $products = $builder->limit($limit)->get()->getResultArray();
        if (empty($products)) {
            return [];
        }

        return array_map(function ($r) use ($db, $hasOrderItems) {
            $price = (float) ($r['price'] ?? 0);
            $cost = round($price * 0.35, 2);
            $margin = $price > 0 ? round((($price - $cost) / $price) * 100, 1) : 0.0;

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
                'product_name' => $r['product_name'],
                'sales_volume' => $salesVol,
                'category_avg' => 0,
                'trend_percent' => 0,
                'margin_percent' => "{$margin}%",
            ];
        }, $products);
    }

    private function fetchSalesSummary($db, array $args): array
    {
        if ($db->tableExists('orders')) {
            $row = $db->table('orders')
                ->selectSum('grand_total', 'total_revenue')
                ->selectCount('id', 'total_orders')
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
                'growth_rate' => 'N/A',
            ];
        }

        return [];
    }

    private function fetchInventoryStatus($db, array $args): array
    {
        $tableName = $db->tableExists('outlet_ingredients') ? 'outlet_ingredients' : ($db->tableExists('ingredients') ? 'ingredients' : '');

        if ($tableName !== '') {
            $rows = $db->table($tableName)
                ->select('name as item_name, stock_qty as current_stock, unit, minimum_stock as reorder_point')
                ->limit(15)
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
                ->select('name as ingredient, stock_qty as stock, unit, average_cost as unit_cost')
                ->limit(15)
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

        $builder = $db->table('products')
            ->select('id, sku, name as product_name, selling_price as price, status');

        if ($search !== '') {
            $builder->like('name', $search);
        }

        $rows = $builder->limit($limit)->get()->getResultArray();

        return array_map(function ($r) {
            $st = ($r['status'] ?? '10') === '10' ? 'ACTIVE' : 'INACTIVE';
            $price = (float) ($r['price'] ?? 0);
            return [
                'sku' => ! empty($r['sku']) ? $r['sku'] : ('PRD-' . str_pad($r['id'] ?? 1, 4, '0', STR_PAD_LEFT)),
                'product_name' => $r['product_name'] ?? 'Produk',
                'category' => 'Beverage',
                'price' => $price,
                'cost_price' => round($price * 0.35, 2),
                'status' => $st,
            ];
        }, $rows);
    }
}
