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
            $companyId = (int) $company['id'];
            $db = $tenantService->connectionForCompanySlug($companySlug) ?: $centralDb;

            // Strict Filter by Company ID when accessing tenant portal /{companySlug}/login
            $user = $db->table('users')
                ->where('email', $email)
                ->where('company_id', $companyId)
                ->whereIn('status', [StatusCodeService::ACTIVE, 'active'])
                ->get()
                ->getRowArray();

            if (! $user && $db !== $centralDb) {
                $user = $centralDb->table('users')
                    ->where('email', $email)
                    ->where('company_id', $companyId)
                    ->whereIn('status', [StatusCodeService::ACTIVE, 'active'])
                    ->get()
                    ->getRowArray();
            }

            if (! $user) {
                // Check if user/company for this specific company ID was rejected or pending
                $rawUser = $centralDb->table('users')
                    ->where('email', $email)
                    ->where('company_id', $companyId)
                    ->get()
                    ->getRowArray();

                if ($rawUser) {
                    $cStatus = (string) ($company['status'] ?? '');
                    $pStatus = (string) ($company['payment_status'] ?? '');
                    $notes = (string) ($company['payment_notes'] ?? '');
                    $expiresAt = ! empty($company['expires_at']) ? strtotime($company['expires_at']) : 0;
                    $isExpired = $expiresAt > 0 && $expiresAt < strtotime('today');

                    if ($isExpired) {
                        $accessService = new AccessManagementService();
                        $hashKey = $accessService->generateResubmitHashKey((int) $company['id'], $email);
                        return [
                            'expired' => true,
                            'hashKey' => $hashKey,
                            'renewUrl' => '/login?action=renew&token=' . $hashKey,
                            'message' => '🚨 Masa Aktif Perusahaan Telah Kedaluwarsa. Silakan lakukan perpanjang subscription untuk membuka kembali akses.'
                        ];
                    }

                    if (in_array($cStatus, ['90', 'rejected', '20'], true) || $pStatus === '20') {
                        $accessService = new AccessManagementService();
                        $hashKey = $accessService->generateResubmitHashKey((int) $company['id'], $email);
                        return [
                            'rejected' => true,
                            'hashKey' => $hashKey,
                            'resubmitUrl' => '/login?action=resubmit&token=' . $hashKey,
                            'message' => '❌ Akses Ditolak: Pendaftaran perusahaan (' . ($company['name'] ?? $email) . ') telah DITOLAK oleh Super Admin.' . ($notes ? ' Catatan: ' . $notes : '')
                        ];
                    }
                    if (in_array($cStatus, ['00', '0', 'pending'], true) || $pStatus === '00') {
                        return [
                            'pending' => true,
                            'message' => '⏳ Menunggu Verifikasi: Pendaftaran perusahaan (' . ($company['name'] ?? $email) . ') sedang dalam proses peninjauan Super Admin.'
                        ];
                    }
                    if (in_array((string) ($rawUser['status'] ?? ''), ['90', 'rejected', '20'], true)) {
                        return [
                            'rejected' => true,
                            'message' => '❌ Akses Ditolak: Akun (' . $email . ') telah dinonaktifkan atau ditolak oleh Super Admin.'
                        ];
                    }
                }
                return null;
            }
        } else {
            // Central Login Portal (/login): companySlug is empty
            // 1. Try Super Admin first
            $user = $centralDb->table('users')
                ->where('email', $email)
                ->where('type', 'super_admin')
                ->whereIn('status', [StatusCodeService::ACTIVE, 'active'])
                ->get()
                ->getRowArray();

            if (! $user) {
                // Check if user is a regular tenant user trying to log in at central portal
                $rawUser = $centralDb->table('users')
                    ->where('email', $email)
                    ->get()
                    ->getRowArray();

                if ($rawUser) {
                    $compId = (int) ($rawUser['company_id'] ?? 0);
                    if ($compId) {
                        $comp = $centralDb->table('companies')->where('id', $compId)->get()->getRowArray();
                        if ($comp) {
                            $cStatus = (string) ($comp['status'] ?? '');
                            $pStatus = (string) ($comp['payment_status'] ?? '');
                            $notes = (string) ($comp['payment_notes'] ?? '');

                            if (in_array($cStatus, ['90', 'rejected', '20'], true) || $pStatus === '20') {
                                return [
                                    'rejected' => true,
                                    'message' => '❌ Akses Ditolak: Pendaftaran perusahaan (' . ($comp['name'] ?? $email) . ') telah DITOLAK oleh Super Admin.' . ($notes ? ' Catatan: ' . $notes : '')
                                ];
                            }
                            if (in_array($cStatus, ['00', '0', 'pending'], true) || $pStatus === '00') {
                                return [
                                    'pending' => true,
                                    'message' => '⏳ Menunggu Verifikasi: Pendaftaran perusahaan (' . ($comp['name'] ?? $email) . ') sedang dalam proses peninjauan Super Admin.'
                                ];
                            }
                        }
                    }
                }
                return null;
            }
        }

        if (! password_verify($password, $user['password_hash'])) {
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
                'mustChangePassword' => ! empty($user['must_change_password']),
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

    public function loginByEmail(string $email, string $companySlug = ''): ?array
    {
        $email = strtolower(trim($email));
        $tenantService = new TenantDatabaseService();
        $centralDb = Database::connect();
        $db = $centralDb;
        $company = null;

        if ($companySlug !== '') {
            $company = $tenantService->companyBySlug($companySlug);
            if ($company) {
                $db = $tenantService->connectionForCompanySlug($companySlug) ?: $centralDb;
            }
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

        if (! $user) {
            $user = (new UserModel())->whereIn('status', [StatusCodeService::ACTIVE, 'active'])->first();
        }

        if (! $user) {
            return null;
        }

        $resolvedCompanyId = (int) ($user['company_id'] ?? $company['id'] ?? 0);
        $company = $company ?: ($resolvedCompanyId ? $db->table('companies')->where('id', $resolvedCompanyId)->get()->getRowArray() : null);

        $roleId = $db->tableExists('user_roles')
            ? ($db->table('user_roles')->select('role_id')->where('user_id', $user['id'])->get()->getRowArray()['role_id'] ?? null)
            : null;
        $role = $roleId && $db->tableExists('roles') ? $db->table('roles')->where('id', $roleId)->get()->getRowArray() : null;
        $outletRows = $db->tableExists('user_outlets') ? $db->table('user_outlets')->where('user_id', $user['id'])->get()->getResultArray() : [];
        $outletIds = array_map(fn ($row) => $this->outletCode((int) $row['outlet_id']), $outletRows);
        $companyId = $resolvedCompanyId ? $this->companyCode($resolvedCompanyId) : '';
        $authType = $user['type'] ?? 'company_admin';
        $scope = $authType === 'super_admin' ? 'none' : (($role['scope'] ?? '') === 'all' || $authType === 'company_admin' ? 'all' : 'selected');
        $defaultOutletId = $this->defaultOutletId($db, $resolvedCompanyId, $outletRows, $scope);

        $permissions = json_decode($role['permissions'] ?? '[]', true) ?: [];
        $permissionMatrix = json_decode($role['permission_matrix'] ?? '[]', true) ?: [];

        $userPayload = [
            'id' => $this->userCode($user),
            'name' => (string) ($user['name'] ?? $user['email']),
            'email' => (string) ($user['email'] ?? ''),
            'role' => $role['name'] ?? ($authType === 'super_admin' ? 'Super Admin' : 'Company Admin'),
            'roleId' => $role ? $this->roleCodeFromRow($role) : ($authType === 'super_admin' ? 'role-super-admin' : 'role-company-admin'),
            'status' => StatusCodeService::common($user['status'] ?? ''),
            'authType' => $authType,
            'companyId' => $companyId,
            'companySlug' => $company['route_slug'] ?? $companySlug ?: 'IFresso-Coffee',
            'outletScope' => $scope,
            'canViewAllOutlets' => $scope === 'all',
            'outletIds' => $outletIds,
            'selectedOutletId' => $defaultOutletId,
            'onboardingRequired' => false,
            'mustChangePassword' => false,
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
                'companySlug' => $company['route_slug'] ?? $companySlug ?: 'IFresso-Coffee',
                'roleId' => $userPayload['roleId'],
                'permissions' => $permissions,
                'permissionMatrix' => $permissionMatrix,
            ]),
        ];
    }

    private function defaultOutletId($db, int $companyId, array $outletRows, string $scope): string
    {
        if ($companyId <= 0) {
            return '';
        }

        $builder = $db->table('outlets')->whereIn('status', [StatusCodeService::ACTIVE, 'active']);
        if ($companyId > 0 && $db->fieldExists('company_id', 'outlets')) {
            $builder->where('company_id', $companyId);
        }
        $activeOutlets = $builder->get()->getResultArray();

        if (empty($activeOutlets)) {
            return '';
        }

        $allowedIds = array_map(static fn ($row) => (int) $row['outlet_id'], $outletRows);
        if ($scope !== 'all' && ! empty($allowedIds)) {
            $activeOutlets = array_values(array_filter(
                $activeOutlets,
                static fn ($row) => in_array((int) $row['id'], $allowedIds, true)
            ));
        }

        if (empty($activeOutlets)) {
            return '';
        }

        return $this->outletCode((int) $activeOutlets[0]['id']);
    }

    private function roleCode(string $name): string
    {
        $normalized = strtolower(trim($name));
        switch ($normalized) {
            case 'super admin':
                return 'super_admin';
            case 'company admin':
            case 'admin':
            case 'owner':
                return 'company_admin';
            case 'manager':
            case 'store manager':
                return 'manager';
            case 'cashier':
            case 'kasir':
                return 'cashier';
            case 'kitchen':
            case 'dapur':
                return 'kitchen';
            case 'inventory':
            case 'gudang':
                return 'inventory';
            default:
                return 'custom';
        }
    }

    private function accessContext($db, $centralDb, string $authType, int $companyId, string $scope, array $outletRows): array
    {
        $companies = $this->companyRows($centralDb, $companyId);
        $activeCompany = $this->firstValue($companies, 'id', $companyId, 'id') ? $companyId : 0;
        $outlets = $this->outletRows($db, $companyId, $scope, $outletRows);

        return [
            'authType' => $authType,
            'companies' => $companies,
            'activeCompanyId' => $activeCompany ? $this->companyCode($activeCompany) : '',
            'outlets' => $outlets,
            'roles' => $this->roleRows($db, $companyId),
            'users' => $this->userRows($db, $companyId, $this->roleRows($db, $companyId)),
        ];
    }

    private function companyRows($db, int $companyId = 0): array
    {
        if (! $db->tableExists('companies')) {
            return [];
        }

        $builder = $db->table('companies')->whereIn('status', [StatusCodeService::ACTIVE, 'active']);
        if ($companyId > 0) {
            $builder->where('id', $companyId);
        }

        return array_map(function ($row) {
            $logo = (string) ($row['logo_path'] ?? $row['logo_url'] ?? $row['logo'] ?? '');
            $color = (string) ($row['theme_color'] ?? $row['themeColor'] ?? '#6e3a16');
            $slug = (string) ($row['route_slug'] ?? $row['slug'] ?? '');
            return [
                'id' => $this->companyCode((int) $row['id']),
                'numericId' => (int) $row['id'],
                'name' => (string) $row['name'],
                'code' => (string) ($row['code'] ?? ''),
                'slug' => $slug,
                'routeSlug' => $slug,
                'logoUrl' => $logo,
                'logo_url' => $logo,
                'logo_path' => $logo,
                'themeColor' => $color,
                'theme_color' => $color,
                'status' => StatusCodeService::common((string) ($row['status'] ?? '')),
            ];
        }, $builder->get()->getResultArray());
    }

    private function outletRows($db, int $companyId, string $scope, array $outletRows): array
    {
        if ($companyId <= 0 || ! $db->tableExists('outlets')) {
            return [];
        }

        $allowedIds = array_map(static fn ($row) => (int) $row['outlet_id'], $outletRows);
        $builder = $db->table('outlets')->whereIn('status', [StatusCodeService::ACTIVE, 'active']);
        if ($companyId > 0 && $db->fieldExists('company_id', 'outlets')) {
            $builder->where('company_id', $companyId);
        }

        if ($scope !== 'all' && ! empty($allowedIds)) {
            $builder->whereIn('id', $allowedIds);
        }

        return array_map(function ($row) {
            return [
                'id' => $this->outletCode((int) $row['id']),
                'numericId' => (int) $row['id'],
                'name' => (string) $row['name'],
                'code' => (string) ($row['code'] ?? ''),
                'status' => StatusCodeService::common((string) ($row['status'] ?? '')),
            ];
        }, $builder->get()->getResultArray());
    }

    private function roleRows($db, int $companyId): array
    {
        if (! $db->tableExists('roles')) {
            return [];
        }

        $builder = $db->table('roles');
        if ($companyId > 0 && $db->fieldExists('company_id', 'roles')) {
            $builder->where('company_id', $companyId);
        }

        return array_map(function ($row) {
            return [
                'id' => $this->roleCodeFromRow($row),
                'numericId' => (int) $row['id'],
                'name' => (string) $row['name'],
                'scope' => (string) ($row['scope'] ?? 'selected'),
                'isSystem' => ! empty($row['is_system']),
                'permissions' => json_decode((string) ($row['permissions'] ?? '[]'), true) ?: [],
            ];
        }, $builder->get()->getResultArray());
    }

    private function userRows($db, int $companyId, array $roles): array
    {
        if (! $db->tableExists('users')) {
            return [];
        }

        $builder = $db->table('users');
        if ($companyId > 0 && $db->fieldExists('company_id', 'users')) {
            $builder->where('company_id', $companyId);
        }

        $users = $builder->get()->getResultArray();
        $userRoles = $db->tableExists('user_roles') ? $db->table('user_roles')->get()->getResultArray() : [];
        $userOutlets = $db->tableExists('user_outlets') ? $db->table('user_outlets')->get()->getResultArray() : [];

        return array_map(function ($row) use ($companyId, $roles, $userRoles, $userOutlets) {
            $userId = (int) $row['id'];
            $roleId = $this->firstValue($userRoles, 'user_id', $userId, 'role_id');
            $rolePayload = $this->findRolePayload($roles, $roleId);

            $assignedOutlets = array_values(array_filter(
                $userOutlets,
                static fn ($outRow) => (int) $outRow['user_id'] === $userId
            ));

            return [
                'id' => $this->userCode($row),
                'numericId' => $userId,
                'name' => (string) $row['name'],
                'email' => (string) $row['email'],
                'role' => (string) ($rolePayload['name'] ?? ($row['type'] === 'super_admin' ? 'Super Admin' : 'Company Admin')),
                'roleId' => (string) ($rolePayload['id'] ?? ($row['type'] === 'super_admin' ? 'role-super-admin' : 'role-company-admin')),
                'authType' => (string) ($row['type'] ?? 'company_user'),
                'status' => StatusCodeService::common((string) ($row['status'] ?? '')),
                'companyId' => $companyId ? $this->companyCode($companyId) : '',
                'outletScope' => (string) ($rolePayload['scope'] ?? 'selected'),
                'outletIds' => array_map(fn ($outRow) => $this->outletCode((int) $outRow['outlet_id']), $assignedOutlets),
            ];
        }, $users);
    }

    private function roleCodeFromRow(array $row): string
    {
        $id = (int) ($row['id'] ?? 0);
        return $id > 0 ? 'role-' . $id : 'role-custom';
    }

    private function firstValue(array $rows, string $matchField, $matchValue, string $returnField)
    {
        foreach ($rows as $row) {
            if (isset($row[$matchField]) && (string) $row[$matchField] === (string) $matchValue) {
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

        foreach ($roles as $role) {
            if ((int) ($role['numericId'] ?? 0) === (int) $numericRoleId) {
                return $role;
            }
        }

        return null;
    }
}
