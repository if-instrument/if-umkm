<?php

namespace App\Models;

class CategoryModel extends BaseAppModel
{
    protected $table = 'categories';
    protected $primaryKey = 'id';
    protected $allowedFields = ['company_id', 'outlet_id', 'name', 'description', 'scope', 'status'];
}
