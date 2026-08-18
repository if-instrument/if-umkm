<?php

namespace Tests\Unit;

use App\Services\ReceiptRendererService;
use CodeIgniter\Test\CIUnitTestCase;

class ReceiptRendererServiceTest extends CIUnitTestCase
{
    private ReceiptRendererService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new ReceiptRendererService();
    }

    public function testRenderHtmlContainsOrderData(): void
    {
        $order = [
            'order_no' => 'POS-00123',
            'created_at' => '2026-08-18 10:00:00',
            'service_type' => 'Dine In',
            'customer_name' => 'Budi',
            'table_name' => 'Meja 1',
            'payment_status' => 'paid',
            'payment_method' => 'QRIS',
            'product_revenue' => 50000,
            'packaging_fee' => 2000,
            'tax_total' => 5500,
            'grand_total' => 57500,
            'payment_fee' => 0,
        ];

        $company = [
            'name' => 'IFresso Coffee',
            'brand_name' => 'IFresso Coffee',
            'logo_path' => '',
        ];

        $outlet = [
            'name' => 'Outlet Pusat',
            'code' => 'PST',
            'address' => 'Jl. Sudirman No. 10',
        ];

        $items = [
            [
                'product_name' => 'Kopi Susu Gula Aren',
                'qty' => 2,
                'price' => 25000,
                'subtotal' => 50000,
                'modifier_snapshot' => json_encode(['modifiers' => ['Less Sugar', 'Oatmilk']]),
            ]
        ];

        $html = $this->service->renderHtml($order, $company, $outlet, $items);

        $this->assertStringContainsString('POS-00123', $html);
        $this->assertStringContainsString('IFresso Coffee', $html);
        $this->assertStringContainsString('Outlet Pusat', $html);
        $this->assertStringContainsString('Kopi Susu Gula Aren', $html);
        $this->assertStringContainsString('Rp 57.500', $html);
        $this->assertStringContainsString('QRIS', $html);
    }
}
