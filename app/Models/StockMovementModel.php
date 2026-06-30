<?php

namespace App\Models;

class StockMovementModel extends BaseAppModel
{
    protected $table = 'stock_movements';
    protected $primaryKey = 'id';
    protected $allowedFields = [
        'company_id', 'outlet_id', 'outlet_ingredient_id', 'movement_type', 'reference_type',
        'reference_id', 'stock_before', 'qty_in', 'qty_out', 'stock_after',
        'unit_cost', 'total_cost', 'notes', 'created_by'
    ];
}
