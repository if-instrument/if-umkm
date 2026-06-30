<?php

namespace App\Services;

use Config\Database;

class DashboardService
{
    public function summary(int $companyId = 1, int $outletId = 1): array
    {
        $db = Database::connect();
        $today = date('Y-m-d');
        $ordersBuilder = $db->table('orders')
            ->where('outlet_id', $outletId)
            ->where('DATE(created_at)', $today)
        ;
        if ($db->fieldExists('company_id', 'orders')) {
            $ordersBuilder->where('company_id', $companyId);
        }
        $orders = $ordersBuilder->get()->getResultArray();
        $ingredientsBuilder = $db->table('outlet_ingredients')->where('outlet_id', $outletId);
        if ($db->fieldExists('company_id', 'outlet_ingredients')) {
            $ingredientsBuilder->where('company_id', $companyId);
        }
        $ingredients = $ingredientsBuilder->get()->getResultArray();
        $products = $outletId > 0
            ? $db->table('products')
                ->where('status', 'active')
                ->groupStart()
                ->where('outlet_id', $outletId)
                ->orWhere('outlet_id', null)
                ->groupEnd()
                ->get()
                ->getResultArray()
            : [];
        $items = $orders
            ? $db->table('order_items')->whereIn('order_id', array_column($orders, 'id'))->get()->getResultArray()
            : [];
        $paymentMethodsBuilder = $db->table('payment_methods')
            ->where('outlet_id', $outletId)
            ->where('status', 'active')
        ;
        if ($db->fieldExists('company_id', 'payment_methods')) {
            $paymentMethodsBuilder->where('company_id', $companyId);
        }
        $paymentMethods = $paymentMethodsBuilder->get()->getResultArray();
        $paymentTransactionsBuilder = $db->table('payment_transactions')
            ->where('outlet_id', $outletId)
            ->where('DATE(created_at)', $today)
        ;
        if ($db->fieldExists('company_id', 'payment_transactions')) {
            $paymentTransactionsBuilder->where('company_id', $companyId);
        }
        $paymentTransactions = $paymentTransactionsBuilder->get()->getResultArray();
        $activeTablesBuilder = $db->table('dining_tables')
            ->where('outlet_id', $outletId)
            ->where('status', 'active')
        ;
        if ($db->fieldExists('company_id', 'dining_tables')) {
            $activeTablesBuilder->where('company_id', $companyId);
        }
        $activeTables = $activeTablesBuilder->countAllResults();

        $top = [];
        foreach ($items as $item) {
            $top[$item['product_name']] = ($top[$item['product_name']] ?? 0) + (float) $item['qty'];
        }
        arsort($top);

        $last7Days = [];
        for ($i = 6; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime("-{$i} days"));
            $revenueBuilder = $db->table('orders')
                ->selectSum('grand_total', 'total')
                ->where('outlet_id', $outletId)
                ->where('DATE(created_at)', $date)
            ;
            if ($db->fieldExists('company_id', 'orders')) {
                $revenueBuilder->where('company_id', $companyId);
            }
            $revenue = (float) ($revenueBuilder->get()->getRowArray()['total'] ?? 0);
            $last7Days[] = ['date' => $date, 'revenue' => $revenue];
        }

        return [
            'metrics' => [
                'revenue' => array_sum(array_map(fn ($row) => (float) $row['grand_total'], $orders)),
                'transactions' => count($orders),
                'profit' => array_sum(array_map(fn ($row) => (float) $row['gross_profit'], $orders)),
                'productsSold' => array_sum(array_map(fn ($row) => (float) $row['qty'], $items)),
                'activeProducts' => count($products),
                'lowStock' => count(array_filter($ingredients, fn ($row) => (float) $row['stock_qty'] <= (float) $row['minimum_stock'])),
                'inventoryValue' => array_sum(array_map(fn ($row) => (float) $row['stock_qty'] * (float) $row['average_cost'], $ingredients)),
            ],
            'topProducts' => array_map(fn ($name, $qty) => ['name' => $name, 'qty' => $qty], array_keys(array_slice($top, 0, 5)), array_values(array_slice($top, 0, 5))),
            'lowStockItems' => array_map(fn ($row) => [
                'name' => $row['name'],
                'stock' => (float) $row['stock_qty'],
                'minStock' => (float) $row['minimum_stock'],
                'unit' => $row['unit'],
            ], array_slice($this->sortLowStock($ingredients), 0, 5)),
            'chart' => $last7Days,
            'operations' => [
                'openTables' => count(array_filter($orders, fn ($row) => ($row['service_type'] ?? '') === 'Dine In' && ($row['payment_status'] ?? '') === 'unpaid')),
                'kitchenQueue' => count(array_filter($orders, fn ($row) => in_array($row['status'] ?? '', ['10', '20', '30', 'waiting', 'preparing', 'ready'], true))),
                'paidOrders' => count(array_filter($orders, fn ($row) => ($row['payment_status'] ?? '') === 'paid')),
                'paymentPending' => count(array_filter($paymentTransactions, fn ($row) => ($row['status'] ?? '') === 'pending')),
                'activeTables' => $activeTables,
            ],
            'integrations' => [
                'paymentMethods' => array_values(array_map(fn ($row) => [
                    'name' => $row['name'],
                    'type' => $row['type'],
                    'provider' => $row['gateway_provider'] ?? 'manual',
                    'feeRate' => (float) ($row['fee_rate'] ?? 0),
                    'feePayer' => $row['fee_payer'] ?? 'merchant',
                ], $paymentMethods)),
            ],
            'riskSignals' => array_values(array_filter([
                [
                    'label' => 'Payment Pending',
                    'value' => count(array_filter($paymentTransactions, fn ($row) => ($row['status'] ?? '') === 'pending')),
                    'severity' => count(array_filter($paymentTransactions, fn ($row) => ($row['status'] ?? '') === 'pending')) ? 'warning' : 'ok',
                    'note' => 'Transaksi gateway belum paid',
                ],
                [
                    'label' => 'Open Bill',
                    'value' => count(array_filter($orders, fn ($row) => ($row['payment_status'] ?? '') === 'unpaid')),
                    'severity' => count(array_filter($orders, fn ($row) => ($row['payment_status'] ?? '') === 'unpaid')) ? 'warning' : 'ok',
                    'note' => 'Meja/bill belum settlement',
                ],
                [
                    'label' => 'Low Stock',
                    'value' => count(array_filter($ingredients, fn ($row) => (float) $row['stock_qty'] <= (float) $row['minimum_stock'])),
                    'severity' => count(array_filter($ingredients, fn ($row) => (float) $row['stock_qty'] <= (float) $row['minimum_stock'])) ? 'warning' : 'ok',
                    'note' => 'Bahan perlu restock',
                ],
            ], fn ($signal) => (int) $signal['value'] > 0)),
        ];
    }

    private function sortLowStock(array $ingredients): array
    {
        usort($ingredients, fn ($a, $b) => ((float) $a['stock_qty'] / max((float) $a['minimum_stock'], 1)) <=> ((float) $b['stock_qty'] / max((float) $b['minimum_stock'], 1)));
        return $ingredients;
    }
}
