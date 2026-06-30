<?php

namespace App\Models;

class IngredientModel extends BaseAppModel
{
    protected $table = 'outlet_ingredients';
    protected $primaryKey = 'id';
    protected $allowedFields = [
        'company_id', 'outlet_id', 'template_id', 'sku', 'name', 'category', 'unit',
        'stock_qty', 'minimum_stock', 'average_cost', 'standard_cost', 'status'
    ];
}
