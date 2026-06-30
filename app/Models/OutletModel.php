<?php

namespace App\Models;

class OutletModel extends BaseAppModel
{
    protected $table = 'outlets';
    protected $primaryKey = 'id';
    protected $allowedFields = ['company_id', 'name', 'code', 'address', 'status'];
}
