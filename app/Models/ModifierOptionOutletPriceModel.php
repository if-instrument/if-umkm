<?php

namespace App\Models;

class ModifierOptionOutletPriceModel extends BaseAppModel
{
    protected $table = 'modifier_option_outlet_prices';
    protected $primaryKey = 'id';
    protected $allowedFields = [
        'company_id', 'outlet_id', 'modifier_option_id', 'price_delta', 'note', 'status',
    ];
}
