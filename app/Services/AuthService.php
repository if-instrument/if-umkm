<?php

namespace App\Services;

use App\Models\UserModel;
use Config\Database;

class AuthService
{
    use \App\Services\Shared\MappingHelperTrait;
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
            if (! $company) return null;
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
                'roleId' => $role ? $this->roleCodeFromRow($role) : ($authType === 'super_admin' ? 'role-super-admin' : 'role-company-admin'),
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
            'accessContext' => $this->accessContext($db, $centralDb, $authType, $resolvedCompanyId, $scope, $outletRows),
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
        switch ($name) {
            case 'Area Manager':
                return 'role-area-manager';
            case 'Outlet Manager':
                return 'role-outlet-manager';
            case 'Kasir':
                return 'role-kasir';
            case 'Kitchen':
                return 'role-kitchen';
            case 'Inventory Staff':
                return 'role-inventory';
            case 'Company Admin':
                return 'role-company-admin';
            default:
                return 'role-company-admin';
        }
    }

    private function accessContext($db, $centralDb, string $authType, int $companyId, string $scope, array $outletRows): array
    {
        $companies = $authType === 'super_admin'
            ? $this->companyRows($centralDb)
            : $this->companyRows($centralDb, $companyId);
        $outlets = $authType === 'super_admin' ? [] : $this->outletRows($db, $companyId, $scope, $outletRows);
        $roles = $authType === 'super_admin' ? [] : $this->roleRows($db, $companyId);
        $users = $authType === 'super_admin' ? [] : $this->userRows($db, $companyId, $roles);

        return [
            'activeCompanyId' => $companyId ? $this->companyCode($companyId) : 'company-main',
            'companies' => $companies,
            'outlets' => $outlets,
            'companyRoles' => $roles,
            'users' => $users,
        ];
    }

    private function companyRows($db, int $companyId = 0): array
    {
        if (! $db->tableExists('companies')) {
            return [];
        }
        $builder = $db->table('companies')->orderBy('id', 'ASC');
        if ($companyId > 0) {
            $builder->where('id', $companyId);
        }

        return array_map(fn ($row) => [
            'id' => $this->companyCode((int) $row['id']),
            'name' => $row['brand_name'] ?: $row['name'],
            'routeSlug' => $row['route_slug'] ?? '',
            'routeUrl' => '/' . ($row['route_slug'] ?? '') . '/login',
            'logoUrl' => $row['logo_path'] ?? '',
            'themeColor' => $row['theme_color'] ?? '#6e3a16',
            'dbMode' => $row['db_mode'] ?? 'dedicated',
            'dbHost' => $row['db_host'] ?? '',
            'dbName' => $row['db_name'] ?? '',
            'dbPort' => $row['db_port'] ?? null,
            'adminName' => '',
            'adminEmail' => '',
            'adminUserId' => '',
            'adminStatus' => StatusCodeService::ACTIVE,
            'status' => StatusCodeService::common($row['status'] ?? ''),
        ], $builder->get()->getResultArray());
    }

    private function outletRows($db, int $companyId, string $scope, array $outletRows): array
    {
        if (! $db->tableExists('outlets')) {
            return [];
        }
        $builder = $db->table('outlets')->orderBy('id', 'ASC');
        if ($db->fieldExists('company_id', 'outlets')) {
            $builder->where('company_id', $companyId);
        }
        if ($scope === 'selected' && $outletRows) {
            $builder->whereIn('id', array_map('intval', array_column($outletRows, 'outlet_id')));
        }

        return array_map(fn ($row) => [
            'id' => $this->outletCode((int) $row['id']),
            'companyId' => $this->companyCode((int) ($row['company_id'] ?? $companyId)),
            'code' => $row['code'] ?? '',
            'name' => $row['name'] ?? 'Outlet',
            'city' => $row['address'] ?? '',
            'status' => StatusCodeService::common($row['status'] ?? ''),
        ], $builder->get()->getResultArray());
    }

    private function roleRows($db, int $companyId): array
    {
        if (! $db->tableExists('roles')) {
            return [];
        }
        $builder = $db->table('roles')->orderBy('id', 'ASC');
        if ($db->fieldExists('company_id', 'roles')) {
            $builder->where('company_id', $companyId);
        }

        return array_map(fn ($row) => [
            'id' => $this->roleCodeFromRow($row),
            'numericId' => (int) ($row['id'] ?? 0),
            'companyId' => $this->companyCode((int) ($row['company_id'] ?? $companyId)),
            'name' => $row['name'] ?? 'Role',
            'outletScope' => ($row['scope'] ?? '') === 'all' ? 'all' : 'selected',
            'responsibility' => $row['responsibility'] ?? '',
            'permissions' => json_decode($row['permissions'] ?? '[]', true) ?: [],
            'permissionMatrix' => json_decode($row['permission_matrix'] ?? '[]', true) ?: [],
            'status' => StatusCodeService::common($row['status'] ?? ''),
        ], $builder->get()->getResultArray());
    }

    private function userRows($db, int $companyId, array $roles): array
    {
        if (! $db->tableExists('users')) {
            return [];
        }
        $builder = $db->table('users')->orderBy('id', 'ASC');
        if ($db->fieldExists('company_id', 'users')) {
            $builder->where('company_id', $companyId);
        }
        $users = $builder->get()->getResultArray();
        $userRoles = $db->tableExists('user_roles') ? $db->table('user_roles')->get()->getResultArray() : [];
        $userOutlets = $db->tableExists('user_outlets') ? $db->table('user_outlets')->get()->getResultArray() : [];

        return array_map(function ($row) use ($companyId, $roles, $userRoles, $userOutlets) {
            $roleId = $this->firstValue($userRoles, 'user_id', $row['id'], 'role_id');
            $role = $this->findRolePayload($roles, $roleId);
            $scope = ($row['type'] ?? '') === 'super_admin' ? 'none' : (($role['outletScope'] ?? '') === 'all' || ($row['type'] ?? '') === 'company_admin' ? 'all' : 'selected');
            $outletIds = array_values(array_map(
                fn ($item) => $this->outletCode((int) $item['outlet_id']),
                array_filter($userOutlets, fn ($item) => (int) $item['user_id'] === (int) $row['id'])
            ));

            return [
                'id' => $this->userCode($row),
                'name' => $row['name'] ?? '',
                'email' => $row['email'] ?? '',
                'role' => $role['name'] ?? (($row['type'] ?? '') === 'super_admin' ? 'Super Admin' : 'Company Admin'),
                'roleId' => $role['id'] ?? (($row['type'] ?? '') === 'super_admin' ? 'role-super-admin' : 'role-company-admin'),
                'status' => StatusCodeService::common($row['status'] ?? ''),
                'authType' => $row['type'] ?? 'company_user',
                'companyId' => ($row['type'] ?? '') === 'super_admin' ? '' : $this->companyCode((int) ($row['company_id'] ?? $companyId)),
                'outletScope' => $scope,
                'canViewAllOutlets' => $scope === 'all',
                'outletIds' => $outletIds,
            ];
        }, $users);
    }

    private function roleCodeFromRow(array $row): string
    {
        switch ($row['name'] ?? '') {
            case 'Area Manager':
                return 'role-area-manager';
            case 'Outlet Manager':
                return 'role-outlet-manager';
            case 'Kasir':
                return 'role-kasir';
            case 'Kitchen':
                return 'role-kitchen';
            case 'Inventory Staff':
                return 'role-inventory';
            case 'Company Admin':
                return (int) ($row['id'] ?? 0) === 1 ? 'role-company-admin' : 'role-' . ($row['id'] ?? 'company-admin');
            default:
                return 'role-' . ($row['id'] ?? uniqid());
        }
    }

    private function firstValue(array $rows, string $matchField, $matchValue, string $returnField)
    {
        foreach ($rows as $row) {
            if ((string) ($row[$matchField] ?? '') === (string) $matchValue) {
                return $row[$returnField] ?? null;
            }
        }

        return null;
    }

    private function findRolePayload(array $roles, $numericRoleId): ?array
    {
        if (! $numericRoleId) {
            return null;
        }
        $code = 'role-' . $numericRoleId;
        foreach ($roles as $role) {
            if (
                (int) ($role['numericId'] ?? 0) === (int) $numericRoleId ||
                ($role['id'] ?? '') === $code ||
                (($role['name'] ?? '') === 'Company Admin' && (int) $numericRoleId === 1)
            ) {
                return $role;
            }
        }

        return null;
    }


}
