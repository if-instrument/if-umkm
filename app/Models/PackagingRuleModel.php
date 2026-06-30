<?php

namespace App\Models;

class PackagingRuleModel extends BaseAppModel
{
    protected $table = 'packaging_rules';
    protected $primaryKey = 'id';
    protected $allowedFields = ['company_id', 'outlet_id', 'name', 'min_qty', 'max_qty', 'status'];
}
