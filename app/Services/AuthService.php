<?php

namespace App\Services;

use App\Models\UserModel;
use Config\Database;

class AuthService
{
    public function login(string $email, string $password, string $companySlug = ''): ?array
    {
        $email = strtolower(trim($email));
        $tenantService = new TenantDatabaseService();
        $centralDb = Database::connect();
        $db = $centralDb;
        $company = null;

        if ($companySlug !== '') {
            $company = $tenantService->companyBySlug($companySlug);
            if (! $company) {
                return null;
            }
            $db = $tenantService->connectionForCompanySlug($companySlug) ?: $centralDb;
        }

        $user = $db->table('users')
            ->where('email', $email)
            ->whereIn('status', [StatusCodeService::ACTIVE, 'active'])
            ->get()
            ->getRowArray();
        if (! $user && $companySlug !== '' && $db !== $centralDb) {
            $db = $centralDb;
            $user = (new UserModel())->where('email', $email)->whereIn('status', [StatusCodeService::ACTIVE, 'active'])->first();
        }
        if (!$user || !password_verify($password, $user['password_hash'])) {
            return null;
        }

        $resolvedCompanyId = (int) ($user['company_id'] ?? $company['id'] ?? 0);
        $company = $company ?: ($resolvedCompanyId ? $db->table('companies')->where('id', $resolvedCompanyId)->get()->getRowArray() : null);
        if ($companySlug !== '') {
            if ($user['type'] === 'super_admin') return null;
            if (! $company || ($company['route_slug'] ?? '') !== $companySlug) return null;
        } elseif ($user['type'] !== 'super_admin') {
            return null;
        }

        $roleId = $db->tableExists('user_roles')
            ? ($db->table('user_roles')->select('role_id')->where('user_id', $user['id'])->get()->getRowArray()['role_id'] ?? null)
            : null;
        $role = $roleId && $db->tableExists('roles') ? $db->table('roles')->where('id', $roleId)->get()->getRowArray() : null;
        $outletRows = $db->tableExists('user_outlets') ? $db->table('user_outlets')->where('user_id', $user['id'])->get()->getResultArray() : [];
        $outletIds = array_map(fn ($row) => $this->outletCode((int) $row['outlet_id']), $outletRows);
        $companyId = $resolvedCompanyId ? $this->companyCode($resolvedCompanyId) : '';
        $authType = $user['type'];
        $scope = $authType === 'super_admin' ? 'none' : (($role['scope'] ?? '') === 'all' || $authType === 'company_admin' ? 'all' : 'selected');
        $defaultOutletId = $this->defaultOutletId($db, $resolvedCompanyId, $outletRows, $scope);
        $onboardingBuilder = $authType === 'company_admin' && $db->tableExists('outlets')
            ? $db->table('outlets')->whereIn('status', [StatusCodeService::ACTIVE, 'active'])
            : null;
        if ($onboardingBuilder && $db->fieldExists('company_id', 'outlets')) {
            $onboardingBuilder->where('company_id', $resolvedCompanyId);
        }
        $onboardingRequired = $onboardingBuilder ? ! $onboardingBuilder->countAllResults() : false;

        $permissions = json_decode($role['permissions'] ?? '[]', true) ?: [];
        $permissionMatrix = json_decode($role['permission_matrix'] ?? '[]', true) ?: [];
        $userPayload = [
            'id' => $this->userCode($user),
                'name' => $user['name'],
                'email' => $user['email'],
                'role' => $role['name'] ?? ($authType === 'super_admin' ? 'Super Admin' : 'Company Admin'),
                'roleId' => $role ? $this->roleCode($role['name']) : ($authType === 'super_admin' ? 'role-super-admin' : 'role-company-admin'),
                'status' => StatusCodeService::common($user['status'] ?? ''),
                'authType' => $authType,
                'companyId' => $companyId,
                'companySlug' => $company['route_slug'] ?? '',
                'outletScope' => $scope,
                'canViewAllOutlets' => $scope === 'all',
                'outletIds' => $outletIds,
                'selectedOutletId' => $defaultOutletId,
                'onboardingRequired' => $onboardingRequired,
                'permissions' => $permissions,
                'permissionMatrix' => $permissionMatrix,
        ];

        return [
            'user' => $userPayload,
            'token' => (new JwtService())->issue([
                'sub' => (string) $user['id'],
                'email' => $user['email'],
                'authType' => $authType,
                'companyId' => $companyId,
                'companySlug' => $company['route_slug'] ?? '',
                'roleId' => $userPayload['roleId'],
                'permissions' => $userPayload['permissions'],
                'permissionMatrix' => $permissionMatrix,
            ]),
        ];
    }

    private function companyCode(int $id): string
    {
        return $id === 1 ? 'company-main' : 'company-' . $id;
    }

    private function outletCode(int $id): string
    {
        return match ($id) {
            1 => 'outlet-main',
            2 => 'outlet-north',
            3 => 'outlet-south',
            default => 'outlet-' . $id,
        };
    }

    private function defaultOutletId($db, int $companyId, array $outletRows, string $scope): string
    {
        if ($companyId <= 0) {
            return '';
        }
        if (! $db->tableExists('outlets')) {
            return '';
        }

        if ($scope === 'selected' && $outletRows) {
            return $this->outletCode((int) $outletRows[0]['outlet_id']);
        }

        $outletBuilder = $db->table('outlets')
            ->whereIn('status', [StatusCodeService::ACTIVE, 'active'])
            ->orderBy('id', 'ASC');
        if ($db->fieldExists('company_id', 'outlets')) {
            $outletBuilder->where('company_id', $companyId);
        }
        $outlet = $outletBuilder->get()
            ->getRowArray();

        return $outlet ? $this->outletCode((int) $outlet['id']) : '';
    }

    private function roleCode(string $name): string
    {
        return match ($name) {
            'Area Manager' => 'role-area-manager',
            'Outlet Manager' => 'role-outlet-manager',
            'Kasir' => 'role-kasir',
            'Kitchen' => 'role-kitchen',
            'Inventory Staff' => 'role-inventory',
            default => 'role-company-admin',
        };
    }

    private function userCode(array $row): string
    {
        return match ($row['email'] ?? '') {
            'superadmin@app.test' => 'usr-super-admin',
            'admin@ifresso.id' => 'usr-company-admin',
            'area@ifresso.id' => 'usr-area-manager',
            'manager@ifresso.id' => 'usr-outlet-manager',
            'kasir@ifresso.id' => 'usr-kasir',
            'kitchen@ifresso.id' => 'usr-kitchen',
            'inventory@ifresso.id' => 'usr-inventory',
            default => 'usr-' . ($row['id'] ?? uniqid()),
        };
    }
}
