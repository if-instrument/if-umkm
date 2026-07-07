<?php

namespace App\Models;

class ProductModel extends BaseAppModel
{
    protected $table = 'products';
    protected $primaryKey = 'id';
    protected $allowedFields = [
        'company_id', 'outlet_id', 'sku', 'name', 'description',
        'image_path', 'selling_price', 'scope', 'recipe_status', 'inventory_type',
        'shelf_life_days', 'status', 'is_preorder', 'preorder_note'
    ];
}
