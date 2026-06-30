<?php

namespace App\Models;

class DiningTableModel extends BaseAppModel
{
    protected $table = 'dining_tables';
    protected $primaryKey = 'id';
    protected $allowedFields = ['company_id', 'outlet_id', 'name', 'area', 'capacity', 'sort_order', 'status'];
}
