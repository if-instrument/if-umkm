<?php

namespace Tests\Unit;

use App\Services\ProfitLossService;
use CodeIgniter\Test\CIUnitTestCase;

class ProfitLossServiceTest extends CIUnitTestCase
{
    private ProfitLossService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new ProfitLossService();
    }

    public function testRangeCalculation(): void
    {
        $reflection = new \ReflectionClass($this->service);
        $method = $reflection->getMethod('range');
        $method->setAccessible(true);

        // Daily
        $daily = $method->invoke($this->service, 'daily', '2026-08-18');
        $this->assertSame('daily', $daily['period']);
        $this->assertSame('2026-08-18', $daily['start']);
        $this->assertSame('2026-08-18', $daily['end']);

        // Monthly
        $monthly = $method->invoke($this->service, 'monthly', '2026-08-18');
        $this->assertSame('monthly', $monthly['period']);
        $this->assertSame('2026-08-01', $monthly['start']);
        $this->assertSame('2026-08-31', $monthly['end']);

        // Yearly
        $yearly = $method->invoke($this->service, 'yearly', '2026-08-18');
        $this->assertSame('yearly', $yearly['period']);
        $this->assertSame('2026-01-01', $yearly['start']);
        $this->assertSame('2026-12-31', $yearly['end']);
    }
}
