<?php

namespace Tests\Unit;

use App\Traits\ApiResponseTrait;
use CodeIgniter\Test\CIUnitTestCase;

class ApiResponseConsumer
{
    use ApiResponseTrait;

    public function success($data = null, string $message = '', array $meta = [], int $status = 200)
    {
        return $this->respondSuccess($data, $message, $meta, $status);
    }

    public function created($data = null, string $message = 'Data berhasil disimpan.')
    {
        return $this->respondCreated($data, $message);
    }

    public function error(string $message, int $status = 422, array $errors = [], ?string $code = null)
    {
        return $this->respondError($message, $status, $errors, $code);
    }

    public function notFound(string $message = 'Data tidak ditemukan.')
    {
        return $this->respondNotFound($message);
    }

    public function forbidden(string $message = 'Akses ditolak.')
    {
        return $this->respondForbidden($message);
    }

    public function unauthorized(string $message = 'Sesi tidak sah.')
    {
        return $this->respondUnauthorized($message);
    }

    public function runAction(callable $action, string $message = '', int $status = 200)
    {
        return $this->jsonAction($action, $message, $status);
    }
}

class ApiResponseTest extends CIUnitTestCase
{
    private ApiResponseConsumer $api;

    protected function setUp(): void
    {
        parent::setUp();
        $this->api = new ApiResponseConsumer();
    }

    public function testRespondSuccessEnvelope(): void
    {
        $response = $this->api->success(['id' => 1, 'name' => 'Produk A'], 'Data loaded', ['page' => 1, 'total' => 10]);

        $this->assertSame(200, $response->getStatusCode());
        $body = json_decode($response->getBody(), true);

        $this->assertTrue($body['ok']);
        $this->assertSame(['id' => 1, 'name' => 'Produk A'], $body['data']);
        $this->assertSame('Data loaded', $body['message']);
        $this->assertSame(['page' => 1, 'total' => 10], $body['meta']);
    }

    public function testRespondCreatedEnvelope(): void
    {
        $response = $this->api->created(['id' => 99]);

        $this->assertSame(201, $response->getStatusCode());
        $body = json_decode($response->getBody(), true);

        $this->assertTrue($body['ok']);
        $this->assertSame(['id' => 99], $body['data']);
        $this->assertSame('Data berhasil disimpan.', $body['message']);
    }

    public function testRespondErrorEnvelope(): void
    {
        $response = $this->api->error('Validasi gagal', 422, ['email' => ['Email tidak valid']], 'VALIDATION_FAILED');

        $this->assertSame(422, $response->getStatusCode());
        $body = json_decode($response->getBody(), true);

        $this->assertFalse($body['ok']);
        $this->assertSame('Validasi gagal', $body['message']);
        $this->assertSame(['email' => ['Email tidak valid']], $body['errors']);
        $this->assertSame('VALIDATION_FAILED', $body['code']);
    }

    public function testStandardErrorResponses(): void
    {
        $notFound = $this->api->notFound('Pesanan tidak ditemukan.');
        $this->assertSame(404, $notFound->getStatusCode());
        $body = json_decode($notFound->getBody(), true);
        $this->assertFalse($body['ok']);
        $this->assertSame('NOT_FOUND', $body['code']);

        $forbidden = $this->api->forbidden();
        $this->assertSame(403, $forbidden->getStatusCode());
        $body = json_decode($forbidden->getBody(), true);
        $this->assertFalse($body['ok']);
        $this->assertSame('FORBIDDEN', $body['code']);

        $unauthorized = $this->api->unauthorized();
        $this->assertSame(401, $unauthorized->getStatusCode());
        $body = json_decode($unauthorized->getBody(), true);
        $this->assertFalse($body['ok']);
        $this->assertSame('UNAUTHORIZED', $body['code']);
    }

    public function testJsonActionHandling(): void
    {
        // Success case
        $success = $this->api->runAction(fn () => ['count' => 42], 'Berhasil');
        $this->assertSame(200, $success->getStatusCode());
        $body = json_decode($success->getBody(), true);
        $this->assertTrue($body['ok']);
        $this->assertSame(['count' => 42], $body['data']);

        // InvalidArgumentException -> 422
        $invalidArg = $this->api->runAction(function () {
            throw new \InvalidArgumentException('Parameter wajib diisi.');
        });
        $this->assertSame(422, $invalidArg->getStatusCode());
        $body = json_decode($invalidArg->getBody(), true);
        $this->assertFalse($body['ok']);
        $this->assertSame('Parameter wajib diisi.', $body['message']);
        $this->assertSame('VALIDATION_ERROR', $body['code']);

        // RuntimeException with 403 status code
        $runtimeEx = $this->api->runAction(function () {
            throw new \RuntimeException('Company ID tidak sah.', 403);
        });
        $this->assertSame(403, $runtimeEx->getStatusCode());
        $body = json_decode($runtimeEx->getBody(), true);
        $this->assertFalse($body['ok']);
        $this->assertSame('Company ID tidak sah.', $body['message']);
    }
}
