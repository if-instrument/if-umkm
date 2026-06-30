<?php

namespace App\Models;

class ProductOutletCategoryModel extends BaseAppModel
{
    protected $table = 'product_outlet_categories';
    protected $primaryKey = 'id';
    protected $allowedFields = ['company_id', 'outlet_id', 'product_id', 'category_id'];
}
