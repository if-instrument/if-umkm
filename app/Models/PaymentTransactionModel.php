<?php

namespace App\Models;

class PaymentTransactionModel extends BaseAppModel
{
    protected $table = 'payment_transactions';
    protected $primaryKey = 'id';
    protected $allowedFields = [
        'company_id', 'outlet_id', 'order_id', 'order_no', 'payment_method_id',
        'method_name', 'method_type', 'provider', 'provider_reference', 'amount',
        'fee_amount', 'status', 'qr_payload', 'edc_instruction', 'request_payload',
        'response_payload', 'paid_at',
    ];
}
