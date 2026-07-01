<?php

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Services\Api\AuthApiService;
use App\Services\UserInvitationService;

class AuthController extends BaseController
{
    public function login()
    {
        $payload = $this->request->getJSON(true) ?: [];
        $result = (new AuthApiService())->login(
            (string) ($payload['email'] ?? ''),
            (string) ($payload['password'] ?? ''),
            (string) ($payload['companySlug'] ?? '')
        );

        if (! ($result['ok'] ?? false)) {
            $status = (int) ($result['status'] ?? 401);
            unset($result['status']);

            return $this->response->setStatusCode($status)->setJSON($result);
        }

        return $this->response->setJSON($result);
    }

    public function invitation(string $token)
    {
        try {
            return $this->response->setJSON(['ok' => true, 'data' => (new UserInvitationService())->detail($token)]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    public function acceptInvitation(string $token)
    {
        $payload = (array) ($this->request->getJSON(true) ?: []);
        try {
            return $this->response->setJSON([
                'ok' => true,
                'data' => (new UserInvitationService())->accept(
                    $token,
                    (string) ($payload['password'] ?? ''),
                    (string) ($payload['passwordConfirmation'] ?? '')
                ),
            ]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    public function tenant(string $slug)
    {
        $company = (new AuthApiService())->tenant($slug);
        if (! $company) {
            return $this->response->setStatusCode(404)->setJSON([
                'ok' => false,
                'message' => 'Company route tidak ditemukan.',
            ]);
        }

        return $this->response->setJSON([
            'ok' => true,
            'company' => $company,
        ]);
    }

    public function tenants()
    {
        return $this->response->setJSON([
            'ok' => true,
            'companies' => (new AuthApiService())->tenants(),
        ]);
    }
}
