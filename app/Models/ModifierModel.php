<?php

namespace App\Models;

class ModifierModel extends BaseAppModel
{
    protected $table = 'modifiers';
    protected $primaryKey = 'id';
    protected $allowedFields = ['company_id', 'outlet_id', 'name', 'selection_type', 'scope', 'status'];
}
