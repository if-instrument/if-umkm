<?php

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Services\AuthService;
use App\Services\StatusCodeService;
use App\Services\TenantDatabaseService;
use App\Services\UserInvitationService;
use App\Models\CompanyModel;
use Config\Database;

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
            $route = $this->companyRouteForEmail((string) ($payload['email'] ?? ''));
            if ($route && (string) ($payload['companySlug'] ?? '') === '') {
                return $this->response->setStatusCode(403)->setJSON([
                    'ok' => false,
                    'message' => 'User perusahaan harus login melalui halaman perusahaan.',
                    'routeUrl' => '/' . $route . '/login',
                ]);
            }
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
        $company = (new TenantDatabaseService())->companyBySlug($slug);
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
            ->whereIn('status', [StatusCodeService::ACTIVE, 'active'])
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

    private function companyRouteForEmail(string $email): string
    {
        $email = strtolower(trim($email));
        if ($email === '') return '';
        $user = Database::connect()->table('users')
            ->where('email', $email)
            ->where('type !=', 'super_admin')
            ->whereIn('status', [StatusCodeService::ACTIVE, 'active'])
            ->get()
            ->getRowArray();
        if (! $user || empty($user['company_id'])) return '';
        $company = (new CompanyModel())
            ->where('id', (int) $user['company_id'])
            ->whereIn('status', [StatusCodeService::ACTIVE, 'active'])
            ->first();
        return (string) ($company['route_slug'] ?? '');
    }
}
