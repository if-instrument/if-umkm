<?php

namespace App\Services;

use App\Models\OrderItemModel;
use App\Models\OrderModel;
use App\Models\SalesModel;
use App\Models\StockMovementModel;
use Config\Database;

class SalesService
{
    public const STATUS_PENDING_CASHIER = StatusCodeService::ORDER_PENDING_CASHIER;
    public const STATUS_WAITING = StatusCodeService::ORDER_WAITING;
    public const STATUS_PREPARING = StatusCodeService::ORDER_PREPARING;
    public const STATUS_READY = StatusCodeService::ORDER_READY;
    public const STATUS_COMPLETED = StatusCodeService::ORDER_COMPLETED;
    public const STATUS_CANCELLED = StatusCodeService::ORDER_CANCELLED;

    private $db;
    private SalesModel $sales;
    private OrderModel $orders;
    private OrderItemModel $orderItems;
    private StockMovementModel $movements;
    private ProductSuiteService $products;
    private InventoryService $inventory;
    private SettingsService $settings;
    private PaymentGatewayService $payments;
    private OrderNotificationService $notifications;

    public function __construct()
    {
        $this->db = Database::connect();
        $this->sales = new SalesModel();
        $this->orders = new OrderModel();
        $this->orderItems = new OrderItemModel();
        $this->movements = new StockMovementModel();
        $this->products = new ProductSuiteService();
        $this->inventory = new InventoryService();
        $this->settings = new SettingsService();
        $this->payments = new PaymentGatewayService();
        $this->notifications = new OrderNotificationService();
    }

    public function data(int $companyId, int $outletId): array
    {
        $productData = $this->products->data($companyId, $outletId);
        $inventoryData = $this->inventory->data($companyId, $outletId);
        $orders = $this->sales->orders($companyId, $outletId);
        $items = $this->sales->orderItems(array_column($orders, 'id'));

        return [
            'settings' => $this->settings->data($companyId, $outletId),
            'categories' => $productData['categories'],
            'products' => $productData['products'],
            'modifiers' => $productData['modifiers'],
            'ingredients' => $inventoryData['ingredients'],
            'stockMovements' => $inventoryData['stockMovements'],
            'transactions' => array_map(fn ($order) => $this->orderPayload($order, $items), $orders),
        ];
    }

    public function orderPage(int $companyId, int $outletId, array $filters = []): array
    {
        $orders = $this->sales->orders($companyId, $outletId, $filters);
        if (($filters['status'] ?? '') !== '') {
            $filterStatus = $this->normalizeStatus((string) $filters['status']);
            $orders = array_values(array_filter($orders, fn ($order) => $this->normalizeStatus((string) ($order['status'] ?? '')) === $filterStatus));
        }
        if (($filters['payment_status'] ?? '') !== '') {
            $filterPaymentStatus = StatusCodeService::payment((string) $filters['payment_status']);
            $orders = array_values(array_filter($orders, fn ($order) => StatusCodeService::payment($order['payment_status'] ?? '') === $filterPaymentStatus));
        }
        if (($filters['date'] ?? '') !== '' && ! filter_var($filters['include_open'] ?? $filters['includeOpen'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            $orders = array_values(array_filter($orders, fn ($order) => str_starts_with((string) $order['created_at'], (string) $filters['date'])));
        }
        $items = $this->sales->orderItems(array_column($orders, 'id'));
        $payloads = array_map(fn ($order) => $this->orderPayload($order, $items), $orders);
        return $this->arrayPage($payloads, $filters);
    }

    public function orderDetail(string $legacyId, int $companyId, int $outletId): array
    {
        $orderId = $this->orderId($legacyId);
        $order = $orderId ? $this->orders->find($orderId) : null;
        if (! $order || ! $this->rowBelongsToCompany($order, $companyId) || (int) $order['outlet_id'] !== $outletId) {
            throw new \InvalidArgumentException('Pesanan tidak ditemukan.');
        }
        return $this->orderPayload($order, $this->sales->orderItems([$orderId]));
    }

    public function saveOrder(array $payload, int $companyId, int $outletId): array
    {
        $orderId = $this->orderId($payload['id'] ?? '');
        return $orderId
            ? $this->updateOrder($orderId, $payload, $companyId, $outletId)
            : $this->createOrder($payload, $companyId, $outletId);
    }

    public function updateStatus(string $legacyId, string $status, int $companyId, int $outletId): array
    {
        $orderId = $this->orderId($legacyId);
        $order = $orderId ? $this->orders->find($orderId) : null;
        if (! $order || ! $this->rowBelongsToCompany($order, $companyId) || (int) $order['outlet_id'] !== $outletId) {
            throw new \InvalidArgumentException('Pesanan tidak ditemukan.');
        }

        $previousStatus = $this->normalizeStatus((string) ($order['status'] ?? ''));
        $status = $this->normalizeStatus($status);
        if ($previousStatus === self::STATUS_PENDING_CASHIER && $status === self::STATUS_WAITING) {
            throw new \InvalidArgumentException('Approve pesanan online wajib melalui proses pembayaran kasir.');
        }
        $data = [
            'status' => $status,
            'status_updated_at' => date('Y-m-d H:i:s'),
        ];
        if ($status === self::STATUS_COMPLETED && ! StatusCodeService::isUnpaid($order['payment_status'] ?? '')) {
            $data['paid_at'] = $order['paid_at'] ?: date('Y-m-d H:i:s');
        }
        $this->orders->update($orderId, $data);

        return $this->orderDetail((string) $orderId, $companyId, $outletId);
    }

    public function readyItems(string $legacyId, array $keys, int $companyId, int $outletId): array
    {
        $orderId = $this->orderId($legacyId);
        $order = $orderId ? $this->orders->find($orderId) : null;
        if (! $order || ! $this->rowBelongsToCompany($order, $companyId) || (int) $order['outlet_id'] !== $outletId) {
            throw new \InvalidArgumentException('Pesanan tidak ditemukan.');
        }
        $this->orders->update($orderId, ['ready_item_keys' => json_encode(array_values($keys))]);

        return $this->orderDetail((string) $orderId, $companyId, $outletId);
    }

    public function settle(string $legacyId, string $paymentMethod, int $companyId, int $outletId, array $payment = []): array
    {
        $orderId = $this->orderId($legacyId);
        $order = $orderId ? $this->orders->find($orderId) : null;
        if (! $order || ! $this->rowBelongsToCompany($order, $companyId) || (int) $order['outlet_id'] !== $outletId) {
            throw new \InvalidArgumentException('Pesanan tidak ditemukan.');
        }

        $now = date('Y-m-d H:i:s');
        if ($this->normalizeStatus((string) ($order['status'] ?? '')) === self::STATUS_PENDING_CASHIER) {
            $items = $this->orderItemPayloads($this->orderItems->where('order_id', $orderId)->findAll());
            $this->applyUsageDiff([], $items, $companyId, $outletId, $orderId, $order['order_no']);
        }
        $this->orders->update($orderId, [
            'payment_status' => StatusCodeService::PAYMENT_PAID,
            'payment_method' => $paymentMethod ?: 'Settlement',
            'cash_tendered' => (float) ($payment['cashTendered'] ?? 0),
            'change_due' => (float) ($payment['changeDue'] ?? 0),
            'payment_provider' => $payment['provider'] ?? null,
            'payment_reference' => $payment['reference'] ?? null,
            'paid_at' => $now,
            'status' => self::STATUS_COMPLETED,
            'status_updated_at' => $now,
        ]);
        if (! empty($payment['transactionId'])) {
            $this->payments->attachOrder((string) $payment['transactionId'], $orderId, $companyId, $outletId);
        }

        $detail = $this->orderDetail((string) $orderId, $companyId, $outletId);
        $this->notifyPaidOrder($orderId);
        return $detail;
    }

    public function approvePendingOrder(string $legacyId, string $paymentMethod, int $companyId, int $outletId, array $payment = []): array
    {
        $orderId = $this->orderId($legacyId);
        $order = $orderId ? $this->orders->find($orderId) : null;
        if (! $order || ! $this->rowBelongsToCompany($order, $companyId) || (int) $order['outlet_id'] !== $outletId) {
            throw new \InvalidArgumentException('Pesanan tidak ditemukan.');
        }
        if ($this->normalizeStatus((string) ($order['status'] ?? '')) !== self::STATUS_PENDING_CASHIER) {
            throw new \InvalidArgumentException('Hanya pesanan menunggu approve kasir yang bisa di-approve.');
        }

        $items = $this->orderItemPayloads($this->orderItems->where('order_id', $orderId)->findAll());
        $now = date('Y-m-d H:i:s');
        $this->db->transStart();
        $this->applyUsageDiff([], $items, $companyId, $outletId, $orderId, $order['order_no']);
        $this->orders->update($orderId, [
            'payment_status' => StatusCodeService::PAYMENT_PAID,
            'payment_method' => $paymentMethod ?: 'Cash',
            'cash_tendered' => (float) ($payment['cashTendered'] ?? 0),
            'change_due' => (float) ($payment['changeDue'] ?? 0),
            'payment_provider' => $payment['provider'] ?? null,
            'payment_reference' => $payment['reference'] ?? null,
            'paid_at' => $now,
            'status' => self::STATUS_WAITING,
            'status_updated_at' => $now,
        ]);
        if (! empty($payment['transactionId'])) {
            $this->payments->attachOrder((string) $payment['transactionId'], $orderId, $companyId, $outletId);
        }
        $this->db->transComplete();

        $detail = $this->orderDetail((string) $orderId, $companyId, $outletId);
        $this->notifyPaidOrder($orderId);
        return $detail;
    }

    public function moveTable(string $legacyId, string $tableName, int $companyId, int $outletId): array
    {
        $orderId = $this->orderId($legacyId);
        $order = $orderId ? $this->orders->find($orderId) : null;
        if (! $order || ! $this->rowBelongsToCompany($order, $companyId) || (int) $order['outlet_id'] !== $outletId) {
            throw new \InvalidArgumentException('Pesanan tidak ditemukan.');
        }
        $this->orders->update($orderId, ['table_name' => $tableName, 'status_updated_at' => date('Y-m-d H:i:s')]);

        return $this->orderDetail((string) $orderId, $companyId, $outletId);
    }

    private function createOrder(array $payload, int $companyId, int $outletId): array
    {
        $now = date('Y-m-d H:i:s');
        $items = $payload['items'] ?? [];
        $initialStatus = $this->normalizeStatus((string) ($payload['initialStatus'] ?? self::STATUS_WAITING));
        $initialStatus = in_array($initialStatus, [self::STATUS_PENDING_CASHIER, self::STATUS_WAITING], true)
            ? $initialStatus
            : self::STATUS_WAITING;

        $this->db->transStart();
        $orderId = (int) $this->orders->insert($this->withCompanyData('orders', [
            'outlet_id' => $outletId,
            'order_no' => $payload['orderNumber'] ?? $this->nextOrderNumber($companyId, $outletId),
            'service_type' => $payload['serviceType'] ?? 'Dine In',
            'customer_name' => $payload['customerName'] ?? null,
            'customer_email' => $payload['customerEmail'] ?? null,
            'customer_phone' => $payload['customerPhone'] ?? null,
            'customer_member_id' => $payload['customerMemberId'] ?? null,
            'table_name' => $payload['tableName'] ?? '-',
            'table_flow' => $payload['tableFlow'] ?? null,
            'status' => $initialStatus,
            'status_updated_at' => $now,
            'ready_item_keys' => json_encode([]),
            'payment_status' => StatusCodeService::payment($payload['paymentStatus'] ?? 'paid', StatusCodeService::PAYMENT_PAID),
            'payment_method' => $payload['paymentMethod'] ?? null,
            'cash_tendered' => (float) ($payload['cashTendered'] ?? 0),
            'change_due' => (float) ($payload['changeDue'] ?? 0),
            'payment_provider' => $payload['paymentProvider'] ?? null,
            'payment_reference' => $payload['paymentReference'] ?? null,
            'paid_at' => StatusCodeService::isPaid($payload['paymentStatus'] ?? 'paid') ? $now : null,
            'subtotal' => (float) ($payload['productRevenue'] ?? 0),
            'packaging_fee' => (float) ($payload['packagingFee'] ?? 0),
            'payment_fee' => (float) ($payload['paymentFee'] ?? 0),
            'payment_fee_payer' => in_array(($payload['paymentFeePayer'] ?? 'merchant'), ['customer', 'merchant'], true) ? $payload['paymentFeePayer'] : 'merchant',
            'tax_total' => (float) ($payload['tax'] ?? 0),
            'grand_total' => (float) ($payload['total'] ?? 0),
            'cogs_total' => (float) ($payload['cogs'] ?? 0),
            'gross_profit' => (float) ($payload['profit'] ?? 0),
            'packaging_source' => $payload['packagingSource'] ?? null,
            'packaging_note' => $payload['packagingNote'] ?? null,
            'last_order_added_at' => $now,
        ], $companyId));
        $this->insertItems($orderId, $items);
        if ($initialStatus !== self::STATUS_PENDING_CASHIER) {
            $this->applyUsageDiff([], $items, $companyId, $outletId, $orderId, $payload['orderNumber'] ?? '');
        }
        if (! empty($payload['paymentTransactionId'])) {
            $this->payments->attachOrder((string) $payload['paymentTransactionId'], $orderId, $companyId, $outletId);
        }
        $this->db->transComplete();

        $detail = $this->orderDetail((string) $orderId, $companyId, $outletId);
        if (StatusCodeService::isPaid($payload['paymentStatus'] ?? 'paid')) {
            $this->notifyPaidOrder($orderId);
        }
        return $detail;
    }

    private function updateOrder(int $orderId, array $payload, int $companyId, int $outletId): array
    {
        $order = $this->orders->find($orderId);
        if (! $order || ! $this->rowBelongsToCompany($order, $companyId) || (int) $order['outlet_id'] !== $outletId) {
            throw new \InvalidArgumentException('Pesanan tidak ditemukan.');
        }
        $currentStatus = $this->normalizeStatus((string) ($order['status'] ?? ''));
        if (! StatusCodeService::isUnpaid($order['payment_status'] ?? '') || ! in_array($currentStatus, [self::STATUS_PENDING_CASHIER, self::STATUS_WAITING], true)) {
            throw new \InvalidArgumentException('Pesanan hanya bisa diedit saat masih baru dan belum dibayar.');
        }

        $oldItems = $currentStatus === self::STATUS_PENDING_CASHIER
            ? []
            : $this->orderItemPayloads($this->orderItems->where('order_id', $orderId)->findAll());
        $items = $payload['items'] ?? [];
        $now = date('Y-m-d H:i:s');

        $this->db->transStart();
        $this->orderItems->where('order_id', $orderId)->delete();
        $this->insertItems($orderId, $items);
        if ($currentStatus !== self::STATUS_PENDING_CASHIER) {
            $this->applyUsageDiff($oldItems, $items, $companyId, $outletId, $orderId, $order['order_no']);
        }
        $this->orders->update($orderId, [
            'service_type' => $payload['serviceType'] ?? $order['service_type'],
            'customer_name' => $payload['customerName'] ?? $order['customer_name'],
            'customer_email' => $payload['customerEmail'] ?? ($order['customer_email'] ?? null),
            'customer_phone' => $payload['customerPhone'] ?? ($order['customer_phone'] ?? null),
            'customer_member_id' => $payload['customerMemberId'] ?? ($order['customer_member_id'] ?? null),
            'table_name' => $payload['tableName'] ?? $order['table_name'],
            'table_flow' => $payload['tableFlow'] ?? $order['table_flow'],
            'status' => $currentStatus,
            'status_updated_at' => $now,
            'ready_item_keys' => json_encode([]),
            'subtotal' => (float) ($payload['productRevenue'] ?? 0),
            'packaging_fee' => (float) ($payload['packagingFee'] ?? 0),
            'payment_fee' => (float) ($payload['paymentFee'] ?? 0),
            'payment_fee_payer' => in_array(($payload['paymentFeePayer'] ?? ($order['payment_fee_payer'] ?? 'merchant')), ['customer', 'merchant'], true) ? ($payload['paymentFeePayer'] ?? ($order['payment_fee_payer'] ?? 'merchant')) : 'merchant',
            'tax_total' => (float) ($payload['tax'] ?? 0),
            'grand_total' => (float) ($payload['total'] ?? 0),
            'cogs_total' => (float) ($payload['cogs'] ?? 0),
            'gross_profit' => (float) ($payload['profit'] ?? 0),
            'packaging_source' => $payload['packagingSource'] ?? null,
            'packaging_note' => $payload['packagingNote'] ?? null,
            'last_order_added_at' => $now,
        ]);
        $this->db->transComplete();

        return $this->orderDetail((string) $orderId, $companyId, $outletId);
    }

    private function insertItems(int $orderId, array $items): void
    {
        foreach ($items as $item) {
            $snapshot = $item;
            $productId = ! empty($item['isPackaging']) ? null : $this->productId($item['productId'] ?? '');
            $this->orderItems->insert([
                'order_id' => $orderId,
                'product_id' => $productId,
                'product_name' => $item['name'] ?? 'Item',
                'qty' => (float) ($item['qty'] ?? 0),
                'unit_price' => (float) ($item['price'] ?? 0),
                'line_total' => (float) ($item['price'] ?? 0) * (float) ($item['qty'] ?? 0),
                'cogs_total' => (float) ($item['cogs'] ?? 0) * (float) ($item['qty'] ?? 0),
                'modifier_snapshot' => json_encode($snapshot),
                'recipe_snapshot' => json_encode($item['recipeUsage'] ?? []),
            ]);
        }
    }

    private function notifyPaidOrder(int $orderId): void
    {
        try {
            $this->notifications->sendPaidOrderEmail($orderId);
        } catch (\Throwable) {
            // Notification failure must not rollback or block POS operations.
        }
    }

    private function applyUsageDiff(array $oldItems, array $newItems, int $companyId, int $outletId, int $orderId, string $orderNo): void
    {
        $oldUsage = $this->ingredientUsageMap($oldItems, $companyId, $outletId);
        $newUsage = $this->ingredientUsageMap($newItems, $companyId, $outletId);
        $ingredientIds = array_unique(array_merge(array_keys($oldUsage), array_keys($newUsage)));

        foreach ($ingredientIds as $legacyIngredientId) {
            $ingredientId = $this->ingredientId($legacyIngredientId);
            if (! $ingredientId) continue;
            $delta = ($newUsage[$legacyIngredientId] ?? 0) - ($oldUsage[$legacyIngredientId] ?? 0);
            if (abs($delta) < 0.0001) continue;
            if ($delta > 0) {
                $this->inventory->reduceStock([
                    'company_id' => $companyId,
                    'outlet_id' => $outletId,
                    'outlet_ingredient_id' => $ingredientId,
                    'qty' => $delta,
                    'movement_type' => 'pos_usage',
                    'reference_type' => 'order',
                    'reference_id' => $orderId,
                    'notes' => 'Pemakaian POS #' . $orderNo,
                ]);
            } else {
                $this->restoreStock($ingredientId, abs($delta), $companyId, $outletId, $orderId, $orderNo);
            }
        }

        $oldProducts = $this->finishedProductUsageMap($oldItems, $companyId, $outletId);
        $newProducts = $this->finishedProductUsageMap($newItems, $companyId, $outletId);
        foreach (array_unique(array_merge(array_keys($oldProducts), array_keys($newProducts))) as $productId) {
            $delta = ($newProducts[$productId] ?? 0) - ($oldProducts[$productId] ?? 0);
            if (abs($delta) < 0.0001) continue;
            if ($delta > 0) {
                $this->consumeProductBatches((int) $productId, $companyId, $outletId, $delta, $orderId, $orderNo);
            } else {
                $this->restoreProductBatch((int) $productId, $companyId, $outletId, abs($delta), $orderId, $orderNo);
            }
        }
    }

    private function restoreStock(int $ingredientId, float $qty, int $companyId, int $outletId, int $orderId, string $orderNo): void
    {
        $ingredient = $this->db->table('outlet_ingredients')->where('id', $ingredientId)->get()->getRowArray();
        if (! $ingredient) return;
        $before = (float) $ingredient['stock_qty'];
        $after = $before + $qty;
        $unitCost = (float) $ingredient['average_cost'];
        $this->db->table('outlet_ingredients')->where('id', $ingredientId)->update(['stock_qty' => $after]);
        $this->movements->insert($this->withCompanyData('stock_movements', [
            'outlet_id' => $outletId,
            'outlet_ingredient_id' => $ingredientId,
            'movement_type' => 'sale_edit',
            'reference_type' => 'order',
            'reference_id' => $orderId,
            'stock_before' => $before,
            'qty_in' => $qty,
            'qty_out' => 0,
            'stock_after' => $after,
            'unit_cost' => $unitCost,
            'total_cost' => $qty * $unitCost,
            'notes' => 'Restock dari edit pesanan #' . $orderNo,
        ], $companyId));
    }

    private function ingredientUsageMap(array $items, int $companyId, int $outletId): array
    {
        $usage = [];
        foreach ($items as $item) {
            $productId = $this->productId($item['productId'] ?? null);
            if ($productId && $this->isStockedProduct($productId, $companyId, $outletId)) continue;
            foreach (($item['recipeUsage'] ?? []) as $line) {
                $ingredientId = $line['ingredientId'] ?? '';
                if (! $ingredientId) continue;
                $usage[$ingredientId] = ($usage[$ingredientId] ?? 0) + (float) ($line['qty'] ?? 0);
            }
        }
        return $usage;
    }

    private function finishedProductUsageMap(array $items, int $companyId, int $outletId): array
    {
        $usage = [];
        foreach ($items as $item) {
            if (! empty($item['isPackaging'])) continue;
            $productId = $this->productId($item['productId'] ?? null);
            if (! $productId || ! $this->isStockedProduct($productId, $companyId, $outletId)) continue;
            $usage[$productId] = ($usage[$productId] ?? 0) + (float) ($item['qty'] ?? 0);
        }
        return $usage;
    }

    private function isStockedProduct(int $productId, int $companyId, int $outletId): bool
    {
        $builder = $this->db->table('products')
            ->where('id', $productId)
            ->groupStart()
                ->where('outlet_id', $outletId)
                ->orWhere('outlet_id', null)
            ->groupEnd()
        ;
        if ($this->hasCompanyColumn('products')) {
            $builder->where('company_id', $companyId);
        }
        $row = $builder->get()->getRowArray();
        return in_array(($row['inventory_type'] ?? 'made_to_order'), ['finished_good', 'retail'], true);
    }

    private function consumeProductBatches(int $productId, int $companyId, int $outletId, float $qty, int $orderId, string $orderNo): void
    {
        if (! $this->db->tableExists('product_batches')) throw new \InvalidArgumentException('Tabel batch produk belum tersedia.');
        $remaining = $qty;
        $lotBuilder = $this->db->table('product_batches')
            ->where('outlet_id', $outletId)
            ->where('product_id', $productId)
            ->whereIn('status', [StatusCodeService::ACTIVE, 'active'])
            ->where('qty_remaining >', 0)
            ->orderBy('expired_at IS NULL', 'ASC', false)
            ->orderBy('expired_at', 'ASC')
            ->orderBy('created_at', 'ASC');
        if ($this->hasCompanyColumn('product_batches')) {
            $lotBuilder->where('company_id', $companyId);
        }
        $lots = $lotBuilder->get()->getResultArray();

        foreach ($lots as $lot) {
            if ($remaining <= 0) break;
            $before = (float) $lot['qty_remaining'];
            $take = min($remaining, $before);
            $nextQty = $before - $take;
            $unitCost = (float) ($lot['unit_cost'] ?? 0);
            $now = date('Y-m-d H:i:s');
            $this->db->table('product_batches')->where('id', $lot['id'])->update([
                'qty_remaining' => $nextQty,
                'status' => $nextQty <= 0.0001 ? 'depleted' : $lot['status'],
                'updated_at' => $now,
                'notes' => trim((string) ($lot['notes'] ?? '') . "\nPOS #{$orderNo}: -{$take}"),
            ]);
            if ($this->db->tableExists('product_batch_movements')) {
                $this->db->table('product_batch_movements')->insert($this->withCompanyData('product_batch_movements', [
                    'outlet_id' => $outletId,
                    'product_id' => $productId,
                    'product_batch_id' => (int) $lot['id'],
                    'movement_type' => 'sale',
                    'stock_before' => $before,
                    'qty_in' => 0,
                    'qty_out' => $take,
                    'stock_after' => $nextQty,
                    'unit_cost' => $unitCost,
                    'total_cost' => $take * $unitCost,
                    'notes' => 'Pemakaian POS #' . $orderNo,
                    'created_at' => $now,
                    'updated_at' => $now,
                ], $companyId));
            }
            $remaining -= $take;
        }

        if ($remaining > 0.0001) {
            throw new \InvalidArgumentException('Stok produk jadi tidak cukup untuk order #' . $orderNo . '.');
        }
    }

    private function restoreProductBatch(int $productId, int $companyId, int $outletId, float $qty, int $orderId, string $orderNo): void
    {
        if (! $this->db->tableExists('product_batches')) return;
        $now = date('Y-m-d H:i:s');
        $rowBuilder = $this->db->table('product_batches')
            ->where('outlet_id', $outletId)
            ->where('product_id', $productId)
            ->orderBy('created_at', 'DESC');
        if ($this->hasCompanyColumn('product_batches')) {
            $rowBuilder->where('company_id', $companyId);
        }
        $row = $rowBuilder->get()->getRowArray();

        if ($row) {
            $before = (float) $row['qty_remaining'];
            $after = $before + $qty;
            $unitCost = (float) ($row['unit_cost'] ?? 0);
            $this->db->table('product_batches')->where('id', $row['id'])->update([
                'qty_remaining' => $after,
                'status' => 'active',
                'updated_at' => $now,
                'notes' => trim((string) ($row['notes'] ?? '') . "\nRestock edit POS #{$orderNo}: +{$qty}"),
            ]);
            if ($this->db->tableExists('product_batch_movements')) {
                $this->db->table('product_batch_movements')->insert($this->withCompanyData('product_batch_movements', [
                    'outlet_id' => $outletId,
                    'product_id' => $productId,
                    'product_batch_id' => (int) $row['id'],
                    'movement_type' => 'sale_edit',
                    'stock_before' => $before,
                    'qty_in' => $qty,
                    'qty_out' => 0,
                    'stock_after' => $after,
                    'unit_cost' => $unitCost,
                    'total_cost' => $qty * $unitCost,
                    'notes' => 'Restock edit POS #' . $orderNo,
                    'created_at' => $now,
                    'updated_at' => $now,
                ], $companyId));
            }
            return;
        }

        $this->db->table('product_batches')->insert($this->withCompanyData('product_batches', [
            'outlet_id' => $outletId,
            'product_id' => $productId,
            'batch_no' => 'RESTOCK-' . date('YmdHis') . '-' . $productId,
            'qty_initial' => $qty,
            'qty_remaining' => $qty,
            'unit_cost' => 0,
            'manufactured_at' => date('Y-m-d'),
            'expired_at' => null,
            'status' => 'active',
            'notes' => 'Restock dari edit POS #' . $orderNo,
            'created_at' => $now,
            'updated_at' => $now,
        ], $companyId));
        $batchId = (int) $this->db->insertID();
        if ($this->db->tableExists('product_batch_movements')) {
            $this->db->table('product_batch_movements')->insert($this->withCompanyData('product_batch_movements', [
                'outlet_id' => $outletId,
                'product_id' => $productId,
                'product_batch_id' => $batchId,
                'movement_type' => 'sale_edit',
                'stock_before' => 0,
                'qty_in' => $qty,
                'qty_out' => 0,
                'stock_after' => $qty,
                'unit_cost' => 0,
                'total_cost' => 0,
                'notes' => 'Restock dari edit POS #' . $orderNo,
                'created_at' => $now,
                'updated_at' => $now,
            ], $companyId));
        }
    }

    private function orderPayload(array $order, array $items): array
    {
        $status = $this->normalizeStatus((string) ($order['status'] ?? self::STATUS_WAITING));
        $orderItems = $this->orderItemPayloads(array_values(array_filter($items, fn ($item) => (int) $item['order_id'] === (int) $order['id'])));
        $productRevenue = array_sum(array_map(fn ($item) => empty($item['isPackaging']) ? (float) $item['price'] * (float) $item['qty'] : 0, $orderItems));
        $packagingFee = (float) $order['packaging_fee'];
        $tax = (float) $order['tax_total'];
        $serviceCharge = max(0, (float) $order['grand_total'] - $productRevenue - $packagingFee - $tax);

        return [
            'id' => 'ord-' . $order['id'],
            'companyId' => $this->companyCode((int) ($order['company_id'] ?? 1)),
            'outletId' => $this->outletCode((int) $order['outlet_id']),
            'orderNumber' => $order['order_no'],
            'createdAt' => $this->isoDate($order['created_at']),
            'statusUpdatedAt' => $this->isoDate($order['status_updated_at'] ?? $order['updated_at'] ?? $order['created_at']),
            'status' => $status,
            'readyItemKeys' => json_decode($order['ready_item_keys'] ?: '[]', true) ?: [],
            'serviceType' => $order['service_type'],
            'tableFlow' => $order['table_flow'] ?: '',
            'tableName' => $order['table_name'] ?: '-',
            'customerName' => $order['customer_name'] ?: '',
            'customerEmail' => $order['customer_email'] ?? '',
            'customerPhone' => $order['customer_phone'] ?? '',
            'customerMemberId' => $order['customer_member_id'] ?? null,
            'items' => $orderItems,
            'lastOrderItems' => $orderItems,
            'productRevenue' => $productRevenue,
            'serviceCharge' => $serviceCharge,
            'packagingFee' => $packagingFee,
            'paymentFee' => (float) ($order['payment_fee'] ?? 0),
            'paymentFeePayer' => $order['payment_fee_payer'] ?? 'merchant',
            'packagingSource' => $order['packaging_source'] ?? '',
            'packagingNote' => $order['packaging_note'] ?? '',
            'revenue' => (float) $order['grand_total'] - $tax,
            'cogs' => (float) $order['cogs_total'],
            'profit' => (float) $order['gross_profit'],
            'tax' => $tax,
            'total' => (float) $order['grand_total'],
            'paymentStatus' => StatusCodeService::payment($order['payment_status'] ?? ''),
            'paidAt' => $this->isoDate($order['paid_at'] ?? null),
            'paymentMethod' => $order['payment_method'] ?: (StatusCodeService::isPaid($order['payment_status'] ?? '') ? 'Cash' : 'Belum dibayar'),
            'cashTendered' => (float) ($order['cash_tendered'] ?? 0),
            'changeDue' => (float) ($order['change_due'] ?? 0),
            'paymentProvider' => $order['payment_provider'] ?? '',
            'paymentReference' => $order['payment_reference'] ?? '',
        ];
    }

    private function normalizeStatus(string $status): string
    {
        return StatusCodeService::order($status, self::STATUS_WAITING);
    }

    private function orderItemPayloads(array $items): array
    {
        return array_map(function ($item) {
            $snapshot = json_decode($item['modifier_snapshot'] ?: '{}', true) ?: [];
            $isPackaging = (bool) ($snapshot['isPackaging'] ?? false);
            return [
                'productId' => $isPackaging ? '' : ($snapshot['productId'] ?? $this->productCode((int) $item['product_id'])),
                'name' => $item['product_name'],
                'qty' => (float) $item['qty'],
                'price' => (float) $item['unit_price'],
                'cogs' => (float) $item['qty'] > 0 ? (float) $item['cogs_total'] / (float) $item['qty'] : 0,
                'modifierIds' => $snapshot['modifierIds'] ?? [],
                'modifiers' => $snapshot['modifiers'] ?? [],
                'isPackaging' => $isPackaging,
                'ingredientId' => $snapshot['ingredientId'] ?? '',
                'treatment' => $snapshot['treatment'] ?? '',
                'reason' => $snapshot['reason'] ?? '',
                'lossCost' => (float) ($snapshot['lossCost'] ?? 0),
                'recipeUsage' => json_decode($item['recipe_snapshot'] ?: '[]', true) ?: ($snapshot['recipeUsage'] ?? []),
            ];
        }, $items);
    }

    private function nextOrderNumber(int $companyId, int $outletId): string
    {
        $count = $this->orders->where('outlet_id', $outletId);
        if ($this->hasCompanyColumn('orders')) {
            $count->where('company_id', $companyId);
        }
        $count = $count->countAllResults();
        return 'POS-' . str_pad((string) ($count + 1), 5, '0', STR_PAD_LEFT);
    }

    private function orderId(string|int|null $value): ?int
    {
        if (! $value) return null;
        if (is_numeric($value)) return (int) $value;
        if (preg_match('/^ord-(\d+)$/', (string) $value, $m)) return (int) $m[1];
        return null;
    }

    private function productId(string|int|null $value): ?int
    {
        if (! $value) return null;
        if (is_numeric($value)) return (int) $value;
        if (preg_match('/^prd-(\d+)$/', (string) $value, $m)) return (int) $m[1];
        return null;
    }

    private function ingredientId(string|int|null $value): ?int
    {
        if (! $value) return null;
        if (is_numeric($value)) return (int) $value;
        if (preg_match('/^ing-(\d+)$/', (string) $value, $m)) return (int) $m[1];
        return null;
    }

    private function productCode(int $id): string { return 'prd-' . $id; }
    private function companyCode(int $id): string { return $id === 1 ? 'company-main' : 'company-' . $id; }
    private function outletCode(int $id): string { return match ($id) { 1 => 'outlet-main', 2 => 'outlet-north', 3 => 'outlet-south', default => 'outlet-' . $id }; }
    private function isoDate(?string $value): string { return $value ? date(DATE_ATOM, strtotime($value)) : ''; }

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

    private function arrayPage(array $items, array $filters = []): array
    {
        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = min(100, max(1, (int) ($filters['per_page'] ?? $filters['perPage'] ?? 25)));
        $total = count($items);
        return [
            'items' => array_slice($items, ($page - 1) * $perPage, $perPage),
            'meta' => [
                'page' => $page,
                'perPage' => $perPage,
                'total' => $total,
                'totalPages' => (int) max(1, ceil($total / max(1, $perPage))),
            ],
        ];
    }
}
