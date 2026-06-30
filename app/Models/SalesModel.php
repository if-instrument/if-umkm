<?php

namespace App\Models;

use CodeIgniter\Model;
use Config\Database;

class SalesModel extends Model
{
    protected $DBGroup = 'default';

    public function orders(int $companyId, int $outletId): array
    {
        $db = Database::connect();
        $builder = $db
            ->table('orders')
            ->where('outlet_id', $outletId)
            ->orderBy('created_at', 'ASC');
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
