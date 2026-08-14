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
        if (! $result) {
            return ['ok' => false, 'message' => 'Email atau password tidak sesuai.'];
        }

        if (isset($result['rejected']) || isset($result['pending']) || isset($result['expired'])) {
            return [
                'ok' => false,
                'rejected' => $result['rejected'] ?? false,
                'pending' => $result['pending'] ?? false,
                'expired' => $result['expired'] ?? false,
                'hashKey' => $result['hashKey'] ?? '',
                'renewUrl' => $result['renewUrl'] ?? '',
                'resubmitUrl' => $result['resubmitUrl'] ?? '',
                'message' => $result['message'],
            ];
        }

        $route = $this->companyRouteForEmail($email);
        if ($route !== '' && strtolower($route) !== strtolower($companySlug)) {
            return [
                'ok' => false,
                'message' => 'Silakan akses login dari portal khusus bisnis Anda.',
                'routeUrl' => '/' . $route . '/login',
            ];
        }

        return ['ok' => true] + $result;
    }

    public function loginByEmail(string $email, string $companySlug = ''): array
    {
        $result = (new AuthService())->loginByEmail($email, $companySlug);
        if (! $result) {
            return ['ok' => false, 'message' => 'Pengguna tidak ditemukan.'];
        }
        return ['ok' => true] + $result;
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

        try {
            $companies = $this->tenants();
        } catch (\Throwable $exception) {
            $companies = [];
        }

        try {
            $saasPlans = (new \App\Services\AccessManagementService())->saasPlans();
        } catch (\Throwable $exception) {
            $saasPlans = [];
        }

        try {
            $centralPaymentAccounts = (new \App\Services\AccessManagementService())->centralPaymentAccounts();
        } catch (\Throwable $exception) {
            $centralPaymentAccounts = [];
        }

        return [
            'mode' => 'global',
            'company' => null,
            'companies' => $companies,
            'saasPlans' => $saasPlans,
            'centralPaymentAccounts' => $centralPaymentAccounts,
        ];
    }

    public function tenant(string $slug): ?array
    {
        $company = (new TenantDatabaseService())->companyBySlug($slug);
        if (! $company) {
            return null;
        }

        $planCode = strtolower(trim((string) ($company['subscription_plan'] ?? 'Professional')));
        $saasPlans = (new \App\Services\AccessManagementService())->saasPlans();
        $hasAiFromPlan = true;
        foreach ($saasPlans as $p) {
            if (strtolower((string) ($p['code'] ?? '')) === $planCode) {
                $hasAiFromPlan = ! empty($p['hasAiBiometrics']);
                break;
            }
        }

        $faceEnabled = isset($company['ai_enable_face_login'])
            ? (bool) $company['ai_enable_face_login']
            : $hasAiFromPlan;

        $fpEnabled = isset($company['ai_enable_fingerprint'])
            ? (bool) $company['ai_enable_fingerprint']
            : $hasAiFromPlan;

        return [
            'id' => (int) $company['id'],
            'companyId' => (int) $company['id'] === 1 ? 'company-main' : 'company-' . $company['id'],
            'name' => $company['name'],
            'brandName' => $company['brand_name'] ?: $company['name'],
            'routeSlug' => $company['route_slug'],
            'logoUrl' => $company['logo_path'] ?? '',
            'themeColor' => $company['theme_color'] ?? '#6e3a16',
            'tagline' => $company['tagline'] ?: 'UMKM Solution',
            'subscriptionPlan' => $company['subscription_plan'] ?? 'Professional',
            'aiEnableFaceLogin' => $faceEnabled,
            'aiEnableFingerprint' => $fpEnabled,
            'hasAiBiometrics' => $faceEnabled || $fpEnabled,
        ];
    }

    public function tenants(): array
    {
        try {
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
        } catch (\Throwable $exception) {
            return [];
        }
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
