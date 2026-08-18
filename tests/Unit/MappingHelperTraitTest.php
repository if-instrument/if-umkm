<?php

namespace Tests\Unit;

use App\Services\Shared\MappingHelperTrait;
use CodeIgniter\Test\CIUnitTestCase;

class MappingHelperTraitConsumer
{
    use MappingHelperTrait;

    public function getCompanyCode(int $id): string
    {
        return $this->companyCode($id);
    }

    public function getOutletCode(int $id): string
    {
        return $this->outletCode($id);
    }

    public function getUserCode(array $row): string
    {
        return $this->userCode($row);
    }

    public function checkRowBelongsToCompany(array $row, int $companyId): bool
    {
        return $this->rowBelongsToCompany($row, $companyId);
    }
}

class MappingHelperTraitTest extends CIUnitTestCase
{
    private MappingHelperTraitConsumer $helper;

    protected function setUp(): void
    {
        parent::setUp();
        $this->helper = new MappingHelperTraitConsumer();
    }

    public function testCompanyCodeFormatting(): void
    {
        $this->assertSame('company-main', $this->helper->getCompanyCode(1));
        $this->assertSame('company-5', $this->helper->getCompanyCode(5));
        $this->assertSame('company-12', $this->helper->getCompanyCode(12));
    }

    public function testOutletCodeFormatting(): void
    {
        $this->assertSame('outlet-main', $this->helper->getOutletCode(1));
        $this->assertSame('outlet-north', $this->helper->getOutletCode(2));
        $this->assertSame('outlet-south', $this->helper->getOutletCode(3));
        $this->assertSame('outlet-4', $this->helper->getOutletCode(4));
    }

    public function testUserCodeFormatting(): void
    {
        $this->assertSame('usr-super-admin', $this->helper->getUserCode(['email' => 'if.imam.faisal@gmail.com']));
        $this->assertSame('usr-super-admin', $this->helper->getUserCode(['email' => 'superadmin@app.test']));
        $this->assertSame('usr-kasir', $this->helper->getUserCode(['email' => 'kasir@ifresso.id']));
        $this->assertSame('usr-kitchen', $this->helper->getUserCode(['email' => 'kitchen@ifresso.id']));
        $this->assertSame('usr-99', $this->helper->getUserCode(['id' => 99, 'email' => 'other@example.com']));
    }

    public function testRowBelongsToCompany(): void
    {
        $this->assertTrue($this->helper->checkRowBelongsToCompany(['name' => 'General Item'], 1));
        $this->assertTrue($this->helper->checkRowBelongsToCompany(['company_id' => 5, 'name' => 'Item 5'], 5));
        $this->assertFalse($this->helper->checkRowBelongsToCompany(['company_id' => 5, 'name' => 'Item 5'], 1));
    }
}
