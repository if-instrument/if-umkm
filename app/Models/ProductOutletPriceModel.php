<?php

namespace App\Models;

class ProductOutletPriceModel extends BaseAppModel
{
    protected $table = 'product_outlet_prices';
    protected $primaryKey = 'id';
    protected $allowedFields = [
        'company_id', 'outlet_id', 'product_id', 'selling_price', 'note', 'status',
    ];
}
