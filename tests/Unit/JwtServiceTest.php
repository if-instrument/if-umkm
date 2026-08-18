<?php

namespace Tests\Unit;

use App\Services\JwtService;
use CodeIgniter\Test\CIUnitTestCase;

class JwtServiceTest extends CIUnitTestCase
{
    private JwtService $jwt;

    protected function setUp(): void
    {
        parent::setUp();
        $this->jwt = new JwtService();
    }

    public function testIssueAndVerifyValidToken(): void
    {
        $claims = [
            'sub' => '123',
            'email' => 'test@example.com',
            'authType' => 'company_admin',
            'companyId' => 'company-main',
        ];

        $token = $this->jwt->issue($claims, 3600);
        $this->assertIsString($token);
        $this->assertCount(3, explode('.', $token));

        $verified = $this->jwt->verify($token);
        $this->assertIsArray($verified);
        $this->assertSame('123', $verified['sub']);
        $this->assertSame('test@example.com', $verified['email']);
        $this->assertSame('company_admin', $verified['authType']);
        $this->assertSame('company-main', $verified['companyId']);
        $this->assertSame('if-instrument-umkm', $verified['iss']);
        $this->assertArrayHasKey('iat', $verified);
        $this->assertArrayHasKey('exp', $verified);
    }

    public function testVerifyRejectsTamperedToken(): void
    {
        $claims = ['sub' => '123', 'email' => 'test@example.com'];
        $token = $this->jwt->issue($claims, 3600);
        $parts = explode('.', $token);

        // Tamper with payload
        $tamperedPayload = rtrim(strtr(base64_encode(json_encode(['sub' => '999', 'email' => 'hacker@example.com', 'exp' => time() + 3600])), '+/', '-_'), '=');
        $tamperedToken = $parts[0] . '.' . $tamperedPayload . '.' . $parts[2];

        $this->assertNull($this->jwt->verify($tamperedToken));
    }

    public function testVerifyRejectsMalformedToken(): void
    {
        $this->assertNull($this->jwt->verify('invalid-token-string'));
        $this->assertNull($this->jwt->verify('part1.part2'));
        $this->assertNull($this->jwt->verify(''));
    }

    public function testVerifyRejectsExpiredToken(): void
    {
        $claims = ['sub' => '123', 'email' => 'test@example.com'];
        // Issue token with -10 seconds TTL (already expired)
        $token = $this->jwt->issue($claims, -10);

        $this->assertNull($this->jwt->verify($token));
    }
}
