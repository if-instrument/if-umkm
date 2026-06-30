<?php

namespace App\Models;

class PackagingRuleItemModel extends BaseAppModel
{
    protected $table = 'packaging_rule_items';
    protected $primaryKey = 'id';
    protected $allowedFields = ['packaging_rule_id', 'outlet_ingredient_id', 'qty', 'price', 'is_fallback'];
}
