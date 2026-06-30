<?php

namespace App\Models;

class RecipeIngredientModel extends BaseAppModel
{
    protected $table = 'product_recipe_items';
    protected $primaryKey = 'id';
    protected $allowedFields = ['company_id', 'product_id', 'template_id', 'qty', 'unit'];
}
