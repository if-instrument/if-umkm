<?php

namespace App\Models;

use CodeIgniter\Model;
use Config\Database;

class ReportModel extends Model
{
    protected $DBGroup = 'default';

    public function outlet(int $outletId): ?array
    {
        return Database::connect()
            ->table('outlets')
            ->where('id', $outletId)
            ->get()
            ->getRowArray() ?: null;
    }

    public function paidOrders(int $companyId, int $outletId, array $range): array
    {
        $db = Database::connect();
        $builder = $db
            ->table('orders')
            ->where('outlet_id', $outletId)
            ->where('payment_status !=', 'unpaid')
            ->where('created_at >=', $range['startDateTime'])
            ->where('created_at <=', $range['endDateTime'])
            ->orderBy('created_at', 'DESC');
        if ($db->fieldExists('company_id', 'orders')) {
            $builder->where('company_id', $companyId);
        }
        return $builder->get()->getResultArray();
    }

    public function orderItems(array $orderIds): array
    {
        if (! $orderIds) return [];

        return Database::connect()
            ->table('order_items')
            ->whereIn('order_id', $orderIds)
            ->get()
            ->getResultArray();
    }

    public function stockMovements(int $companyId, int $outletId, array $range): array
    {
        $db = Database::connect();
        $builder = $db
            ->table('stock_movements m')
            ->select('m.*, i.name ingredient_name, i.unit ingredient_unit')
            ->join('outlet_ingredients i', 'i.id = m.outlet_ingredient_id', 'left')
            ->where('m.outlet_id', $outletId)
            ->where('m.created_at >=', $range['startDateTime'])
            ->where('m.created_at <=', $range['endDateTime'])
            ->orderBy('m.created_at', 'DESC');
        if ($db->fieldExists('company_id', 'stock_movements')) {
            $builder->where('m.company_id', $companyId);
        }
        return $builder->get()->getResultArray();
    }

    public function productBatchMovements(int $companyId, int $outletId, array $range): array
    {
        $db = Database::connect();
        if (! $db->tableExists('product_batch_movements')) {
            return [];
        }

        $builder = $db
            ->table('product_batch_movements m')
            ->select('m.*, p.name product_name, p.sku product_sku, b.batch_no')
            ->join('products p', 'p.id = m.product_id', 'left')
            ->join('product_batches b', 'b.id = m.product_batch_id', 'left')
            ->where('m.outlet_id', $outletId)
            ->where('m.created_at >=', $range['startDateTime'])
            ->where('m.created_at <=', $range['endDateTime'])
            ->orderBy('m.created_at', 'DESC');
        if ($db->fieldExists('company_id', 'product_batch_movements')) {
            $builder->where('m.company_id', $companyId);
        }
        return $builder->get()->getResultArray();
    }

    public function operatingExpenses(int $companyId, int $outletId, array $range): array
    {
        $db = Database::connect();
        if (! $db->tableExists('operating_expenses')) {
            return [];
        }

        $builder = $db
            ->table('operating_expenses')
            ->where('outlet_id', $outletId)
            ->where('expense_date >=', $range['start'])
            ->where('expense_date <=', $range['end'])
            ->where('status !=', 'void')
            ->orderBy('expense_date', 'DESC')
            ->orderBy('id', 'DESC');
        if ($db->fieldExists('company_id', 'operating_expenses')) {
            $builder->where('company_id', $companyId);
        }
        return $builder->get()->getResultArray();
    }
}
