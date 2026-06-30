<?php

namespace App\Models;

class OperatingExpenseModel extends BaseAppModel
{
    protected $table = 'operating_expenses';
    protected $primaryKey = 'id';
    protected $allowedFields = [
        'company_id', 'outlet_id', 'expense_date', 'category', 'name', 'amount',
        'payment_method', 'vendor', 'reference_no', 'notes', 'status',
    ];
}
