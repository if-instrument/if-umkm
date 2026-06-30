<?php

namespace App\Models;

class IngredientTemplateModel extends BaseAppModel
{
    protected $table = 'ingredient_templates';
    protected $primaryKey = 'id';
    protected $allowedFields = ['company_id', 'code', 'name', 'category', 'unit', 'status'];
}
