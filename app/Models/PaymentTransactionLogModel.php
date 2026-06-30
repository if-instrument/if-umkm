<?php

namespace App\Models;

class PaymentTransactionLogModel extends BaseAppModel
{
    protected $table = 'payment_transaction_logs';
    protected $primaryKey = 'id';
    protected $allowedFields = [
        'payment_transaction_id', 'company_id', 'outlet_id', 'direction', 'action',
        'target', 'http_method', 'http_status', 'status', 'request_payload',
        'response_payload', 'error_message',
    ];
}
