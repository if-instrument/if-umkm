<?php

namespace App\Services;

use App\Models\CompanyModel;
use App\Models\OutletModel;
use App\Models\RoleModel;
use App\Models\UserModel;
use Config\Database;

class AccessManagementService
{
    use \App\Services\Shared\MappingHelperTrait;

    public function data(): array
    {
        $db = Database::connect();
        $companies = (new CompanyModel())->orderBy('id')->findAll();
        $outlets = $db->tableExists('outlets') ? (new OutletModel())->orderBy('id')->findAll() : [];
        $roles = $db->tableExists('roles') ? (new RoleModel())->orderBy('id')->findAll() : [];
        $users = (new UserModel())->orderBy('id')->findAll();
        $userRoles = $db->tableExists('user_roles') ? $db->table('user_roles')->get()->getResultArray() : [];
        $userOutlets = $db->tableExists('user_outlets') ? $db->table('user_outlets')->get()->getResultArray() : [];

        return [
            'activeCompanyId' => 'company-main',
            'companies' => array_map(fn ($row) => [
                'id' => $this->companyCode((int) $row['id']),
                'name' => $row['name'],
                'routeSlug' => $row['route_slug'] ?? $this->slugify($row['name']),
                'routeUrl' => '/' . ($row['route_slug'] ?? $this->slugify($row['name'])) . '/login',
                'logoUrl' => $row['logo_path'] ?? '',
                'themeColor' => $row['theme_color'] ?? '#6e3a16',
                'dbMode' => $row['db_mode'] ?? 'dedicated',
                'dbHost' => $row['db_host'] ?? '',
                'dbName' => $row['db_name'] ?? '',
                'dbPort' => $row['db_port'] ?? null,
                'adminName' => $this->companyAdmin($row, $users)['name'] ?? 'Admin Perusahaan',
                'adminEmail' => $this->companyAdmin($row, $users)['email'] ?? 'admin@company.id',
                'adminUserId' => isset($this->companyAdmin($row, $users)['id']) ? $this->userCode($this->companyAdmin($row, $users)) : '',
                'adminStatus' => StatusCodeService::common($this->companyAdmin($row, $users)['status'] ?? 'inactive', StatusCodeService::INACTIVE),
                'status' => StatusCodeService::common($row['status'] ?? ''),
            ], $companies),
            'outlets' => array_map(fn ($row) => [
                'id' => $this->outletCode((int) $row['id']),
                'companyId' => $this->companyCode((int) ($row['company_id'] ?? 1)),
                'code' => $row['code'],
                'name' => $row['name'],
                'city' => $row['address'] ?? '',
                'status' => StatusCodeService::common($row['status'] ?? ''),
            ], $outlets),
            'companyRoles' => array_map(fn ($row) => $this->rolePayload($row), $roles),
            'users' => array_map(fn ($row) => $this->userPayload($row, $roles, $userRoles, $userOutlets), $users),
        ];
    }

    public function saveCompany(array $payload): array
    {
        $model = new CompanyModel();
        $id = $this->numericId($payload['id'] ?? '');
        $isNew = ! $id;
        if ($isNew) {
            $adminEmail = strtolower(trim((string) ($payload['adminEmail'] ?? '')));
            if (! filter_var($adminEmail, FILTER_VALIDATE_EMAIL)) {
                throw new \InvalidArgumentException('Email admin perusahaan tidak valid.');
            }
            if ((new UserModel())->where('email', $adminEmail)->first()) {
                throw new \InvalidArgumentException('Email admin sudah digunakan.');
            }
        }
        $slug = $this->slugify((string) ($payload['routeSlug'] ?? $payload['name'] ?? 'company'));
        $this->assertUniqueCompanySlug($slug, $id);
        $row = [
            'name' => trim((string) ($payload['name'] ?? '')),
            'brand_name' => trim((string) ($payload['name'] ?? '')),
            'route_slug' => $slug,
            'tagline' => 'UMKM Solution',
            'logo_path' => trim((string) ($payload['logoUrl'] ?? '')),
            'theme_color' => $payload['themeColor'] ?? '#6e3a16',
            'status' => StatusCodeService::common($payload['status'] ?? 'active'),
        ];
        if ($id) {
            $model->update($id, $row);
        } else {
            $tenantProvisioning = new TenantDatabaseProvisioningService();
            $tenantDbName = trim((string) ($payload['dbName'] ?? '')) ?: $tenantProvisioning->databaseNameForSlug($slug);
            $row += $tenantProvisioning->tenantConfig($tenantDbName);
            $id = (int) $model->insert($row);
            $adminUserId = $this->createDefaultCompanyData($id, $payload);
            $admin = (new UserModel())->find($adminUserId) ?: [];
            $companyRow = $model->find($id) ?: $row;
            $tenantProvisioning->provision($tenantDbName, $companyRow, [
                'name' => $admin['name'] ?? ($payload['adminName'] ?? 'Admin Perusahaan'),
                'email' => $admin['email'] ?? strtolower((string) ($payload['adminEmail'] ?? '')),
                'password_hash' => $admin['password_hash'] ?? '',
                'status' => StatusCodeService::common($admin['status'] ?? 'invited', StatusCodeService::DRAFT),
            ]);
        }
        $company = $this->companyDetail($this->companyCode($id));
        if ($isNew) {
            $company['invitation'] = (new UserInvitationService())->invite($adminUserId);
        }
        return $company;
    }

    public function deactivateCompany(string $legacyId): array
    {
        $id = $this->numericId($legacyId);
        if ($id) (new CompanyModel())->update($id, ['status' => StatusCodeService::INACTIVE]);
        return $this->companyDetail($this->companyCode($id));
    }

    public function saveOutlet(array $payload): array
    {
        $model = new OutletModel();
        $id = $this->numericId($payload['id'] ?? '');
        $companyId = $this->companyId($payload['companyId'] ?? 'company-main');
        $row = [
            'code' => trim((string) ($payload['code'] ?? '')),
            'name' => trim((string) ($payload['name'] ?? '')),
            'address' => trim((string) ($payload['city'] ?? '')),
            'status' => StatusCodeService::common($payload['status'] ?? 'active'),
        ];
        $row = $this->withCompanyData('outlets', $row, $companyId);
        $id ? $model->update($id, $row) : $model->insert($row);
        if (! $id) {
            $id = (int) $model->getInsertID();
            $this->createDefaultOutletSettings($companyId, $id);
        }
        return $this->outletDetail($this->outletCode($id));
    }

    public function deactivateOutlet(string $legacyId): array
    {
        $id = $this->numericId($legacyId);
        if ($id) (new OutletModel())->update($id, ['status' => StatusCodeService::INACTIVE]);
        return $this->outletDetail($this->outletCode($id));
    }

    public function saveRole(array $payload): array
    {
        $model = new RoleModel();
        $id = $this->numericId($payload['id'] ?? '');
        $permissionMatrix = $this->normalizePermissionMatrix($payload['permissionMatrix'] ?? [], $payload['permissions'] ?? []);
        $permissions = $this->legacyPermissionsFromMatrix($permissionMatrix);
        $companyId = $this->companyId($payload['companyId'] ?? 'company-main');
        $row = [
            'name' => trim((string) ($payload['name'] ?? '')),
            'scope' => ($payload['outletScope'] ?? 'selected') === 'all' ? 'all' : 'selected',
            'responsibility' => trim((string) ($payload['responsibility'] ?? '')),
            'permissions' => json_encode($permissions),
            'permission_matrix' => json_encode($permissionMatrix),
            'status' => StatusCodeService::common($payload['status'] ?? 'active'),
        ];
        $row = $this->withCompanyData('roles', $row, $companyId);
        $id ? $model->update($id, $row) : $model->insert($row);
        if (! $id) {
            $id = (int) $model->getInsertID();
        }
        return $this->roleDetail($this->roleCode(['id' => $id, 'name' => $row['name']]));
    }

    public function deactivateRole(string $legacyId): array
    {
        $id = $this->numericId($legacyId);
        if ($id) (new RoleModel())->update($id, ['status' => StatusCodeService::INACTIVE]);
        return $this->roleDetail($this->roleCode(['id' => $id, 'name' => (new RoleModel())->find($id)['name'] ?? '']));
    }

    public function saveUser(array $payload): array
    {
        $db = Database::connect();
        $model = new UserModel();
        $id = $this->numericId($payload['id'] ?? '');
        $companyId = $this->companyId($payload['companyId'] ?? 'company-main');
        $roleId = $this->numericId($payload['roleId'] ?? '');
        $role = $roleId ? (new RoleModel())->find($roleId) : null;
        if ($roleId && (! $role || ! $this->rowBelongsToCompany($role, $companyId) || ! StatusCodeService::isActive($role['status'] ?? ''))) {
            throw new \InvalidArgumentException('Role user tidak valid untuk perusahaan ini.');
        }
        if (! $id && ! $roleId) {
            throw new \InvalidArgumentException('Buat role aktif terlebih dahulu sebelum menambahkan user.');
        }
        $email = strtolower(trim((string) ($payload['email'] ?? '')));
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new \InvalidArgumentException('Email user tidak valid.');
        }
        $emailOwner = (new UserModel())->where('email', $email)->first();
        if ($emailOwner && (int) $emailOwner['id'] !== $id) {
            throw new \InvalidArgumentException('Email user sudah digunakan.');
        }
        $row = [
            'name' => trim((string) ($payload['name'] ?? '')),
            'email' => $email,
            'type' => ($payload['role'] ?? '') === 'Company Admin' ? 'company_admin' : 'company_user',
            'status' => StatusCodeService::common($payload['status'] ?? 'active'),
        ];
        $row = $this->withCompanyData('users', $row, $companyId);
        $isNew = ! $id;
        if ($id) {
            $model->update($id, $row);
        } else {
            $row['password_hash'] = password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT);
            $row['status'] = StatusCodeService::DRAFT;
            $id = (int) $model->insert($row);
        }

        $db->table('user_roles')->where('user_id', $id)->delete();
        if ($roleId) {
            $db->table('user_roles')->insert(['user_id' => $id, 'role_id' => $roleId]);
        }
        $db->table('user_outlets')->where('user_id', $id)->delete();
        if (($payload['outletScope'] ?? 'selected') !== 'all') {
            foreach (($payload['outletIds'] ?? []) as $outletCode) {
                $outletId = $this->numericId($outletCode);
                if ($outletId) {
                    $db->table('user_outlets')->insert(['user_id' => $id, 'outlet_id' => $outletId]);
                }
            }
        }
        $user = $this->userDetail($this->userCode(['id' => $id, 'email' => $row['email']]), $companyId);
        if ($isNew) {
            $user['invitation'] = (new UserInvitationService())->invite($id);
        }
        return $user;
    }

    public function resendUserInvitation(string $legacyId, int $companyId): array
    {
        $id = $this->numericId($legacyId);
        $user = $id ? (new UserModel())->find($id) : null;
        if (! $user || ! $this->rowBelongsToCompany($user, $companyId) || $user['type'] === 'super_admin') {
            throw new \InvalidArgumentException('User perusahaan tidak ditemukan.');
        }
        return (new UserInvitationService())->invite($id);
    }

    public function resendCompanyAdminInvitation(string $legacyCompanyId): array
    {
        $companyId = $this->numericId($legacyCompanyId);
        $model = new UserModel();
        if ($this->hasCompanyColumn('users')) {
            $model->where('company_id', $companyId);
        }
        $user = $companyId ? $model->where('type', 'company_admin')->first() : null;
        if (! $user) {
            throw new \InvalidArgumentException('Admin perusahaan tidak ditemukan.');
        }
        return (new UserInvitationService())->invite((int) $user['id']);
    }

    public function userPage(int $companyId = 1, array $filters = []): array
    {
        $db = Database::connect();
        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = min(100, max(1, (int) ($filters['per_page'] ?? $filters['perPage'] ?? 25)));
        $builder = $db->table('users');
        if ($this->hasCompanyColumn('users')) {
            $builder->where('company_id', $companyId);
        }

        if (($filters['status'] ?? '') !== '') {
            $builder->where('status', StatusCodeService::common((string) $filters['status']));
        }
        if (($filters['search'] ?? '') !== '') {
            $search = (string) $filters['search'];
            $builder->groupStart()
                ->like('name', $search)
                ->orLike('email', $search)
                ->groupEnd();
        }

        $countBuilder = clone $builder;
        $total = $countBuilder->countAllResults();
        $users = $builder
            ->orderBy('name', 'ASC')
            ->limit($perPage, ($page - 1) * $perPage)
            ->get()
            ->getResultArray();
        $roles = $this->rolesForCompany($companyId);
        $userIds = array_column($users, 'id') ?: [0];
        $userRoles = $db->table('user_roles')->whereIn('user_id', $userIds)->get()->getResultArray();
        $userOutlets = $db->table('user_outlets')->whereIn('user_id', $userIds)->get()->getResultArray();

        return [
            'items' => array_map(fn ($row) => $this->userPayload($row, $roles, $userRoles, $userOutlets), $users),
            'meta' => $this->paginationMeta($page, $perPage, $total),
        ];
    }

    public function userDetail(string $legacyId, int $companyId = 1): array
    {
        $id = $this->numericId($legacyId);
        $model = new UserModel();
        if ($this->hasCompanyColumn('users')) {
            $model->where('company_id', $companyId);
        }
        $row = $id ? $model->find($id) : null;
        if (! $row) {
            throw new \InvalidArgumentException('User tidak ditemukan.');
        }

        $db = Database::connect();
        return $this->userPayload(
            $row,
            $this->rolesForCompany($companyId),
            $db->table('user_roles')->where('user_id', $id)->get()->getResultArray(),
            $db->table('user_outlets')->where('user_id', $id)->get()->getResultArray()
        );
    }

    public function deactivateUser(string $legacyId): array
    {
        $id = $this->numericId($legacyId);
        if ($id) {
            (new UserModel())->update($id, ['status' => StatusCodeService::INACTIVE]);
        }
        $row = $id ? (new UserModel())->find($id) : null;
        return $row ? $this->userDetail($this->userCode($row), (int) ($row['company_id'] ?? 1)) : ['id' => $legacyId, 'status' => StatusCodeService::INACTIVE];
    }

    public function companyDetail(string $legacyId): array
    {
        foreach ($this->data()['companies'] ?? [] as $company) {
            if ($company['id'] === $legacyId) return $company;
        }
        throw new \InvalidArgumentException('Perusahaan tidak ditemukan.');
    }

    public function outletDetail(string $legacyId): array
    {
        foreach ($this->data()['outlets'] ?? [] as $outlet) {
            if ($outlet['id'] === $legacyId) return $outlet;
        }
        throw new \InvalidArgumentException('Outlet tidak ditemukan.');
    }

    public function roleDetail(string $legacyId): array
    {
        foreach ($this->data()['companyRoles'] ?? [] as $role) {
            if ($role['id'] === $legacyId) return $role;
        }
        throw new \InvalidArgumentException('Role tidak ditemukan.');
    }

    private function createDefaultCompanyData(int $companyId, array $payload): int
    {
        $userId = (new UserModel())->insert([
            'company_id' => $companyId,
            'name' => $payload['adminName'] ?? 'Admin Perusahaan',
            'email' => strtolower($payload['adminEmail'] ?? 'admin@company.id'),
            'password_hash' => password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT),
            'type' => 'company_admin',
            'status' => StatusCodeService::DRAFT,
        ]);
        return (int) $userId;
    }

    private function createDefaultOutletSettings(int $companyId, int $outletId): void
    {
        $now = date('Y-m-d H:i:s');
        $settings = [
            [
                'company_id' => $companyId,
                'outlet_id' => $outletId,
                'setting_key' => 'costing_method',
                'setting_value' => 'average',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'company_id' => $companyId,
                'outlet_id' => $outletId,
                'setting_key' => 'table_service_mode',
                'setting_value' => 'free_seating_pay_first',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'company_id' => $companyId,
                'outlet_id' => $outletId,
                'setting_key' => 'tax_rate',
                'setting_value' => '0',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'company_id' => $companyId,
                'outlet_id' => $outletId,
                'setting_key' => 'dine_in_service_rate',
                'setting_value' => '0',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'company_id' => $companyId,
                'outlet_id' => $outletId,
                'setting_key' => 'printer_name',
                'setting_value' => '',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'company_id' => $companyId,
                'outlet_id' => $outletId,
                'setting_key' => 'order_channel_dine_in',
                'setting_value' => '0',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'company_id' => $companyId,
                'outlet_id' => $outletId,
                'setting_key' => 'order_channel_take_away',
                'setting_value' => '1',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'company_id' => $companyId,
                'outlet_id' => $outletId,
                'setting_key' => 'order_channel_delivery',
                'setting_value' => '0',
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ];
        $settings = array_map(fn ($row) => $this->withCompanyData('app_settings', $row, $companyId), $settings);
        Database::connect()->table('app_settings')->insertBatch($settings);
        $this->createDefaultCashPaymentMethod($companyId, $outletId);
    }

    private function createDefaultCashPaymentMethod(int $companyId, int $outletId): void
    {
        $db = Database::connect();
        $exists = $db->table('payment_methods')
            ->where('outlet_id', $outletId)
            ->where('type', 'cash')
;
        if ($this->hasCompanyColumn('payment_methods')) {
            $exists->where('company_id', $companyId);
        }
        $exists = $exists->get()
            ->getRowArray();
        if ($exists) {
            return;
        }

        $now = date('Y-m-d H:i:s');
        $db->table('payment_methods')->insert($this->withCompanyData('payment_methods', [
            'company_id' => $companyId,
            'outlet_id' => $outletId,
            'name' => 'Cash',
            'type' => 'cash',
            'gateway_provider' => 'manual',
            'channel_code' => 'CASH',
            'terminal_id' => '',
            'edc_mode' => 'manual',
            'merchant_id' => '',
            'terminal_serial' => '',
            'connector_status' => StatusCodeService::CONNECTOR_NOT_CONFIGURED,
            'use_sandbox' => 1,
            'fee_rate' => 0,
            'fee_payer' => 'merchant',
            'account' => 'Kas Tunai',
            'sort_order' => 1,
            'status' => StatusCodeService::ACTIVE,
            'created_at' => $now,
            'updated_at' => $now,
        ], $companyId));
    }

    private function createDefaultIngredientTemplates(int $companyId): void
    {
        $db = Database::connect();
        $now = date('Y-m-d H:i:s');
        $templates = [
            ['code' => 'tpl-bahan-utama', 'name' => 'Bahan Utama', 'category' => 'Raw Material', 'unit' => 'satuan'],
            ['code' => 'tpl-bahan-tambahan', 'name' => 'Bahan Tambahan', 'category' => 'Raw Material', 'unit' => 'satuan'],
            ['code' => 'tpl-kemasan-satuan', 'name' => 'Kemasan Satuan', 'category' => 'Packaging', 'unit' => 'pcs'],
            ['code' => 'tpl-kemasan-bundling', 'name' => 'Kemasan Bundling', 'category' => 'Packaging', 'unit' => 'pcs'],
            ['code' => 'tpl-consumable', 'name' => 'Consumable', 'category' => 'Consumable', 'unit' => 'pcs'],
        ];

        foreach ($templates as $template) {
            $exists = $db->table('ingredient_templates')
                ->where('code', $template['code']);
            if ($this->hasCompanyColumn('ingredient_templates')) {
                $exists->where('company_id', $companyId);
            }
            $exists = $exists->get()
                ->getRowArray();
            if ($exists) {
                continue;
            }

            $db->table('ingredient_templates')->insert($this->withCompanyData('ingredient_templates', $template + [
                'company_id' => $companyId,
                'status' => StatusCodeService::ACTIVE,
                'created_at' => $now,
                'updated_at' => $now,
            ], $companyId));
        }
    }

    private function userPayload(array $row, array $roles, array $userRoles, array $userOutlets): array
    {
        $roleId = $this->firstValue($userRoles, 'user_id', $row['id'], 'role_id');
        $role = $this->findById($roles, $roleId);
        $scope = $row['type'] === 'super_admin' ? 'none' : (($role['scope'] ?? '') === 'all' || $row['type'] === 'company_admin' ? 'all' : 'selected');
        $outletIds = array_values(array_map(fn ($item) => $this->outletCode((int) $item['outlet_id']), array_filter($userOutlets, fn ($item) => (int) $item['user_id'] === (int) $row['id'])));
        return [
            'id' => $this->userCode($row),
            'name' => $row['name'],
            'email' => $row['email'],
            'role' => $role['name'] ?? ($row['type'] === 'super_admin' ? 'Super Admin' : 'Company Admin'),
            'roleId' => $role ? $this->roleCode($role) : ($row['type'] === 'super_admin' ? 'role-super-admin' : 'role-company-admin'),
            'status' => StatusCodeService::common($row['status'] ?? ''),
            'authType' => $row['type'],
            'companyId' => $row['company_id'] ?? null ? $this->companyCode((int) $row['company_id']) : ($row['type'] === 'super_admin' ? '' : 'company-main'),
            'outletScope' => $scope,
            'canViewAllOutlets' => $scope === 'all',
            'outletIds' => $outletIds,
        ];
    }

    private function rolePayload(array $row): array
    {
        $permissions = json_decode($row['permissions'] ?: '[]', true) ?: [];
        $matrix = json_decode($row['permission_matrix'] ?? '[]', true) ?: [];
        return [
            'id' => $this->roleCode($row),
            'companyId' => $this->companyCode((int) ($row['company_id'] ?? 1)),
            'name' => $row['name'],
            'outletScope' => $row['scope'] === 'all' ? 'all' : 'selected',
            'responsibility' => $row['responsibility'] ?: $this->defaultResponsibility($row['name']),
            'permissions' => $permissions,
            'permissionMatrix' => $this->normalizePermissionMatrix($matrix, $permissions),
            'status' => StatusCodeService::common($row['status'] ?? ''),
        ];
    }

    private function normalizePermissionMatrix(array $matrix = [], array $fallbackPermissions = []): array
    {
        $fallback = $this->permissionMatrixFromLegacy($fallbackPermissions);
        $normalized = [];
        foreach ($this->permissionModules() as $module => $definition) {
            $current = $matrix[$module] ?? $fallback[$module] ?? [];
            foreach ($this->permissionActions() as $action) {
                $normalized[$module][$action] = in_array($action, $definition['actions'], true) && (bool) ($current[$action] ?? false);
            }
        }
        return $normalized;
    }

    private function permissionMatrixFromLegacy(array $permissions): array
    {
        $legacy = array_flip($permissions);
        $matrix = [];
        foreach ($this->permissionModules() as $module => $definition) {
            $legacyPermission = $definition['legacy'];
            $enabled = isset($legacy[$legacyPermission]) || isset($legacy[$module]);
            foreach ($this->permissionActions() as $action) {
                $matrix[$module][$action] = $enabled && in_array($action, $definition['actions'], true);
            }
        }
        return $matrix;
    }

    private function legacyPermissionsFromMatrix(array $matrix): array
    {
        $permissions = [];
        foreach ($this->permissionModules() as $module => $definition) {
            $row = $matrix[$module] ?? [];
            foreach ($definition['actions'] as $action) {
                if ($row[$action] ?? false) {
                    $permissions[$definition['legacy']] = true;
                    break;
                }
            }
        }
        return array_keys($permissions);
    }

    private function permissionModules(): array
    {
        return [
            'dashboard.overview' => ['legacy' => 'operations', 'actions' => ['read']],
            'dashboard.recommendations' => ['legacy' => 'operations', 'actions' => ['read']],
            'pos.transaction' => ['legacy' => 'pos', 'actions' => ['create', 'read']],
            'pos.orderEdit' => ['legacy' => 'pos', 'actions' => ['update']],
            'pos.payment' => ['legacy' => 'pos', 'actions' => ['create', 'read']],
            'orders.history' => ['legacy' => 'reports', 'actions' => ['read']],
            'queue.kitchen' => ['legacy' => 'kitchen', 'actions' => ['read', 'update']],
            'queue.cashier' => ['legacy' => 'pos', 'actions' => ['read', 'update']],
            'crm.customers' => ['legacy' => 'reports', 'actions' => ['create', 'read', 'update', 'delete']],
            'crm.transactions' => ['legacy' => 'reports', 'actions' => ['read']],
            'categories.manage' => ['legacy' => 'operations', 'actions' => ['create', 'read', 'update', 'delete']],
            'products.catalog' => ['legacy' => 'operations', 'actions' => ['create', 'read', 'update', 'delete']],
            'products.outletPrice' => ['legacy' => 'operations', 'actions' => ['read', 'update']],
            'recipes.template' => ['legacy' => 'operations', 'actions' => ['create', 'read', 'update', 'delete']],
            'recipes.outletMapping' => ['legacy' => 'operations', 'actions' => ['read', 'update']],
            'modifiers.master' => ['legacy' => 'operations', 'actions' => ['create', 'read', 'update', 'delete']],
            'modifiers.options' => ['legacy' => 'operations', 'actions' => ['create', 'read', 'update', 'delete']],
            'modifiers.outletPrice' => ['legacy' => 'operations', 'actions' => ['read', 'update']],
            'modifiers.ingredientTemplate' => ['legacy' => 'operations', 'actions' => ['create', 'read', 'update', 'delete']],
            'inventory.overview' => ['legacy' => 'inventory', 'actions' => ['read']],
            'inventory.ingredients' => ['legacy' => 'inventory', 'actions' => ['create', 'read', 'update', 'delete']],
            'inventory.purchase' => ['legacy' => 'inventory', 'actions' => ['create', 'read']],
            'inventory.movement' => ['legacy' => 'inventory', 'actions' => ['read']],
            'inventory.waste' => ['legacy' => 'inventory', 'actions' => ['create', 'read']],
            'reports.profitLoss' => ['legacy' => 'reports', 'actions' => ['read']],
            'reports.operatingExpenses' => ['legacy' => 'reports', 'actions' => ['create', 'read', 'update', 'delete']],
            'reports.sales' => ['legacy' => 'reports', 'actions' => ['read']],
            'reports.inventoryLoss' => ['legacy' => 'reports', 'actions' => ['read']],
            'settings.outlet' => ['legacy' => 'settings', 'actions' => ['read', 'update']],
            'settings.payment' => ['legacy' => 'settings', 'actions' => ['create', 'read', 'update', 'delete']],
            'settings.tables' => ['legacy' => 'settings', 'actions' => ['create', 'read', 'update', 'delete']],
            'settings.packaging' => ['legacy' => 'settings', 'actions' => ['create', 'read', 'update', 'delete']],
            'settings.costing' => ['legacy' => 'settings', 'actions' => ['read', 'update']],
            'company.branding' => ['legacy' => 'company', 'actions' => ['read', 'update']],
            'outlets.manage' => ['legacy' => 'outlet', 'actions' => ['create', 'read', 'update', 'delete']],
            'users.manage' => ['legacy' => 'user', 'actions' => ['create', 'read', 'update', 'delete']],
            'roles.manage' => ['legacy' => 'role', 'actions' => ['create', 'read', 'update', 'delete']],
        ];
    }

    private function permissionActions(): array
    {
        return ['create', 'read', 'update', 'delete'];
    }

    private function paginationMeta(int $page, int $perPage, int $total): array
    {
        return [
            'page' => $page,
            'perPage' => $perPage,
            'total' => $total,
            'totalPages' => (int) max(1, ceil($total / max(1, $perPage))),
        ];
    }

    private function companyAdmin(array $company, array $users): ?array
    {
        foreach ($users as $user) {
            if ((int) ($user['company_id'] ?? 0) === (int) $company['id'] && $user['type'] === 'company_admin') {
                return $user;
            }
        }
        return null;
    }

    private function numericId(string $legacyId): int
    {
        if ($legacyId === '') return 0;
        if (ctype_digit($legacyId)) return (int) $legacyId;
        $known = [
            'company-main' => 1,
            'outlet-main' => 1,
            'outlet-north' => 2,
            'outlet-south' => 3,
            'role-company-admin' => 1,
            'role-area-manager' => 2,
            'role-outlet-manager' => 3,
            'role-kasir' => 4,
            'role-kitchen' => 5,
            'role-inventory' => 6,
            'usr-super-admin' => 1,
            'usr-company-admin' => 2,
            'usr-area-manager' => 3,
            'usr-outlet-manager' => 4,
            'usr-kasir' => 5,
            'usr-kitchen' => 6,
            'usr-inventory' => 7,
        ];
        if (isset($known[$legacyId])) return $known[$legacyId];
        return preg_match('/(\d+)$/', $legacyId, $matches) ? (int) $matches[1] : 0;
    }

    private function companyId(string $legacyId): int { return $this->numericId($legacyId) ?: 1; }
    
    private function roleCode(array $row): string
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
                return (int) $row['id'] === 1 ? 'role-company-admin' : 'role-' . $row['id'];
            default:
                return 'role-' . ($row['id'] ?? uniqid());
        }
    }

    private function findById(array $rows, mixed $id): ?array
    {
        foreach ($rows as $row) if ((int) $row['id'] === (int) $id) return $row;
        return null;
    }

    private function firstValue(array $rows, string $matchKey, mixed $matchValue, string $valueKey): mixed
    {
        foreach ($rows as $row) if ((int) $row[$matchKey] === (int) $matchValue) return $row[$valueKey];
        return null;
    }

    private function defaultResponsibility(string $role): string
    {
        switch ($role) {
            case 'Company Admin':
                return 'Mengelola perusahaan, outlet, user, role, branding, dan seluruh data operasional perusahaan.';
            case 'Area Manager':
                return 'Monitoring beberapa outlet dan melihat laporan lintas outlet.';
            case 'Outlet Manager':
                return 'Mengelola operasional dan staff di outlet yang ditugaskan.';
            case 'Kasir':
                return 'Menjalankan POS dan transaksi pada outlet tugas.';
            case 'Kitchen':
                return 'Melihat dan memproses antrian produksi/pesanan di outlet tugas.';
            case 'Inventory Staff':
                return 'Mengelola stok bahan, penerimaan stok, waste, dan kartu stok outlet tugas.';
            default:
                return 'Akses operasional perusahaan.';
        }
    }

    private function assertUniqueCompanySlug(string $slug, int $companyId = 0): void
    {
        $reserved = ['api', 'assets', 'pages', 'scripts', 'uploads', 'sales', 'products', 'inventory', 'reports', 'admin', 'invitation', 'login', 'login.html', 'index.html'];
        if (in_array(strtolower($slug), $reserved, true)) {
            throw new \InvalidArgumentException('Route company memakai nama sistem. Gunakan route lain.');
        }

        $builder = Database::connect()->table('companies')->where('route_slug', $slug);
        if ($companyId) {
            $builder->where('id !=', $companyId);
        }
        if ($builder->countAllResults() > 0) {
            throw new \InvalidArgumentException('Route company sudah digunakan. Gunakan route lain.');
        }
    }

    private function slugify(string $value): string
    {
        $value = preg_replace('/[^A-Za-z0-9]+/', '-', trim($value)) ?: 'company';
        return trim($value, '-') ?: 'company';
    }

    private function hasCompanyColumn(string $table): bool
    {
        $db = Database::connect();
        return $db->tableExists($table) && $db->fieldExists('company_id', $table);
    }

    private function withCompanyData(string $table, array $data, int $companyId): array
    {
        if ($this->hasCompanyColumn($table)) {
            $data['company_id'] = $companyId;
        } else {
            unset($data['company_id']);
        }
        return $data;
    }

    private function rolesForCompany(int $companyId): array
    {
        $model = new RoleModel();
        if ($this->hasCompanyColumn('roles')) {
            $model->where('company_id', $companyId);
        }
        return $model->findAll();
    }
}
