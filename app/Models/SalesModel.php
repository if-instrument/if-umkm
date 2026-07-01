<?php

namespace App\Models;

use CodeIgniter\Model;
use Config\Database;
use App\Services\StatusCodeService;

class SalesModel extends Model
{
    protected $DBGroup = 'default';

    public function orders(int $companyId, int $outletId, array $filters = []): array
    {
        $db = Database::connect();
        $builder = $db
            ->table('orders')
            ->where('outlet_id', $outletId)
            ->orderBy('created_at', 'ASC');
        if ($db->fieldExists('company_id', 'orders')) {
            $builder->where('company_id', $companyId);
        }

        $date = trim((string) ($filters['date'] ?? ''));
        $includeOpen = filter_var($filters['include_open'] ?? $filters['includeOpen'] ?? false, FILTER_VALIDATE_BOOLEAN);
        if ($date !== '' && $includeOpen) {
            $builder
                ->groupStart()
                ->where('DATE(created_at)', $date)
                ->orWhereIn('status', [
                    StatusCodeService::ORDER_PENDING_CASHIER,
                    StatusCodeService::ORDER_WAITING,
                    StatusCodeService::ORDER_PREPARING,
                    StatusCodeService::ORDER_READY,
                    'pending_cashier',
                    'waiting',
                    'preparing',
                    'ready',
                ])
                ->orWhereIn('payment_status', [StatusCodeService::PAYMENT_UNPAID, 'unpaid', 'pending'])
                ->groupEnd();
        } elseif ($date !== '') {
            $builder->where('DATE(created_at)', $date);
        } elseif ($includeOpen) {
            $builder
                ->groupStart()
                ->whereIn('status', [
                    StatusCodeService::ORDER_PENDING_CASHIER,
                    StatusCodeService::ORDER_WAITING,
                    StatusCodeService::ORDER_PREPARING,
                    StatusCodeService::ORDER_READY,
                    'pending_cashier',
                    'waiting',
                    'preparing',
                    'ready',
                ])
                ->orWhereIn('payment_status', [StatusCodeService::PAYMENT_UNPAID, 'unpaid', 'pending'])
                ->groupEnd();
        }

        return $builder->get()->getResultArray();
    }

    public function orderItems(array $orderIds): array
    {
        if (! $orderIds) return [];

        return Database::connect()
            ->table('order_items')
            ->whereIn('order_id', $orderIds)
            ->orderBy('id', 'ASC')
            ->get()
            ->getResultArray();
    }

    public function products(int $companyId, int $outletId): array
    {
        $db = Database::connect();
        $builder = $db
            ->table('products')
            ->groupStart()
            ->where('outlet_id', $outletId)
            ->orWhere('outlet_id', null)
            ->groupEnd()
        ;
        if ($db->fieldExists('company_id', 'products')) {
            $builder->where('company_id', $companyId);
        }
        return $builder->get()->getResultArray();
    }
}
