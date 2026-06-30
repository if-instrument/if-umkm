<?php

namespace App\Models;

class PaymentMethodModel extends BaseAppModel
{
    protected $table = 'payment_methods';
    protected $primaryKey = 'id';
    protected $allowedFields = [
        'company_id', 'outlet_id', 'name', 'type', 'gateway_provider', 'qris_mode', 'qris_image_path',
        'channel_code', 'terminal_id', 'edc_mode', 'merchant_id', 'terminal_serial',
        'connector_status', 'use_sandbox', 'fee_rate', 'fee_payer',
        'account', 'sort_order', 'status',
    ];
}
