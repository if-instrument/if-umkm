<?php

namespace App\Services;

use App\Models\OperatingExpenseModel;
use App\Models\ReportModel;
use Config\Database;

class ProfitLossService
{
    private ReportModel $reports;
    private OperatingExpenseModel $expenses;

    public function __construct()
    {
        $this->reports = new ReportModel();
        $this->expenses = new OperatingExpenseModel();
    }

    public function report(array $filter): array
    {
        $range = $this->range($filter['period'] ?? 'daily', $filter['anchor_date'] ?? date('Y-m-d'));
        $companyId = (int) ($filter['company_id'] ?? 1);
        $outletId = (int) ($filter['outlet_id'] ?? 1);
        $outlet = $this->reports->outlet($outletId);
        $orders = $this->reports->paidOrders($companyId, $outletId, $range);
        $orderItems = $this->reports->orderItems(array_column($orders, 'id'));
        $ordersById = [];
        foreach ($orders as $order) {
            $ordersById[(int) $order['id']] = $order;
        }
        $itemsByOrder = [];
        foreach ($orderItems as $item) {
            $itemsByOrder[(int) $item['order_id']][] = $item;
        }

        $movements = $this->reports->stockMovements($companyId, $outletId, $range);
        $productMovements = $this->reports->productBatchMovements($companyId, $outletId, $range);
        $expenseRows = $this->reports->operatingExpenses($companyId, $outletId, $range);

        $transactions = array_map(fn ($order) => $this->transactionPayload($order, $itemsByOrder[(int) $order['id']] ?? []), $orders);
        $lossMovements = array_values(array_filter([
            ...array_map(fn ($movement) => $this->movementPayload($movement), $movements),
            ...array_map(fn ($movement) => $this->productMovementPayload($movement), $productMovements),
            ...$this->packagingLossPayloads($orderItems, $ordersById),
        ]));
        $operatingExpenses = array_map(fn ($expense) => $this->expensePayload($expense), $expenseRows);

        $totals = [
            'revenue' => array_sum(array_map(fn ($row) => (float) $row['grand_total'], $orders)),
            'cogs' => array_sum(array_map(fn ($row) => (float) $row['cogs_total'], $orders)),
            'profit' => array_sum(array_map(fn ($row) => (float) $row['gross_profit'], $orders)),
            'serviceCharge' => 0,
            'packagingFee' => array_sum(array_map(fn ($row) => (float) $row['packaging_fee'], $orders)),
            'paymentFeeCustomer' => array_sum(array_map(fn ($row) => ($row['payment_fee_payer'] ?? 'merchant') === 'customer' ? (float) ($row['payment_fee'] ?? 0) : 0, $orders)),
            'paymentFeeMerchant' => array_sum(array_map(fn ($row) => ($row['payment_fee_payer'] ?? 'merchant') === 'merchant' ? (float) ($row['payment_fee'] ?? 0) : 0, $orders)),
            'operatingExpenses' => array_sum(array_map(fn ($row) => (float) $row['amount'], $expenseRows)),
        ];
        $wasteLoss = array_sum(array_map(fn ($row) => in_array($row['reportType'], ['waste', 'expired'], true) ? abs((float) $row['totalCost']) : 0, $lossMovements));
        $negativeAdjustment = array_sum(array_map(fn ($row) => $row['reportType'] === 'adjustment' && (float) $row['totalCost'] < 0 ? abs((float) $row['totalCost']) : 0, $lossMovements));
        $positiveAdjustment = array_sum(array_map(fn ($row) => $row['reportType'] === 'adjustment' && (float) $row['totalCost'] > 0 ? abs((float) $row['totalCost']) : 0, $lossMovements));
        $netAdjustment = $positiveAdjustment - $negativeAdjustment;
        $operatingProfit = $totals['profit'] - $totals['paymentFeeMerchant'] - $wasteLoss + $netAdjustment - $totals['operatingExpenses'];
        $cashIn = array_sum(array_map(fn ($row) => (float) $row['grand_total'], $orders));

        return [
            'range' => $range,
            'outletName' => $outlet['name'] ?? 'Outlet aktif',
            'totals' => $totals,
            'wasteLoss' => $wasteLoss,
            'netAdjustment' => $netAdjustment,
            'operatingProfit' => $operatingProfit,
            'finance' => [
                'cashIn' => $cashIn,
                'cashOut' => $totals['paymentFeeMerchant'] + $totals['operatingExpenses'],
                'netCashMovement' => $cashIn - $totals['paymentFeeMerchant'] - $totals['operatingExpenses'],
                'paymentSummary' => $this->paymentSummary($orders),
                'expenseSummary' => $this->expenseSummary($operatingExpenses),
            ],
            'lossMovements' => $lossMovements,
            'operatingExpenses' => $operatingExpenses,
            'transactions' => $transactions,
        ];
    }

    public function summary(array $filter): array
    {
        $report = $this->report($filter);
        return [
            'sales' => $report['totals']['revenue'],
            'cogs' => $report['totals']['cogs'],
            'gross_profit' => $report['totals']['profit'],
            'inventory_loss' => $report['wasteLoss'],
            'operating_expenses' => $report['totals']['operatingExpenses'] ?? 0,
            'operating_profit' => $report['operatingProfit'],
            'orders' => $report['transactions'],
            'loss_rows' => $report['lossMovements'],
            'expenses' => $report['operatingExpenses'] ?? [],
        ];
    }

    public function expensePage(array $filter): array
    {
        $range = $this->range($filter['period'] ?? 'daily', $filter['anchor_date'] ?? date('Y-m-d'));
        $companyId = (int) ($filter['company_id'] ?? 1);
        $outletId = (int) ($filter['outlet_id'] ?? 1);
        $rows = $this->reports->operatingExpenses($companyId, $outletId, $range);
        return [
            'items' => array_map(fn ($row) => $this->expensePayload($row), $rows),
            'meta' => [
                'page' => 1,
                'perPage' => count($rows),
                'total' => count($rows),
                'totalPages' => 1,
            ],
        ];
    }

    public function saveExpense(array $payload, int $companyId = 1, int $outletId = 1): array
    {
        $id = $this->numericId($payload['id'] ?? null);
        $status = StatusCodeService::expense($payload['status'] ?? 'posted');
        $row = $this->withCompanyData('operating_expenses', [
            'company_id' => $companyId,
            'outlet_id' => $outletId,
            'expense_date' => $payload['expenseDate'] ?? $payload['expense_date'] ?? date('Y-m-d'),
            'category' => trim((string) ($payload['category'] ?? 'Operasional')),
            'name' => trim((string) ($payload['name'] ?? 'Beban Operasional')),
            'amount' => max(0, (float) ($payload['amount'] ?? 0)),
            'payment_method' => trim((string) ($payload['paymentMethod'] ?? $payload['payment_method'] ?? '')),
            'vendor' => trim((string) ($payload['vendor'] ?? '')),
            'reference_no' => trim((string) ($payload['referenceNo'] ?? $payload['reference_no'] ?? '')),
            'notes' => trim((string) ($payload['notes'] ?? '')),
            'status' => $status,
        ], $companyId);

        if ($row['amount'] <= 0) {
            throw new \InvalidArgumentException('Nominal beban wajib lebih dari 0.');
        }

        if ($id) {
            $existing = $this->expenses->find($id);
            if (! $existing || ! $this->rowBelongsToCompany($existing, $companyId) || (int) $existing['outlet_id'] !== $outletId) {
                throw new \InvalidArgumentException('Beban operasional tidak ditemukan.');
            }
            $this->expenses->update($id, $row);
        } else {
            $id = (int) $this->expenses->insert($row);
        }

        return $this->expensePayload($this->expenses->find($id));
    }

    public function voidExpense(string $legacyId, int $companyId = 1, int $outletId = 1): array
    {
        $id = $this->numericId($legacyId);
        $row = $id ? $this->expenses->find($id) : null;
        if (! $row || ! $this->rowBelongsToCompany($row, $companyId) || (int) $row['outlet_id'] !== $outletId) {
            throw new \InvalidArgumentException('Beban operasional tidak ditemukan.');
        }
        $this->expenses->update($id, ['status' => StatusCodeService::EXPENSE_VOID]);
        return $this->expensePayload($this->expenses->find($id));
    }

    private function transactionPayload(array $order, array $items): array
    {
        return [
            'id' => (int) $order['id'],
            'orderNo' => $order['order_no'],
            'createdAt' => $this->isoDate($order['created_at']),
            'revenue' => (float) $order['grand_total'],
            'cogs' => (float) $order['cogs_total'],
            'profit' => (float) $order['gross_profit'],
            'serviceCharge' => 0,
            'packagingFee' => (float) $order['packaging_fee'],
            'paymentMethod' => $order['payment_method'] ?? '',
            'paymentFee' => (float) ($order['payment_fee'] ?? 0),
            'paymentFeePayer' => $order['payment_fee_payer'] ?? 'merchant',
            'items' => array_map(fn ($item) => [
                'qty' => (float) $item['qty'],
                'name' => $item['product_name'],
                'modifiers' => $this->modifierNames($item['modifier_snapshot'] ?? ''),
            ], $items),
        ];
    }

    private function expensePayload(array $expense): array
    {
        return [
            'id' => 'exp-' . $expense['id'],
            'expenseDate' => $expense['expense_date'],
            'createdAt' => $this->isoDate($expense['created_at'] ?? $expense['expense_date']),
            'category' => $expense['category'],
            'name' => $expense['name'],
            'amount' => (float) $expense['amount'],
            'paymentMethod' => $expense['payment_method'] ?? '',
            'vendor' => $expense['vendor'] ?? '',
            'referenceNo' => $expense['reference_no'] ?? '',
            'notes' => $expense['notes'] ?? '',
            'status' => StatusCodeService::expense($expense['status'] ?? 'posted'),
        ];
    }

    private function paymentSummary(array $orders): array
    {
        $summary = [];
        foreach ($orders as $order) {
            $method = trim((string) ($order['payment_method'] ?? 'Belum diset')) ?: 'Belum diset';
            if (! isset($summary[$method])) {
                $summary[$method] = [
                    'method' => $method,
                    'transactions' => 0,
                    'grossAmount' => 0,
                    'paymentFeeCustomer' => 0,
                    'paymentFeeMerchant' => 0,
                    'netSettlement' => 0,
                ];
            }
            $fee = (float) ($order['payment_fee'] ?? 0);
            $feePayer = $order['payment_fee_payer'] ?? 'merchant';
            $summary[$method]['transactions']++;
            $summary[$method]['grossAmount'] += (float) $order['grand_total'];
            $summary[$method]['paymentFeeCustomer'] += $feePayer === 'customer' ? $fee : 0;
            $summary[$method]['paymentFeeMerchant'] += $feePayer === 'merchant' ? $fee : 0;
            $summary[$method]['netSettlement'] += (float) $order['grand_total'] - ($feePayer === 'merchant' ? $fee : 0);
        }
        return array_values($summary);
    }

    private function expenseSummary(array $expenses): array
    {
        $summary = [];
        foreach ($expenses as $expense) {
            $category = $expense['category'] ?: 'Operasional';
            if (! isset($summary[$category])) {
                $summary[$category] = ['category' => $category, 'amount' => 0, 'count' => 0];
            }
            $summary[$category]['amount'] += (float) $expense['amount'];
            $summary[$category]['count']++;
        }
        usort($summary, fn ($a, $b) => $b['amount'] <=> $a['amount']);
        return array_values($summary);
    }

    private function movementPayload(array $movement): ?array
    {
        $reportType = $this->reportMovementType($movement);
        if (! in_array($reportType, ['waste', 'expired', 'adjustment'], true)) return null;

        $qty = (float) $movement['qty_in'] > 0 ? (float) $movement['qty_in'] : -1 * (float) $movement['qty_out'];
        $totalCost = (float) $movement['total_cost'];
        if ((float) $movement['qty_out'] > 0 && $reportType === 'adjustment') {
            $totalCost *= -1;
        }

        return [
            'id' => (int) $movement['id'],
            'createdAt' => $this->isoDate($movement['created_at']),
            'ingredientId' => (int) $movement['outlet_ingredient_id'],
            'ingredientName' => $movement['ingredient_name'] ?? 'Bahan terhapus',
            'unit' => $movement['ingredient_unit'] ?? '',
            'type' => $movement['movement_type'],
            'reportType' => $reportType,
            'label' => $this->movementLabel($reportType),
            'qty' => $qty,
            'totalCost' => $totalCost,
            'note' => $movement['notes'] ?? '',
        ];
    }

    private function productMovementPayload(array $movement): ?array
    {
        $reportType = $this->reportMovementType($movement);
        if (! in_array($reportType, ['waste', 'expired', 'adjustment'], true)) return null;

        $qty = (float) $movement['qty_in'] > 0 ? (float) $movement['qty_in'] : -1 * (float) $movement['qty_out'];
        $totalCost = (float) $movement['total_cost'];
        if ((float) $movement['qty_out'] > 0 && $reportType === 'adjustment') {
            $totalCost *= -1;
        }

        return [
            'id' => 'pbm-' . (int) $movement['id'],
            'createdAt' => $this->isoDate($movement['created_at']),
            'ingredientId' => 0,
            'ingredientName' => ($movement['product_name'] ?? 'Produk jadi terhapus') . ' / ' . ($movement['batch_no'] ?? 'Batch'),
            'unit' => 'unit',
            'type' => $movement['movement_type'],
            'reportType' => $reportType,
            'label' => 'Stok Produk - ' . $this->movementLabel($reportType),
            'qty' => $qty,
            'totalCost' => $totalCost,
            'note' => $movement['notes'] ?? '',
        ];
    }

    private function packagingLossPayloads(array $orderItems, array $ordersById): array
    {
        $rows = [];
        foreach ($orderItems as $item) {
            $snapshot = json_decode($item['modifier_snapshot'] ?: '{}', true) ?: [];
            if (empty($snapshot['isPackaging']) || ($snapshot['treatment'] ?? '') !== 'replacement_loss') continue;
            $qty = (float) ($item['qty'] ?? 0);
            $lossCost = (float) ($snapshot['lossCost'] ?? 0) * $qty;
            if ($qty <= 0 || $lossCost <= 0) continue;
            $order = $ordersById[(int) $item['order_id']] ?? [];
            $rows[] = [
                'id' => 'pack-loss-' . ($item['id'] ?? uniqid()),
                'date' => $this->isoDate($order['created_at'] ?? null),
                'ingredientId' => 0,
                'ingredientName' => $item['product_name'] ?? 'Kemasan rusak',
                'unit' => 'pcs',
                'type' => 'waste',
                'reportType' => 'waste',
                'label' => 'Packaging Loss',
                'qty' => $qty,
                'totalCost' => $lossCost,
                'note' => trim('Pengganti kemasan rusak POS #' . ($order['order_no'] ?? '-') . ' ' . ($snapshot['reason'] ?? '')),
            ];
        }
        return $rows;
    }

    private function reportMovementType(array $movement): string
    {
        $type = $movement['movement_type'];
        $note = strtolower((string) ($movement['notes'] ?? ''));
        if ($type === 'expired') return 'expired';
        if (in_array($type, ['waste', 'lost', 'sample'], true)) return 'waste';
        if ($type === 'adjustment') return str_contains($note, 'waste') || str_contains($note, 'expired') || str_contains($note, 'rusak') || str_contains($note, 'terbuang') ? 'waste' : 'adjustment';
        return $type;
    }

    private function movementLabel(string $type): string
    {
        return match ($type) {
            'expired' => 'Expired',
            'waste' => 'Waste / Terbuang',
            'adjustment' => 'Koreksi Stok',
            default => $type,
        };
    }

    private function modifierNames(?string $json): array
    {
        $decoded = json_decode($json ?: '[]', true);
        if (! is_array($decoded)) return [];
        return array_values(array_filter(array_map(fn ($item) => is_array($item) ? ($item['name'] ?? $item['optionName'] ?? '') : (string) $item, $decoded)));
    }

    private function range(string $period, string $anchorDate): array
    {
        $anchor = new \DateTimeImmutable($anchorDate ?: date('Y-m-d'));
        $start = $anchor->setTime(0, 0, 0);
        if ($period === 'weekly') {
            $start = $start->modify('-' . (((int) $start->format('N')) - 1) . ' days');
            $end = $start->modify('+6 days')->setTime(23, 59, 59);
            $label = $this->labelDate($start) . ' - ' . $this->labelDate($end);
        } elseif ($period === 'monthly') {
            $start = $start->modify('first day of this month');
            $end = $start->modify('last day of this month')->setTime(23, 59, 59);
            $label = $start->format('F Y');
        } elseif ($period === 'yearly') {
            $start = $start->setDate((int) $start->format('Y'), 1, 1);
            $end = $start->setDate((int) $start->format('Y'), 12, 31)->setTime(23, 59, 59);
            $label = $start->format('Y');
        } else {
            $period = 'daily';
            $end = $start->setTime(23, 59, 59);
            $label = $this->labelDate($start);
        }

        return [
            'period' => $period,
            'start' => $start->format('Y-m-d'),
            'end' => $end->format('Y-m-d'),
            'startDateTime' => $start->format('Y-m-d H:i:s'),
            'endDateTime' => $end->format('Y-m-d H:i:s'),
            'label' => $label,
        ];
    }

    private function labelDate(\DateTimeImmutable $date): string
    {
        return $date->format('d M Y');
    }

    private function isoDate(?string $value): string
    {
        return $value ? date(DATE_ATOM, strtotime($value)) : date(DATE_ATOM);
    }

    private function numericId(string|int|null $value): ?int
    {
        if (! $value) return null;
        if (is_numeric($value)) return (int) $value;
        if (preg_match('/(\d+)$/', (string) $value, $match)) return (int) $match[1];
        return null;
    }

    private function hasCompanyColumn(string $table): bool
    {
        $db = Database::connect();
        return $db->tableExists($table) && $db->fieldExists('company_id', $table);
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
