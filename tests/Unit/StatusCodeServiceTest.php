<?php

namespace Tests\Unit;

use App\Services\StatusCodeService;
use CodeIgniter\Test\CIUnitTestCase;

class StatusCodeServiceTest extends CIUnitTestCase
{
    public function testCommonStatusNormalization(): void
    {
        $this->assertSame(StatusCodeService::ACTIVE, StatusCodeService::common('10'));
        $this->assertSame(StatusCodeService::ACTIVE, StatusCodeService::common('active'));
        $this->assertSame(StatusCodeService::ACTIVE, StatusCodeService::common('ACTIVE'));
        $this->assertSame(StatusCodeService::ACTIVE, StatusCodeService::common('enabled'));

        $this->assertSame(StatusCodeService::INACTIVE, StatusCodeService::common('90'));
        $this->assertSame(StatusCodeService::INACTIVE, StatusCodeService::common('inactive'));
        $this->assertSame(StatusCodeService::INACTIVE, StatusCodeService::common('INACTIVE'));
        $this->assertSame(StatusCodeService::INACTIVE, StatusCodeService::common('disabled'));

        $this->assertTrue(StatusCodeService::isActive('10'));
        $this->assertTrue(StatusCodeService::isActive('active'));
        $this->assertFalse(StatusCodeService::isActive('90'));

        $this->assertTrue(StatusCodeService::isInactive('90'));
        $this->assertTrue(StatusCodeService::isInactive('inactive'));
    }

    public function testOrderStatusNormalization(): void
    {
        $this->assertSame(StatusCodeService::ORDER_PENDING_CASHIER, StatusCodeService::order('00'));
        $this->assertSame(StatusCodeService::ORDER_PENDING_CASHIER, StatusCodeService::order('pending_cashier'));
        $this->assertSame(StatusCodeService::ORDER_WAITING, StatusCodeService::order('10'));
        $this->assertSame(StatusCodeService::ORDER_WAITING, StatusCodeService::order('waiting'));
        $this->assertSame(StatusCodeService::ORDER_FULFILLMENT, StatusCodeService::order('15'));
        $this->assertSame(StatusCodeService::ORDER_FULFILLMENT, StatusCodeService::order('fulfillment'));
        $this->assertSame(StatusCodeService::ORDER_PREPARING, StatusCodeService::order('20'));
        $this->assertSame(StatusCodeService::ORDER_PREPARING, StatusCodeService::order('preparing'));
        $this->assertSame(StatusCodeService::ORDER_READY, StatusCodeService::order('30'));
        $this->assertSame(StatusCodeService::ORDER_READY, StatusCodeService::order('ready'));
        $this->assertSame(StatusCodeService::ORDER_COMPLETED, StatusCodeService::order('90'));
        $this->assertSame(StatusCodeService::ORDER_COMPLETED, StatusCodeService::order('completed'));
        $this->assertSame(StatusCodeService::ORDER_CANCELLED, StatusCodeService::order('99'));
        $this->assertSame(StatusCodeService::ORDER_CANCELLED, StatusCodeService::order('cancelled'));

        $this->assertTrue(StatusCodeService::isOrderCompleted('90'));
        $this->assertTrue(StatusCodeService::isOrderCompleted('completed'));
        $this->assertTrue(StatusCodeService::isOrderCancelled('99'));
        $this->assertTrue(StatusCodeService::isOrderCancelled('cancelled'));
    }

    public function testPaymentStatusNormalization(): void
    {
        $this->assertSame(StatusCodeService::PAYMENT_UNPAID, StatusCodeService::payment('00'));
        $this->assertSame(StatusCodeService::PAYMENT_UNPAID, StatusCodeService::payment('unpaid'));
        $this->assertSame(StatusCodeService::PAYMENT_PAID, StatusCodeService::payment('10'));
        $this->assertSame(StatusCodeService::PAYMENT_PAID, StatusCodeService::payment('paid'));
        $this->assertSame(StatusCodeService::PAYMENT_FAILED, StatusCodeService::payment('20'));
        $this->assertSame(StatusCodeService::PAYMENT_FAILED, StatusCodeService::payment('failed'));
        $this->assertSame(StatusCodeService::PAYMENT_EXPIRED, StatusCodeService::payment('30'));
        $this->assertSame(StatusCodeService::PAYMENT_EXPIRED, StatusCodeService::payment('expired'));

        $this->assertTrue(StatusCodeService::isPaid('10'));
        $this->assertTrue(StatusCodeService::isPaid('paid'));
        $this->assertTrue(StatusCodeService::isUnpaid('00'));
        $this->assertTrue(StatusCodeService::isUnpaid('unpaid'));
    }
}
