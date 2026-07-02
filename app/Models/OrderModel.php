<?php

namespace App\Models;

class OrderModel extends BaseAppModel
{
    protected $table = 'orders';
    protected $primaryKey = 'id';
    protected $allowedFields = [
        'company_id', 'outlet_id', 'order_no', 'service_type', 'customer_name',
        'customer_email', 'customer_phone', 'customer_member_id',
        'table_name', 'table_flow', 'status', 'status_updated_at', 'ready_item_keys',
        'payment_status', 'payment_method', 'paid_at', 'subtotal', 'packaging_fee',
        'payment_fee', 'payment_fee_payer', 'tax_total', 'grand_total', 'cogs_total', 'gross_profit', 'packaging_source',
        'packaging_note', 'last_order_added_at', 'cash_tendered', 'change_due',
        'payment_provider', 'payment_reference', 'payment_proof_path', 'payment_proof_note'
    ];
}
