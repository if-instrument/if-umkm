<?php

namespace Tests\Unit;

use App\Services\InventoryService;
use App\Services\StatusCodeService;
use CodeIgniter\Test\CIUnitTestCase;

class InventoryServiceTest extends CIUnitTestCase
{
    private InventoryService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new InventoryService();
    }

    public function testIngredientPayloadFormatting(): void
    {
        $reflection = new \ReflectionClass($this->service);
        $method = $reflection->getMethod('ingredientPayload');
        $method->setAccessible(true);

        $row = [
            'id' => 15,
            'template_id' => 3,
            'template_code' => 'TPL-COFFEE',
            'template_name' => 'Biji Kopi Arabika',
            'template_category' => 'Bahan Baku',
            'template_unit' => 'gram',
            'company_id' => 1,
            'outlet_id' => 2,
            'sku' => 'ING-COFFEE-01',
            'name' => 'Biji Kopi Arabika House Blend',
            'category' => 'Bahan Baku',
            'unit' => 'gram',
            'stock_qty' => 5000.5,
            'average_cost' => 250,
            'standard_cost' => 240,
            'minimum_stock' => 1000,
            'status' => '10',
        ];

        $payload = $method->invoke($this->service, $row);

        $this->assertSame('ing-15', $payload['id']);
        $this->assertSame('TPL-COFFEE', $payload['templateCode']);
        $this->assertSame('Biji Kopi Arabika', $payload['templateName']);
        $this->assertSame('company-main', $payload['companyId']);
        $this->assertSame('outlet-north', $payload['outletId']);
        $this->assertSame('ING-COFFEE-01', $payload['sku']);
        $this->assertSame('Biji Kopi Arabika House Blend', $payload['name']);
        $this->assertSame(5000.5, $payload['stock']);
        $this->assertSame(250.0, $payload['avgCost']);
        $this->assertSame(240.0, $payload['standardCost']);
        $this->assertSame(1000.0, $payload['minStock']);
        $this->assertSame(StatusCodeService::ACTIVE, $payload['status']);
    }

    public function testMovementPayloadInboundFormatting(): void
    {
        $reflection = new \ReflectionClass($this->service);
        $method = $reflection->getMethod('movementPayload');
        $method->setAccessible(true);

        $row = [
            'id' => 101,
            'created_at' => '2026-08-18 10:00:00',
            'company_id' => 1,
            'outlet_id' => 1,
            'outlet_ingredient_id' => 5,
            'ingredient_sku' => 'ING-005',
            'movement_type' => 'purchase',
            'stock_before' => 100,
            'qty_in' => 50,
            'qty_out' => 0,
            'stock_after' => 150,
            'unit_cost' => 12000,
            'total_cost' => 600000,
            'notes' => 'Pembelian supplier',
        ];

        $payload = $method->invoke($this->service, $row);

        $this->assertSame('mov-101', $payload['id']);
        $this->assertSame('company-main', $payload['companyId']);
        $this->assertSame('outlet-main', $payload['outletId']);
        $this->assertSame('ing-5', $payload['ingredientId']);
        $this->assertSame('purchase', $payload['type']);
        $this->assertSame(100.0, $payload['beforeQty']);
        $this->assertSame(50.0, $payload['qty']);
        $this->assertSame(150.0, $payload['afterQty']);
        $this->assertSame(600000.0, $payload['totalCost']);
        $this->assertSame('Pembelian supplier', $payload['note']);
    }

    public function testMovementPayloadOutboundLossFormatting(): void
    {
        $reflection = new \ReflectionClass($this->service);
        $method = $reflection->getMethod('movementPayload');
        $method->setAccessible(true);

        $row = [
            'id' => 102,
            'created_at' => '2026-08-18 11:00:00',
            'company_id' => 1,
            'outlet_id' => 1,
            'outlet_ingredient_id' => 5,
            'ingredient_sku' => 'ING-005',
            'movement_type' => 'waste',
            'stock_before' => 150,
            'qty_in' => 0,
            'qty_out' => 10,
            'stock_after' => 140,
            'unit_cost' => 12000,
            'total_cost' => 120000,
            'notes' => 'Tumpah saat operasional',
        ];

        $payload = $method->invoke($this->service, $row);

        $this->assertSame('mov-102', $payload['id']);
        $this->assertSame('inventory_loss', $payload['category']);
        $this->assertSame(-10.0, $payload['qty']);
        $this->assertSame(140.0, $payload['afterQty']);
    }

    public function testIngredientIdExtraction(): void
    {
        $reflection = new \ReflectionClass($this->service);
        $method = $reflection->getMethod('ingredientId');
        $method->setAccessible(true);

        $this->assertSame(25, $method->invoke($this->service, 'ing-25'));
        $this->assertSame(25, $method->invoke($this->service, 25));
        $this->assertSame(25, $method->invoke($this->service, '25'));
        $this->assertNull($method->invoke($this->service, 'invalid-code'));
        $this->assertNull($method->invoke($this->service, null));
    }
}
