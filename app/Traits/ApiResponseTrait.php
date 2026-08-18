<?php

namespace App\Traits;

use CodeIgniter\HTTP\ResponseInterface;
use Config\Services;

trait ApiResponseTrait
{
    protected function respondSuccess($data = null, string $message = '', array $meta = [], int $statusCode = 200): ResponseInterface
    {
        $payload = ['ok' => true];

        if ($data !== null) {
            $payload['data'] = $data;
        }
        if ($message !== '') {
            $payload['message'] = $message;
        }
        if (! empty($meta)) {
            $payload['meta'] = $meta;
        }

        $response = $this->response ?? Services::response();
        return $response->setStatusCode($statusCode)->setJSON($payload);
    }

    protected function respondCreated($data = null, string $message = 'Data berhasil disimpan.'): ResponseInterface
    {
        return $this->respondSuccess($data, $message, [], 201);
    }

    protected function respondError(string $message, int $statusCode = 422, array $errors = [], ?string $code = null): ResponseInterface
    {
        $payload = [
            'ok' => false,
            'message' => $message,
        ];

        if (! empty($errors)) {
            $payload['errors'] = $errors;
        }
        if ($code !== null && $code !== '') {
            $payload['code'] = $code;
        }

        $response = $this->response ?? Services::response();
        return $response->setStatusCode($statusCode)->setJSON($payload);
    }

    protected function respondNotFound(string $message = 'Data tidak ditemukan.'): ResponseInterface
    {
        return $this->respondError($message, 404, [], 'NOT_FOUND');
    }

    protected function respondForbidden(string $message = 'Akses ditolak.'): ResponseInterface
    {
        return $this->respondError($message, 403, [], 'FORBIDDEN');
    }

    protected function respondUnauthorized(string $message = 'Sesi tidak sah atau telah berakhir.'): ResponseInterface
    {
        return $this->respondError($message, 401, [], 'UNAUTHORIZED');
    }

    protected function jsonAction(callable $action, string $successMessage = '', int $statusCode = 200): ResponseInterface
    {
        try {
            $result = $action();
            if ($result instanceof ResponseInterface) {
                return $result;
            }
            return $this->respondSuccess($result, $successMessage, [], $statusCode);
        } catch (\InvalidArgumentException $e) {
            return $this->respondError($e->getMessage(), 422, [], 'VALIDATION_ERROR');
        } catch (\RuntimeException $e) {
            $code = $e->getCode();
            $status = is_int($code) && $code >= 400 && $code < 600 ? $code : 422;
            return $this->respondError($e->getMessage(), $status);
        } catch (\Throwable $e) {
            return $this->respondError('Terjadi kesalahan pada server: ' . $e->getMessage(), 500, [], 'SERVER_ERROR');
        }
    }
}
