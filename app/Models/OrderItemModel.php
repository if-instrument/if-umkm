<?php

namespace App\Models;

class OrderItemModel extends BaseAppModel
{
    protected $table = 'order_items';
    protected $primaryKey = 'id';
    protected $allowedFields = [
        'order_id', 'product_id', 'product_name', 'qty', 'unit_price',
        'line_total', 'cogs_total', 'modifier_snapshot', 'recipe_snapshot'
    ];
}
