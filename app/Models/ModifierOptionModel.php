<?php

namespace App\Models;

class ModifierOptionModel extends BaseAppModel
{
    protected $table = 'modifier_options';
    protected $primaryKey = 'id';
    protected $allowedFields = ['modifier_id', 'name', 'price_delta', 'ingredient_rules', 'status'];
}
