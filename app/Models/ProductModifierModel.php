<?php

namespace App\Models;

use CodeIgniter\Model;

class ProductModifierModel extends Model
{
    protected $table = 'product_modifiers';
    protected $primaryKey = '';
    protected $allowedFields = ['product_id', 'modifier_id'];
    protected $returnType = 'array';
}
