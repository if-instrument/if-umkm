<?php

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Services\AuthService;
use App\Services\UserInvitationService;
use App\Models\CompanyModel;

class AuthController extends BaseController
{
    public function login()
    {
        $payload = $this->request->getJSON(true) ?: [];
        $result = (new AuthService())->login(
            (string) ($payload['email'] ?? ''),
            (string) ($payload['password'] ?? ''),
            (string) ($payload['companySlug'] ?? '')
        );

        if (!$result) {
            return $this->response->setStatusCode(401)->setJSON([
                'ok' => false,
                'message' => 'Email atau password tidak sesuai.',
            ]);
        }

        return $this->response->setJSON(['ok' => true] + $result);
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
        $company = (new CompanyModel())->where('route_slug', $slug)->where('status', 'active')->first();
        if (! $company) {
            return $this->response->setStatusCode(404)->setJSON([
                'ok' => false,
                'message' => 'Company route tidak ditemukan.',
            ]);
        }

        return $this->response->setJSON([
            'ok' => true,
            'company' => [
                'id' => (int) $company['id'],
                'companyId' => (int) $company['id'] === 1 ? 'company-main' : 'company-' . $company['id'],
                'name' => $company['name'],
                'brandName' => $company['brand_name'] ?: $company['name'],
                'routeSlug' => $company['route_slug'],
                'logoUrl' => $company['logo_path'] ?? '',
                'themeColor' => $company['theme_color'] ?? '#6e3a16',
                'tagline' => $company['tagline'] ?: 'UMKM Solution',
            ],
        ]);
    }

    public function tenants()
    {
        $companies = (new CompanyModel())
            ->where('status', 'active')
            ->orderBy('name', 'ASC')
            ->findAll();

        return $this->response->setJSON([
            'ok' => true,
            'companies' => array_map(fn ($company) => [
                'name' => $company['name'],
                'brandName' => $company['brand_name'] ?: $company['name'],
                'routeSlug' => $company['route_slug'],
                'routeUrl' => '/' . $company['route_slug'] . '/login',
                'logoUrl' => $company['logo_path'] ?? '',
                'themeColor' => $company['theme_color'] ?? '#6e3a16',
                'tagline' => $company['tagline'] ?: 'UMKM Solution',
            ], array_filter($companies, fn ($company) => ! empty($company['route_slug']))),
        ]);
    }
}
