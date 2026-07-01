<?php

namespace App\Services\Api;

use App\Models\CompanyModel;
use App\Services\AuthService;
use App\Services\StatusCodeService;
use App\Services\TenantDatabaseService;
use Config\Database;

class AuthApiService
{
    public function login(string $email, string $password, string $companySlug = ''): array
    {
        $result = (new AuthService())->login($email, $password, $companySlug);
        if ($result) {
            return ['ok' => true] + $result;
        }

        $route = $this->companyRouteForEmail($email);
        if ($route !== '' && $companySlug === '') {
            return [
                'ok' => false,
                'status' => 403,
                'message' => 'User perusahaan harus login melalui halaman perusahaan.',
                'routeUrl' => '/' . $route . '/login',
            ];
        }

        return [
            'ok' => false,
            'status' => 401,
            'message' => 'Email atau password tidak sesuai.',
        ];
    }

    public function bootstrap(string $companySlug = ''): array
    {
        if ($companySlug !== '') {
            return [
                'mode' => 'company',
                'company' => $this->tenant($companySlug),
                'companies' => [],
            ];
        }

        return [
            'mode' => 'global',
            'company' => null,
            'companies' => $this->tenants(),
        ];
    }

    public function tenant(string $slug): ?array
    {
        $company = (new TenantDatabaseService())->companyBySlug($slug);
        if (! $company) {
            return null;
        }

        return [
            'id' => (int) $company['id'],
            'companyId' => (int) $company['id'] === 1 ? 'company-main' : 'company-' . $company['id'],
            'name' => $company['name'],
            'brandName' => $company['brand_name'] ?: $company['name'],
            'routeSlug' => $company['route_slug'],
            'logoUrl' => $company['logo_path'] ?? '',
            'themeColor' => $company['theme_color'] ?? '#6e3a16',
            'tagline' => $company['tagline'] ?: 'UMKM Solution',
        ];
    }

    public function tenants(): array
    {
        $companies = (new CompanyModel())
            ->whereIn('status', [StatusCodeService::ACTIVE, 'active'])
            ->orderBy('name', 'ASC')
            ->findAll();

        return array_values(array_map(fn ($company) => [
            'name' => $company['name'],
            'brandName' => $company['brand_name'] ?: $company['name'],
            'routeSlug' => $company['route_slug'],
            'routeUrl' => '/' . $company['route_slug'] . '/login',
            'logoUrl' => $company['logo_path'] ?? '',
            'themeColor' => $company['theme_color'] ?? '#6e3a16',
            'tagline' => $company['tagline'] ?: 'UMKM Solution',
        ], array_filter($companies, fn ($company) => ! empty($company['route_slug']))));
    }

    private function companyRouteForEmail(string $email): string
    {
        $email = strtolower(trim($email));
        if ($email === '') {
            return '';
        }

        $user = Database::connect()->table('users')
            ->where('email', $email)
            ->where('type !=', 'super_admin')
            ->whereIn('status', [StatusCodeService::ACTIVE, 'active'])
            ->get()
            ->getRowArray();
        if (! $user || empty($user['company_id'])) {
            return '';
        }

        $company = (new CompanyModel())
            ->where('id', (int) $user['company_id'])
            ->whereIn('status', [StatusCodeService::ACTIVE, 'active'])
            ->first();

        return (string) ($company['route_slug'] ?? '');
    }
}
