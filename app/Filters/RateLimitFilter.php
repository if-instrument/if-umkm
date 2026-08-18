<?php

namespace App\Filters;

use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;
use Config\Services;

class RateLimitFilter implements FilterInterface
{
    public function before(RequestInterface $request, $arguments = null)
    {
        $throttler = Services::throttler();

        // Default: 10 requests per 60 seconds
        $capacity = 10;
        $seconds = 60;

        if (is_array($arguments) && count($arguments) >= 2) {
            $capacity = (int) $arguments[0];
            $seconds = (int) $arguments[1];
        } elseif (is_array($arguments) && count($arguments) === 1) {
            $capacity = (int) $arguments[0];
        }

        $ip = $request->getIPAddress();
        $path = trim($request->getUri()->getPath(), '/');
        $key = 'rate_' . md5($ip . '_' . strtolower($request->getMethod()) . '_' . $path);

        if ($throttler->check($key, $capacity, $seconds, 1) === false) {
            return Services::response()
                ->setStatusCode(429)
                ->setHeader('Retry-After', (string) $seconds)
                ->setJSON([
                    'ok' => false,
                    'message' => 'Terlalu banyak permintaan. Silakan coba lagi dalam beberapa saat.',
                    'retry_after' => $seconds,
                ]);
        }
    }

    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
    }
}
