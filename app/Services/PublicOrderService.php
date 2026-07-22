<?php

namespace App\Services;

use App\Models\CustomerMemberModel;
use App\Models\PaymentMethodModel;
use Config\Database;

class PublicOrderService
{
    use \App\Services\Shared\MappingHelperTrait;
    private $db;

    public function __construct()
    {
        $this->db = Database::connect();
    }

    public function bootstrap(int $companyId, ?int $outletId = null, string $only = ''): array
    {
        $outlets = [];
        if ($only === '' || $only === 'outlets') {
            $outlets = $this->outlets($companyId);
        }

        $activeOutletId = $outletId;
        if (! $activeOutletId && $outlets) {
            $activeOutletId = (int) ($outlets[0]['numericId'] ?? 0);
        }

        $company = [];
        if ($only === '' || $only === 'outlets') {
            $company = $this->companyPayload($companyId);
        }

        $settings = [];
        $categories = [];
        $products = [];
        $modifiers = [];
        $ingredients = [];

        if ($only === '' || $only === 'menu' || $only === 'stock') {
            if ($activeOutletId) {
                $settingsData = (new SettingsService())->data($companyId, $activeOutletId);
                $productData = (new ProductSuiteService())->data($companyId, $activeOutletId);
                $reservations = $this->pendingReservations($companyId, $activeOutletId, $productData['products'] ?? []);

                $settings = $settingsData['settings'] ?? [];
                $categories = array_values(array_filter($productData['categories'] ?? [], fn ($row) => ! StatusCodeService::isInactive($row['status'] ?? '')));
                $products = array_values(array_map(fn ($product) => $this->productPublicPayload($product, $reservations, $productData['ingredients'] ?? []), array_filter($productData['products'] ?? [], fn ($row) => StatusCodeService::isActive($row['status'] ?? ''))));
                $modifiers = array_values(array_filter($productData['modifiers'] ?? [], fn ($row) => StatusCodeService::isActive($row['status'] ?? '')));
                $ingredients = $productData['ingredients'] ?? [];
            }
        }

        $response = [];
        if ($only === '' || $only === 'outlets') {
            $response['company'] = $company;
            $response['outlets'] = $outlets;
        }
        if ($only === '' || $only === 'menu' || $only === 'stock') {
            $response['activeOutletId'] = $activeOutletId ? $this->outletCode($activeOutletId) : '';
            $response['settings'] = $settings;
            $response['categories'] = $categories;
            $response['products'] = $products;
            $response['modifiers'] = $modifiers;
            $response['ingredients'] = $ingredients;
        }

        return $response;
    }

    public function memberLookup(int $companyId, int $outletId, string $name = '', string $email = ''): array
    {
        if (! $this->db->tableExists('customer_members')) {
            return [];
        }
        $builder = $this->db->table('customer_members')
            ->whereIn('status', [StatusCodeService::ACTIVE, 'active']);
        if ($this->hasCompanyColumn('customer_members')) {
            $builder->where('company_id', $companyId);
        }
        if ($email !== '') {
            $builder->where('email', strtolower(trim($email)));
        } elseif ($name !== '') {
            $builder->like('LOWER(name)', strtolower(trim($name)));
        } else {
            return [];
        }

        $rows = $builder->orderBy('last_order_at', 'DESC')->limit(8)->get()->getResultArray();
        return array_map(fn ($row) => [
            'id' => 'member-' . $row['id'],
            'name' => $row['name'],
            'email' => $row['email'],
            'phone' => $row['phone'] ?? '',
        ], $rows);
    }

    public function statusLookup(string $orderNumber, int $companyId, ?int $outletId = null): array
    {
        $orderNumber = strtoupper(trim($orderNumber));
        if ($orderNumber === '') {
            throw new \InvalidArgumentException('Nomor order wajib diisi.');
        }
        if (! $this->db->tableExists('orders')) {
            throw new \InvalidArgumentException('Data order belum tersedia.');
        }

        $builder = $this->db->table('orders')->where('UPPER(order_no)', $orderNumber);
        if ($this->hasCompanyColumn('orders')) {
            $builder->where('company_id', $companyId);
        }
        if ($outletId) {
            $builder->where('outlet_id', $outletId);
        }
        $order = $builder->orderBy('id', 'DESC')->get()->getRowArray();
        if (! $order) {
            throw new \InvalidArgumentException('Order tidak ditemukan.');
        }

        return [
            'order' => (new SalesService())->orderDetail('ord-' . $order['id'], $companyId, (int) $order['outlet_id']),
            'message' => 'Status order ditemukan.',
        ];
    }

    public function submit(array $payload, int $companyId): array
    {
        $outletId = $this->numericId($payload['outletId'] ?? $payload['outlet_id'] ?? '');
        if (! $outletId) {
            throw new \InvalidArgumentException('Outlet wajib dipilih.');
        }

        $settings = (new SettingsService())->data($companyId, $outletId)['settings'];
        $serviceType = $this->serviceType((string) ($payload['serviceType'] ?? 'Take Away'));
        $this->ensureServiceTypeEnabled($serviceType, $settings['orderChannels'] ?? []);

        $paymentMethod = $this->paymentMethod($payload['paymentMethodId'] ?? '', $companyId, $outletId);
        $paymentProofPath = $this->storePaymentProof($payload['paymentProof'] ?? null, $companyId, $outletId, $this->nextPublicOrderNumber($companyId, $outletId));
        if ($this->requiresPaymentProof($paymentMethod) && $paymentProofPath === '') {
            throw new \InvalidArgumentException('Upload bukti bayar wajib untuk metode pembayaran offline ini.');
        }
        $customer = $this->customerPayload($payload);
        $this->db->transStart();
        try {
            $memberId = $this->resolveMemberId($payload, $customer, $companyId, $outletId);

            $productData = (new ProductSuiteService())->data($companyId, $outletId);
            $reservations = $this->pendingReservations($companyId, $outletId, $productData['products'] ?? []);
            $products = array_map(fn ($product) => $this->productPublicPayload($product, $reservations, $productData['ingredients'] ?? []), $productData['products'] ?? []);
            $ingredients = $productData['ingredients'] ?? [];
            $modifiers = $productData['modifiers'] ?? [];
            $orderItems = $this->orderItems($payload['items'] ?? [], $products, $ingredients, $modifiers);
            if (! $orderItems) {
                throw new \InvalidArgumentException('Keranjang masih kosong.');
            }

            $packaging = $this->packagingItems($serviceType, array_sum(array_map(fn ($item) => (float) $item['qty'], $orderItems)), $settings['packagingRules'] ?? [], $ingredients);
            $items = array_merge($orderItems, $packaging['items']);
            $totals = $this->totals($orderItems, $packaging['items'], $settings, $serviceType, $paymentMethod);
            $orderNumber = $this->nextPublicOrderNumber($companyId, $outletId);
            $isCash = ($paymentMethod['type'] ?? '') === 'cash';

            $order = (new SalesService())->saveOrder([
                'orderNumber' => $orderNumber,
                'serviceType' => $serviceType,
                'customerName' => $customer['name'],
                'customerEmail' => $customer['email'],
                'customerPhone' => $customer['phone'],
                'customerMemberId' => $memberId ?: null,
                'tableName' => $this->tableName($payload, $settings, $serviceType),
                'tableFlow' => $serviceType === 'Dine In' ? ($settings['tableServiceMode'] ?? 'public_order') : 'public_order',
                'initialStatus' => SalesService::STATUS_PENDING_CASHIER,
                'paymentStatus' => StatusCodeService::PAYMENT_UNPAID,
                'paymentMethod' => $paymentMethod['name'] ?? 'Cash',
                'paymentProofPath' => $paymentProofPath,
                'paymentProofNote' => $this->paymentProofNote($paymentMethod),
                'productRevenue' => $totals['productRevenue'],
                'packagingFee' => $totals['packagingFee'],
                'paymentFee' => $totals['paymentFee'],
                'paymentFeePayer' => $totals['paymentFeePayer'],
                'tax' => $totals['tax'],
                'total' => $totals['total'],
                'cogs' => $totals['cogs'],
                'profit' => $totals['profit'],
                'packagingSource' => $packaging['source'],
                'packagingNote' => $packaging['note'],
                'items' => $items,
            ], $companyId, $outletId);

            $this->sendReceiptNotification((string) ($order['id'] ?? ''));

            $this->db->transComplete();
        } catch (\Throwable $e) {
            $this->db->transRollback();
            throw $e;
        }

        return [
            'order' => $order,
            'memberId' => $memberId ? 'member-' . $memberId : '',
            'message' => $isCash
                ? 'Order tersimpan dan menunggu konfirmasi kasir sebelum diproses.'
                : 'Order tersimpan dan menunggu konfirmasi kasir sebelum diproses.',
        ];
    }

    private function requiresPaymentProof(array $paymentMethod): bool
    {
        $type = (string) ($paymentMethod['type'] ?? '');
        return $type === 'transfer' || ($type === 'qris' && ($paymentMethod['qrisMode'] ?? 'online') === 'offline');
    }

    private function paymentProofNote(array $paymentMethod): string
    {
        $type = (string) ($paymentMethod['type'] ?? '');
        if ($type === 'qris' && ($paymentMethod['qrisMode'] ?? 'online') === 'offline') {
            return 'QRIS offline - bukti bayar dari customer';
        }
        if ($type === 'transfer') {
            return 'Bank transfer - bukti bayar dari customer';
        }
        return '';
    }

    private function storePaymentProof($proof, int $companyId, int $outletId, string $orderNumber): string
    {
        if (! is_array($proof)) return '';
        $dataUrl = (string) ($proof['dataUrl'] ?? '');
        if ($dataUrl === '') return '';
        if (! preg_match('#^data:(image/(?:png|jpe?g|webp)|application/pdf);base64,([A-Za-z0-9+/=]+)$#', $dataUrl, $matches)) {
            throw new \InvalidArgumentException('Format bukti bayar harus gambar atau PDF.');
        }

        $binary = base64_decode($matches[2], true);
        if ($binary === false || strlen($binary) <= 0) {
            throw new \InvalidArgumentException('Bukti bayar tidak valid.');
        }
        if (strlen($binary) > 3 * 1024 * 1024) {
            throw new \InvalidArgumentException('Ukuran bukti bayar maksimal 3 MB.');
        }

        switch ($matches[1]) {
            case 'image/png':
                $extension = 'png';
                break;
            case 'image/jpeg':
            case 'image/jpg':
                $extension = 'jpg';
                break;
            case 'image/webp':
                $extension = 'webp';
                break;
            default:
                $extension = 'pdf';
                break;
        }
        $dir = FCPATH . 'uploads/payment-proofs';
        if (! is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        $safeOrder = preg_replace('/[^A-Za-z0-9_-]+/', '-', $orderNumber);
        $filename = date('YmdHis') . '-c' . $companyId . '-o' . $outletId . '-' . $safeOrder . '.' . $extension;
        file_put_contents($dir . '/' . $filename, $binary);

        return '/uploads/payment-proofs/' . $filename;
    }

    private function sendReceiptNotification(string $legacyOrderId): void
    {
        $orderId = (int) preg_replace('/\D+/', '', $legacyOrderId);
        if ($orderId <= 0) return;
        try {
            (new OrderNotificationService())->sendOrderReceiptEmail($orderId, 'Receipt order diterima');
        } catch (\Throwable $e) {
            // Email receipt tidak boleh menggagalkan order customer.
        }
    }

    private function outlets(int $companyId): array
    {
        if (! $this->db->tableExists('outlets')) {
            return [];
        }
        $builder = $this->db->table('outlets')->whereIn('status', [StatusCodeService::ACTIVE, 'active'])->orderBy('name', 'ASC');
        if ($this->hasCompanyColumn('outlets')) {
            $builder->where('company_id', $companyId);
        }
        return array_map(fn ($row) => [
            'id' => $this->outletCode((int) $row['id']),
            'numericId' => (int) $row['id'],
            'name' => $row['name'],
            'code' => $row['code'] ?? '',
            'address' => $row['address'] ?? '',
        ], $builder->get()->getResultArray());
    }

    private function companyPayload(int $companyId): array
    {
        $company = $this->db->tableExists('companies')
            ? ($this->db->table('companies')->where('id', $companyId)->get()->getRowArray() ?: [])
            : [];
        return [
            'id' => $this->companyCode($companyId),
            'name' => $company['brand_name'] ?? $company['name'] ?? 'IF Instrument',
            'slug' => $company['route_slug'] ?? '',
            'logoUrl' => $company['logo_path'] ?? '/assets/if-instrument-logo.jpg',
            'themeColor' => $company['theme_color'] ?? '#6e3a16',
        ];
    }

    private function productPublicPayload(array $product, array $reservations = [], array $ingredients = []): array
    {
        $reservedProductQty = (float) (($reservations['products'][$product['id'] ?? ''] ?? 0));
        if (in_array($product['inventoryType'] ?? 'made_to_order', ['finished_good', 'retail'], true)) {
            $product['finishedStock'] = max(0, (float) ($product['finishedStock'] ?? 0) - $reservedProductQty);
        } else {
            $reservedIngredients = $reservations['ingredients'] ?? [];
            $product['recipe'] = array_map(function ($line) use ($reservedIngredients, $ingredients) {
                $ingredientId = (string) ($line['ingredientId'] ?? '');
                if ($ingredientId === '') return $line;
                $baseStock = array_key_exists('stock', $line) ? (float) $line['stock'] : (float) ($this->findById($ingredients, $ingredientId)['stock'] ?? 0);
                $line['stock'] = max(0, $baseStock - (float) ($reservedIngredients[$ingredientId] ?? 0));
                return $line;
            }, $product['recipe'] ?? []);
        }
        $availableQty = $this->availableQty($product);
        return array_merge($product, [
            'availableQty' => $availableQty,
            'soldOut' => $availableQty <= 0 && ! $this->isPreorderStockedProduct($product),
        ]);
    }

    private function pendingReservations(int $companyId, int $outletId, array $products): array
    {
        $reservations = ['products' => [], 'ingredients' => []];
        if (! $this->db->tableExists('orders') || ! $this->db->tableExists('order_items')) return $reservations;

        $productById = [];
        foreach ($products as $product) {
            $productById[(string) ($product['id'] ?? '')] = $product;
        }

        $orders = $this->db->table('orders')
            ->select('id')
            ->where('outlet_id', $outletId)
            ->whereIn('status', [SalesService::STATUS_PENDING_CASHIER, 'pending_cashier']);
        if ($this->hasCompanyColumn('orders')) $orders->where('company_id', $companyId);
        $orderIds = array_map('intval', array_column($orders->get()->getResultArray(), 'id'));
        if (! $orderIds) return $reservations;

        foreach ($this->db->table('order_items')->whereIn('order_id', $orderIds)->get()->getResultArray() as $item) {
            $snapshot = json_decode((string) ($item['modifier_snapshot'] ?? ''), true) ?: [];
            $productId = (string) ($snapshot['productId'] ?? (! empty($item['product_id']) ? 'prd-' . $item['product_id'] : ''));
            $qty = (float) ($item['qty'] ?? 0);
            $product = $productById[$productId] ?? null;
            if ($product && in_array($product['inventoryType'] ?? 'made_to_order', ['finished_good', 'retail'], true)) {
                $reservations['products'][$productId] = ($reservations['products'][$productId] ?? 0) + $qty;
                continue;
            }
            $recipeUsage = json_decode((string) ($item['recipe_snapshot'] ?? ''), true);
            if (! is_array($recipeUsage)) $recipeUsage = $snapshot['recipeUsage'] ?? [];
            foreach ($recipeUsage as $line) {
                $ingredientId = (string) ($line['ingredientId'] ?? '');
                if ($ingredientId === '') continue;
                $reservations['ingredients'][$ingredientId] = ($reservations['ingredients'][$ingredientId] ?? 0) + (float) ($line['qty'] ?? 0);
            }
        }

        return $reservations;
    }

    private function orderItems(array $lines, array $products, array $ingredients, array $modifiers): array
    {
        $items = [];
        foreach ($lines as $line) {
            $product = $this->findById($products, (string) ($line['productId'] ?? ''));
            if (! $product || ! StatusCodeService::isActive($product['status'] ?? '')) {
                throw new \InvalidArgumentException('Produk tidak tersedia.');
            }
            $qty = max(1, (int) ($line['qty'] ?? 1));
            $modifierIds = array_values(array_filter($line['modifierIds'] ?? [], fn ($id) => is_string($id) && $id !== ''));
            $this->validateModifierSelection($product, $modifiers, $modifierIds);
            $selectedModifiers = $this->selectedModifierOptions($product, $modifiers, $modifierIds);
            
            $isPreorderProduct = $this->isPreorderStockedProduct($product);
            $avail = $this->availableQty($product, $selectedModifiers, $ingredients);
            
            if (! $isPreorderProduct && $avail < $qty) {
                throw new \InvalidArgumentException($product['name'] . ' tidak memiliki stok cukup.');
            }
            
            $unitCogs = $this->unitCogs($product, $ingredients, $selectedModifiers);
            $unitPrice = (float) ($product['price'] ?? 0) + array_sum(array_map(fn ($option) => (float) ($option['priceDelta'] ?? 0), $selectedModifiers));
            
            $itemBase = [
                'productId' => $product['id'],
                'name' => $product['name'],
                'price' => $unitPrice,
                'cogs' => $unitCogs,
                'modifierIds' => $modifierIds,
                'modifiers' => array_map(fn ($option) => ($option['groupName'] ?? 'Modifier') . ': ' . ($option['name'] ?? 'Opsi'), $selectedModifiers),
            ];
            
            if ($isPreorderProduct) {
                if ($avail > 0 && $avail < $qty) {
                    // Ready portion
                    $items[] = array_merge($itemBase, [
                        'qty' => $avail,
                        'isPreorder' => false,
                        'recipeUsage' => $this->recipeUsage($product, $avail, $selectedModifiers),
                    ]);
                    // PO portion
                    $items[] = array_merge($itemBase, [
                        'qty' => $qty - $avail,
                        'isPreorder' => true,
                        'recipeUsage' => $this->recipeUsage($product, $qty - $avail, $selectedModifiers),
                    ]);
                } elseif ($avail <= 0) {
                    $items[] = array_merge($itemBase, [
                        'qty' => $qty,
                        'isPreorder' => true,
                        'recipeUsage' => $this->recipeUsage($product, $qty, $selectedModifiers),
                    ]);
                } else {
                    $items[] = array_merge($itemBase, [
                        'qty' => $qty,
                        'isPreorder' => false,
                        'recipeUsage' => $this->recipeUsage($product, $qty, $selectedModifiers),
                    ]);
                }
            } else {
                $items[] = array_merge($itemBase, [
                    'qty' => $qty,
                    'isPreorder' => false,
                    'recipeUsage' => $this->recipeUsage($product, $qty, $selectedModifiers),
                ]);
            }
        }
        return $items;
    }
    private function isPreorderStockedProduct(array $product): bool
    {
        return ! empty($product['isPreorder']);
    }
    private function recipeUsage(array $product, int $qty, array $selectedModifiers = []): array
    {
        if (in_array($product['inventoryType'] ?? 'made_to_order', ['finished_good', 'retail'], true)) {
            return [];
        }
        return array_values(array_map(fn ($line) => [
            'ingredientId' => $line['ingredientId'] ?? '',
            'ingredientName' => $line['ingredientName'] ?? '',
            'qty' => (float) ($line['qty'] ?? 0) * $qty,
            'unit' => $line['unit'] ?? '',
        ], array_filter($this->effectiveRecipe($product, $selectedModifiers), fn ($line) => ! empty($line['ingredientId']) && (float) ($line['qty'] ?? 0) > 0)));
    }

    private function unitCogs(array $product, array $ingredients, array $selectedModifiers = []): float
    {
        if (in_array($product['inventoryType'] ?? 'made_to_order', ['finished_good', 'retail'], true)) {
            return (float) ($product['finishedUnitCost'] ?? 0);
        }
        $cost = 0;
        foreach ($this->effectiveRecipe($product, $selectedModifiers) as $line) {
            $ingredient = $this->findById($ingredients, (string) ($line['ingredientId'] ?? ''));
            if (! $ingredient) continue;
            $cost += (float) ($line['qty'] ?? 0) * (float) (($ingredient['avgCost'] ?? 0) ?: ($ingredient['standardCost'] ?? 0));
        }
        return $cost;
    }

    private function packagingItems(string $serviceType, float $itemQty, array $rules, array $ingredients): array
    {
        if (! in_array($serviceType, ['Take Away', 'Delivery'], true) || $itemQty <= 0) {
            return ['items' => [], 'source' => 'none', 'note' => ''];
        }
        $rule = null;
        foreach ($rules as $candidate) {
            if (StatusCodeService::isInactive($candidate['status'] ?? '')) continue;
            if ($itemQty >= (int) ($candidate['minQty'] ?? 0) && $itemQty <= (int) ($candidate['maxQty'] ?? 0)) {
                $rule = $candidate;
                break;
            }
        }
        if (! $rule) {
            return ['items' => [], 'source' => 'unavailable', 'note' => 'Packaging rule belum tersedia untuk jumlah item ini.'];
        }
        $items = [];
        foreach (($rule['items'] ?? []) as $line) {
            $ingredient = $this->findById($ingredients, (string) ($line['ingredientId'] ?? ''));
            $qty = (float) ($line['qty'] ?? 0);
            if (! $ingredient || (float) ($ingredient['stock'] ?? 0) < $qty) {
                return ['items' => [], 'source' => 'unavailable', 'note' => 'Stok kemasan tidak cukup. Order tetap masuk tanpa pemotongan kemasan otomatis.'];
            }
            $unitCost = (float) (($ingredient['avgCost'] ?? 0) ?: ($ingredient['standardCost'] ?? 0));
            $items[] = [
                'isPackaging' => true,
                'productId' => '',
                'name' => $ingredient['name'],
                'qty' => $qty,
                'price' => (float) ($line['price'] ?? 0),
                'cogs' => $unitCost,
                'recipeUsage' => [[
                    'ingredientId' => $ingredient['id'],
                    'ingredientName' => $ingredient['name'],
                    'qty' => $qty,
                    'unit' => $ingredient['unit'] ?? '',
                ]],
            ];
        }
        return ['items' => $items, 'source' => 'automatic', 'note' => 'Kemasan otomatis dari Packaging Rule'];
    }

    private function totals(array $items, array $packagingItems, array $settings, string $serviceType, array $paymentMethod): array
    {
        $productRevenue = array_sum(array_map(fn ($item) => (float) $item['price'] * (float) $item['qty'], $items));
        $packagingFee = array_sum(array_map(fn ($item) => (float) $item['price'] * (float) $item['qty'], $packagingItems));
        $cogs = array_sum(array_map(fn ($item) => (float) $item['cogs'] * (float) $item['qty'], array_merge($items, $packagingItems)));
        $serviceCharge = $serviceType === 'Dine In' ? $productRevenue * ((float) ($settings['dineInServiceRate'] ?? 0) / 100) : 0;
        $taxable = $productRevenue + $packagingFee + $serviceCharge;
        $tax = $taxable * ((float) ($settings['taxRate'] ?? 0) / 100);
        $baseTotal = $taxable + $tax;
        $paymentFee = $baseTotal * ((float) ($paymentMethod['feeRate'] ?? 0) / 100);
        $feePayer = ($paymentMethod['feePayer'] ?? 'merchant') === 'customer' ? 'customer' : 'merchant';
        $total = $baseTotal + ($feePayer === 'customer' ? $paymentFee : 0);

        return [
            'productRevenue' => $productRevenue,
            'packagingFee' => $packagingFee,
            'paymentFee' => $paymentFee,
            'paymentFeePayer' => $feePayer,
            'tax' => $tax,
            'total' => $total,
            'cogs' => $cogs,
            'profit' => $taxable - $cogs - ($feePayer === 'merchant' ? $paymentFee : 0),
        ];
    }

    private function paymentMethod(string $id, int $companyId, int $outletId): array
    {
        $methods = (new SettingsService())->paymentMethodPage($companyId, $outletId, ['per_page' => 100])['items'] ?? [];
        $active = array_values(array_filter($methods, fn ($row) => StatusCodeService::isActive($row['status'] ?? '')));
        if (! $active) {
            throw new \InvalidArgumentException('Belum ada metode pembayaran aktif.');
        }
        foreach ($active as $method) {
            if (($method['id'] ?? '') === $id) {
                return $method;
            }
        }
        return $active[0];
    }

    private function tableName(array $payload, array $settings, string $serviceType): string
    {
        if ($serviceType !== 'Dine In') {
            return '-';
        }
        if (($settings['tableServiceMode'] ?? 'free_seating_pay_first') === 'free_seating_pay_first') {
            return '-';
        }
        $tableName = trim((string) ($payload['tableName'] ?? ''));
        if ($tableName === '') {
            throw new \InvalidArgumentException('Meja wajib dipilih untuk mode dine in outlet ini.');
        }
        $available = array_filter($settings['diningTables'] ?? [], fn ($table) => StatusCodeService::isActive($table['status'] ?? ''));
        $valid = array_filter($available, fn ($table) => (string) ($table['name'] ?? '') === $tableName || (string) ($table['id'] ?? '') === $tableName);
        if (! $valid) {
            throw new \InvalidArgumentException('Meja tidak tersedia.');
        }
        $table = array_values($valid)[0];
        return (string) ($table['name'] ?? $tableName);
    }

    private function customerPayload(array $payload): array
    {
        $name = trim((string) ($payload['customerName'] ?? ''));
        $email = strtolower(trim((string) ($payload['customerEmail'] ?? '')));
        $phone = trim((string) ($payload['customerPhone'] ?? ''));
        if ($name === '') {
            throw new \InvalidArgumentException('Nama pemesan wajib diisi.');
        }
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new \InvalidArgumentException('Email pemesan tidak valid.');
        }
        if ($phone === '') {
            throw new \InvalidArgumentException('No HP pemesan wajib diisi.');
        }
        return compact('name', 'email', 'phone');
    }

    private function registerMember(array $customer, int $companyId, int $outletId): ?int
    {
        if (! $this->db->tableExists('customer_members')) {
            return null;
        }
        $existing = $this->memberByEmail($customer['email'], $companyId, $outletId);
        $data = $this->withCompanyData('customer_members', [
            'company_id' => $companyId,
            'outlet_id' => $outletId,
            'name' => $customer['name'],
            'email' => $customer['email'],
            'phone' => $customer['phone'],
            'status' => 'active',
            'last_order_at' => date('Y-m-d H:i:s'),
        ], $companyId);

        $model = new CustomerMemberModel();
        if ($existing) {
            $model->update((int) $existing['id'], $data);
            return (int) $existing['id'];
        }
        $model->insert($data);
        return (int) $model->getInsertID();
    }

    private function resolveMemberId(array $payload, array $customer, int $companyId, int $outletId): ?int
    {
        $selectedMemberId = $this->numericMemberId($payload['customerMemberId'] ?? $payload['memberId'] ?? '');
        if ($selectedMemberId) {
            return $this->updateExistingMember($selectedMemberId, $customer, $companyId, $outletId);
        }

        return ! empty($payload['registerMember'])
            ? $this->registerMember($customer, $companyId, $outletId)
            : $this->existingMemberId($customer['email'], $companyId, $outletId);
    }

    private function updateExistingMember(int $memberId, array $customer, int $companyId, int $outletId): ?int
    {
        if (! $this->db->tableExists('customer_members')) {
            return null;
        }
        $builder = $this->db->table('customer_members')
            ->where('id', $memberId);
        if ($this->hasCompanyColumn('customer_members')) {
            $builder->where('company_id', $companyId);
        }
        $existing = $builder->get()->getRowArray();
        if (! $existing) {
            throw new \InvalidArgumentException('Member customer tidak ditemukan.');
        }

        $emailOwner = $this->memberByEmail($customer['email'], $companyId, $outletId);
        if ($emailOwner && (int) $emailOwner['id'] !== $memberId) {
            throw new \InvalidArgumentException('Email sudah terdaftar untuk member lain.');
        }

        (new CustomerMemberModel())->update($memberId, [
            'email' => $customer['email'],
            'phone' => $customer['phone'],
            'status' => StatusCodeService::ACTIVE,
            'last_order_at' => date('Y-m-d H:i:s'),
        ]);

        return $memberId;
    }

    private function numericMemberId($value): int
    {
        $id = preg_replace('/\D+/', '', (string) $value);
        return $id === '' ? 0 : (int) $id;
    }

    private function existingMemberId(string $email, int $companyId, int $outletId): ?int
    {
        $existing = $this->memberByEmail($email, $companyId, $outletId);
        if ($existing) {
            (new CustomerMemberModel())->update((int) $existing['id'], ['last_order_at' => date('Y-m-d H:i:s')]);
        }
        return $existing ? (int) $existing['id'] : null;
    }

    private function memberByEmail(string $email, int $companyId, int $outletId): ?array
    {
        if (! $this->db->tableExists('customer_members')) {
            return null;
        }
        $builder = $this->db->table('customer_members')->where('email', $email);
        if ($this->hasCompanyColumn('customer_members')) {
            $builder->where('company_id', $companyId);
        }
        return $builder->get()->getRowArray() ?: null;
    }

    private function ensureServiceTypeEnabled(string $serviceType, array $channels): void
    {
        $map = ['Dine In' => 'dineIn', 'Take Away' => 'takeAway', 'Delivery' => 'delivery'];
        $key = $map[$serviceType] ?? 'takeAway';
        if (($channels[$key] ?? false) !== true) {
            throw new \InvalidArgumentException($serviceType . ' belum aktif untuk outlet ini.');
        }
    }
    private function serviceType(string $value): string
    {
        switch (strtolower(str_replace(['_', '-'], ' ', trim($value)))) {
            case 'dine in':
            case 'dinein':
                return 'Dine In';
            case 'delivery':
                return 'Delivery';
            default:
                return 'Take Away';
        }
    }

    private function selectedModifierOptions(array $product, array $modifiers, array $modifierIds): array
    {
        if (! $modifierIds) {
            return [];
        }
        $options = $this->productModifierOptions($product, $modifiers);
        return array_values(array_filter($options, fn ($option) => in_array((string) ($option['id'] ?? ''), $modifierIds, true)));
    }

    private function validateModifierSelection(array $product, array $modifiers, array $modifierIds): void
    {
        $groups = [];
        foreach ($this->productModifierOptions($product, $modifiers) as $option) {
            $groupId = (string) ($option['groupId'] ?? '');
            if ($groupId === '') {
                continue;
            }
            $groups[$groupId] ??= [
                'name' => $option['groupName'] ?? 'Modifier',
                'required' => (bool) ($option['groupRequired'] ?? false),
                'choiceType' => $option['groupChoiceType'] ?? 'multiple',
                'selected' => 0,
            ];
            if (in_array((string) ($option['id'] ?? ''), $modifierIds, true)) {
                $groups[$groupId]['selected']++;
            }
        }

        foreach ($groups as $group) {
            if ($group['required'] && $group['selected'] < 1) {
                throw new \InvalidArgumentException('Modifier ' . $group['name'] . ' wajib dipilih.');
            }
            if ($group['choiceType'] === 'single' && $group['selected'] > 1) {
                throw new \InvalidArgumentException('Modifier ' . $group['name'] . ' hanya boleh pilih satu opsi.');
            }
        }
    }

    private function productModifierOptions(array $product, array $modifiers): array
    {
        $assignedIds = $product['modifierIds'] ?? [];
        $options = [];
        foreach ($modifiers as $modifier) {
            if (StatusCodeService::isInactive($modifier['status'] ?? '') || ! in_array((string) ($modifier['id'] ?? ''), $assignedIds, true)) {
                continue;
            }
            foreach (($modifier['options'] ?? []) as $option) {
                $optionId = (string) ($option['id'] ?? 'default');
                $options[] = array_merge($option, [
                    'id' => $optionId === 'default' ? (string) $modifier['id'] : (string) $modifier['id'] . ':' . $optionId,
                    'optionId' => $optionId,
                    'groupId' => (string) $modifier['id'],
                    'groupName' => $modifier['name'] ?? 'Modifier',
                    'groupRequired' => (bool) ($modifier['requiredSelection'] ?? false),
                    'groupChoiceType' => $modifier['choiceType'] ?? (($modifier['requiredSelection'] ?? false) ? 'single' : 'multiple'),
                ]);
            }
        }
        return $options;
    }

    private function effectiveRecipe(array $product, array $selectedModifiers = []): array
    {
        $lines = [];
        foreach (($product['recipe'] ?? []) as $line) {
            if (empty($line['ingredientId'])) {
                continue;
            }
            $lines[(string) $line['ingredientId']] = $line + ['qty' => (float) ($line['qty'] ?? 0)];
        }

        foreach ($selectedModifiers as $modifier) {
            $qty = (float) ($modifier['qty'] ?? 0);
            $action = ($modifier['action'] ?? 'set') === 'replace' ? 'replace' : 'set';
            $ingredientId = (string) ($modifier['ingredientId'] ?? '');
            $replacementId = (string) ($modifier['replacementIngredientId'] ?? '');
            if ($action === 'replace') {
                if ($ingredientId !== '') {
                    unset($lines[$ingredientId]);
                }
                if ($replacementId !== '') {
                    $lines[$replacementId] = [
                        'ingredientId' => $replacementId,
                        'ingredientName' => $modifier['replacementIngredientName'] ?? $modifier['replacementTemplateName'] ?? 'Modifier',
                        'qty' => (($lines[$replacementId]['qty'] ?? 0) + $qty),
                        'unit' => $modifier['unit'] ?? '',
                    ];
                }
                continue;
            }
            if ($ingredientId !== '') {
                $lines[$ingredientId] = [
                    'ingredientId' => $ingredientId,
                    'ingredientName' => $modifier['ingredientName'] ?? $modifier['templateName'] ?? 'Modifier',
                    'qty' => $qty,
                    'unit' => $modifier['unit'] ?? '',
                ];
            }
        }

        return array_values(array_filter($lines, fn ($line) => (float) ($line['qty'] ?? 0) > 0));
    }

    private function availableQty(array $product, array $selectedModifiers = [], array $ingredients = []): float
    {
        if (in_array($product['inventoryType'] ?? 'made_to_order', ['finished_good', 'retail'], true)) {
            return (float) ($product['finishedStock'] ?? 0);
        }
        $recipe = $selectedModifiers ? $this->effectiveRecipe($product, $selectedModifiers) : ($product['recipe'] ?? []);
        if (! $recipe) {
            return 0;
        }
        $capacities = [];
        foreach ($recipe as $line) {
            $qty = (float) ($line['qty'] ?? 0);
            if ($qty <= 0 || empty($line['ingredientId']) || ! empty($line['missingIngredient'])) {
                return 0;
            }
            $stock = array_key_exists('stock', $line) ? (float) $line['stock'] : (float) ($this->findById($ingredients, (string) $line['ingredientId'])['stock'] ?? 0);
            $capacities[] = floor($stock / $qty);
        }
        return $capacities ? (float) max(0, min($capacities)) : 0;
    }

    private function findById(array $items, string $id): ?array
    {
        foreach ($items as $item) {
            if ((string) ($item['id'] ?? '') === $id) {
                return $item;
            }
        }
        return null;
    }

    private function nextPublicOrderNumber(int $companyId, int $outletId): string
    {
        $prefix = 'WEB-' . date('Ymd') . '-';
        $builder = $this->db->table('orders')->like('order_no', $prefix, 'after')->where('outlet_id', $outletId);
        if ($this->hasCompanyColumn('orders')) {
            $builder->where('company_id', $companyId);
        }
        return $prefix . str_pad((string) ($builder->countAllResults() + 1), 4, '0', STR_PAD_LEFT);
    }

    private function numericId($value): int
    {
        if (! $value) return 0;
        if (is_numeric($value)) return (int) $value;
        $aliases = ['outlet-main' => 1, 'outlet-north' => 2, 'outlet-south' => 3];
        if (isset($aliases[(string) $value])) return $aliases[(string) $value];
        if (preg_match('/(\d+)$/', (string) $value, $matches)) return (int) $matches[1];
        return 0;
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
}
