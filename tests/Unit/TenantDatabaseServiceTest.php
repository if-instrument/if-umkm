<?php

namespace Tests\Unit;

use App\Services\TenantDatabaseService;
use CodeIgniter\Test\CIUnitTestCase;

class TenantDatabaseServiceTest extends CIUnitTestCase
{
    private TenantDatabaseService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new TenantDatabaseService();
    }

    public function testSuperAdminClaimsDoNotActivateTenant(): void
    {
        $claims = [
            'authType' => 'super_admin',
            'companyId' => 'company-main',
            'companySlug' => 'IFresso-Coffee',
        ];

        $result = $this->service->activateForClaims($claims);
        $this->assertNull($result);
    }

    public function testNonExistentCompanySlugReturnsNull(): void
    {
        $result = $this->service->companyBySlug('non-existent-company-slug-xyz');
        $this->assertNull($result);
    }
}
