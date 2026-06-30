<?php

namespace App\Models;

class CustomerMemberModel extends BaseAppModel
{
    protected $table = 'customer_members';
    protected $primaryKey = 'id';
    protected $allowedFields = [
        'company_id', 'outlet_id', 'name', 'email', 'phone', 'status', 'last_order_at',
    ];
}
