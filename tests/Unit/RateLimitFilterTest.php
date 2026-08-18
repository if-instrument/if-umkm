<?php

namespace Tests\Unit;

use App\Filters\RateLimitFilter;
use CodeIgniter\Config\Services;
use CodeIgniter\HTTP\IncomingRequest;
use CodeIgniter\HTTP\ResponseInterface;
use CodeIgniter\HTTP\URI;
use CodeIgniter\HTTP\UserAgent;
use CodeIgniter\Test\CIUnitTestCase;
use Config\App;

class RateLimitFilterTest extends CIUnitTestCase
{
    private RateLimitFilter $filter;

    protected function setUp(): void
    {
        parent::setUp();
        $this->filter = new RateLimitFilter();
    }

    public function testRateLimiterAllowsInitialRequestsAndRejectsExcess(): void
    {
        $uri = new URI('http://localhost:8081/api/test-limit-' . uniqid());
        $config = new App();
        $userAgent = new UserAgent();

        $capacity = 3;
        $duration = 60;

        // Fire 3 allowed requests
        for ($i = 0; $i < $capacity; $i++) {
            $request = new IncomingRequest($config, $uri, 'php://input', $userAgent);
            $response = $this->filter->before($request, [(string) $capacity, (string) $duration]);
            $this->assertNull($response, "Request $i should be allowed.");
        }

        // 4th request must be rejected with 429
        $request = new IncomingRequest($config, $uri, 'php://input', $userAgent);
        $response = $this->filter->before($request, [(string) $capacity, (string) $duration]);

        $this->assertInstanceOf(ResponseInterface::class, $response);
        $this->assertSame(429, $response->getStatusCode());
        $this->assertSame((string) $duration, $response->getHeaderLine('Retry-After'));

        $body = json_decode($response->getBody(), true);
        $this->assertFalse($body['ok']);
        $this->assertSame($duration, $body['retry_after']);
    }
}
