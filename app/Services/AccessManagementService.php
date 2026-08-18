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

    private function centralDb()
    {
        $tenantDb = service('tenantDatabaseService');
        return $tenantDb ? $tenantDb->centralConnection() : Database::connect();
    }

    /**
     * Sync branding fields (logo, theme_color, name) to tenant DB companies table.
     * This ensures the sidebar logo and favicon always match the central DB record.
     */
    private function syncBrandingToTenantDb(int $companyId, array $row): void
    {
        try {
            $tenantService = service('tenantDatabaseService');
            if (! $tenantService) return;

            // Get company slug from central DB to find tenant connection
            $centralDb = $this->centralDb();
            $companyRow = $centralDb->table('companies')->where('id', $companyId)->get()->getRowArray();
            if (! $companyRow || empty($companyRow['route_slug'])) return;

            $tenantDb = $tenantService->connectionForCompanySlug($companyRow['route_slug']);
            if (! $tenantDb || ! $tenantDb->tableExists('companies')) return;

            $syncFields = array_filter([
                'name'        => $row['name'] ?? null,
                'logo_path'   => $row['logo_path'] ?? null,
                'theme_color' => $row['theme_color'] ?? null,
                'route_slug'  => $row['route_slug'] ?? null,
                'updated_at'  => date('Y-m-d H:i:s'),
            ], fn ($v) => $v !== null && $v !== '');

            if (! empty($syncFields)) {
                $tenantDb->table('companies')->where('id', 1)->update($syncFields);
            }
        } catch (\Throwable $e) {
            // Non-fatal: log but don't interrupt main flow
            log_message('warning', '[syncBrandingToTenantDb] ' . $e->getMessage());
        }
    }

    public function data(): array
    {
        $centralDb = $this->centralDb();
        $db = Database::connect();
        $companies = $centralDb->table('companies')->orderBy('id', 'ASC')->get()->getResultArray();
        $outlets = $db->tableExists('outlets') ? (new OutletModel())->orderBy('id')->findAll() : [];
        $roles = $db->tableExists('roles') ? (new RoleModel())->orderBy('id')->findAll() : [];
        $users = (new UserModel())->orderBy('id')->findAll();
        $userRoles = $db->tableExists('user_roles') ? $db->table('user_roles')->get()->getResultArray() : [];
        $userOutlets = $db->tableExists('user_outlets') ? $db->table('user_outlets')->get()->getResultArray() : [];

        $saasPlans = $this->saasPlans();
        $saasPlansMap = [];
        foreach ($saasPlans as $plan) {
            $saasPlansMap[strtolower($plan['code'])] = $plan;
        }

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
                'subscriptionPlan' => $row['subscription_plan'] ?? 'Professional',
                'expiresAt' => $this->resolveCompanyExpiresAt($row, $saasPlansMap),
                'maxOutlets' => (int) ($row['max_outlets'] ?? ($saasPlansMap[strtolower($row['subscription_plan'] ?? 'professional')]['maxOutlets'] ?? 5)),
                'aiEnableFaceLogin' => isset($row['ai_enable_face_login']) ? (bool) $row['ai_enable_face_login'] : ($saasPlansMap[strtolower($row['subscription_plan'] ?? 'professional')]['hasAiBiometrics'] ?? true),
                'aiEnableFingerprint' => isset($row['ai_enable_fingerprint']) ? (bool) $row['ai_enable_fingerprint'] : ($saasPlansMap[strtolower($row['subscription_plan'] ?? 'professional')]['hasAiBiometrics'] ?? true),
                'hasAiBiometrics' => (isset($row['ai_enable_face_login']) ? (bool) $row['ai_enable_face_login'] : ($saasPlansMap[strtolower($row['subscription_plan'] ?? 'professional')]['hasAiBiometrics'] ?? true)) || (isset($row['ai_enable_fingerprint']) ? (bool) $row['ai_enable_fingerprint'] : ($saasPlansMap[strtolower($row['subscription_plan'] ?? 'professional')]['hasAiBiometrics'] ?? true)),
                'createdAt' => $row['created_at'] ?? '',
                'paymentProofUrl' => $row['payment_proof_path'] ?? '',
                'paymentStatus' => $row['payment_status'] ?? '10',
                'paymentNotes' => $row['payment_notes'] ?? '',
                'tenantStatus' => $row['tenant_status'] ?? ($row['db_name'] ? 'CREATED' : 'NOT_CREATED'),
                'registrationType' => $row['registration_type'] ?? ($row['db_name'] ? 'SUPER_ADMIN' : 'PUBLIC_REGISTRATION'),
                'status' => (function($s) {
                    // Normalize legacy string statuses to numeric codes
                    $map = ['ACTIVE' => '10', 'REJECTED' => '90', 'PENDING_APPROVAL' => '00', 'INACTIVE' => '90'];
                    return $map[strtoupper((string)$s)] ?? ($s ?? '00');
                })($row['status'] ?? '00'),
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
            'saasPlans' => $saasPlans,
            'centralPaymentAccounts' => $this->centralPaymentAccounts(),
        ];
    }

    private function resolveCompanyExpiresAt(array $row, array $saasPlansMap): ?string
    {
        if (! empty($row['expires_at'])) {
            return $row['expires_at'];
        }
        $planCode = strtolower(trim((string) ($row['subscription_plan'] ?? 'Professional')));
        $durationDays = $saasPlansMap[$planCode]['durationDays'] ?? 365;
        if ($durationDays <= 0) {
            return null;
        }

        $createdAtStr = ! empty($row['created_at']) ? $row['created_at'] : date('Y-m-d H:i:s');
        $createdAtTime = strtotime($createdAtStr);
        $expiresTime = strtotime("+{$durationDays} days", $createdAtTime);
        $expiresDate = date('Y-m-d', $expiresTime);

        if (! empty($row['id'])) {
            $this->centralDb()->table('companies')->where('id', (int) $row['id'])->update(['expires_at' => $expiresDate]);
        }

        return $expiresDate;
    }

    public function saasPlans(): array
    {
        try {
            $db = Database::connect();
            if ($db->tableExists('saas_plans')) {
                if (! in_array('has_ai_biometrics', $db->getFieldNames('saas_plans'), true)) {
                    $db->query("ALTER TABLE saas_plans ADD COLUMN has_ai_biometrics TINYINT(1) DEFAULT 1");
                }

                $rows = $db->table('saas_plans')->orderBy('id')->get()->getResultArray();
                if (! empty($rows)) {
                    return array_map(fn ($row) => [
                        'id' => (string) $row['id'],
                        'code' => (string) $row['code'],
                        'name' => (string) $row['name'],
                        'price' => (float) ($row['price'] ?? 0),
                        'maxOutlets' => (int) ($row['max_outlets'] ?? 5),
                        'durationDays' => (int) ($row['duration_days'] ?? 365),
                        'description' => (string) ($row['description'] ?? ''),
                        'isFeatured' => (bool) ($row['is_featured'] ?? false),
                        'hasAiBiometrics' => isset($row['has_ai_biometrics']) ? (bool) $row['has_ai_biometrics'] : (strtolower((string)$row['code']) !== 'starter'),
                        'status' => (string) ($row['status'] ?? '10'),
                    ], $rows);
                }
            }
        } catch (\Throwable $exception) {
            // Fall back to default server plans
        }

        return [
            ['id' => '1', 'code' => 'Starter', 'name' => 'Starter Plan', 'price' => 150000, 'maxOutlets' => 3, 'durationDays' => 90, 'description' => 'Masa aktif langganan standar 90 hari dengan batas kuota 3 outlet.', 'isFeatured' => false, 'hasAiBiometrics' => false, 'status' => '10'],
            ['id' => '2', 'code' => 'Professional', 'name' => 'Professional Plan', 'price' => 350000, 'maxOutlets' => 10, 'durationDays' => 365, 'description' => 'Lisensi penuh 1 tahun, multi-outlet, CRM, inventory sync, & payment gateway.', 'isFeatured' => true, 'hasAiBiometrics' => true, 'status' => '10'],
            ['id' => '3', 'code' => 'Enterprise', 'name' => 'Enterprise Plan', 'price' => 750000, 'maxOutlets' => 999, 'durationDays' => 0, 'description' => 'Akses unlimited outlet, dedicated tenant DB, & prioritas support 24/7.', 'isFeatured' => false, 'hasAiBiometrics' => true, 'status' => '10'],
        ];
    }

    public function saveSaasPlan(array $payload): array
    {
        $db = Database::connect();
        if ($db->tableExists('saas_plans')) {
            if (! in_array('has_ai_biometrics', $db->getFieldNames('saas_plans'), true)) {
                $db->query("ALTER TABLE saas_plans ADD COLUMN has_ai_biometrics TINYINT(1) DEFAULT 1");
            }
        }

        $code = trim((string) ($payload['code'] ?? $payload['name'] ?? 'Plan'));
        $code = preg_replace('/[^A-Za-z0-9_-]/', '', $code) ?: 'Plan_' . time();
        $name = trim((string) ($payload['name'] ?? $code));
        $price = max(0, (float) ($payload['price'] ?? 0));
        $maxOutlets = max(1, (int) ($payload['maxOutlets'] ?? 5));
        $durationDays = max(0, (int) ($payload['durationDays'] ?? 365));
        $description = trim((string) ($payload['description'] ?? ''));
        $isFeatured = ! empty($payload['isFeatured']) ? 1 : 0;
        $hasAiBiometrics = ! empty($payload['hasAiBiometrics']) ? 1 : 0;
        $status = StatusCodeService::common($payload['status'] ?? 'active');

        $row = [
            'code' => $code,
            'name' => $name,
            'price' => $price,
            'max_outlets' => $maxOutlets,
            'duration_days' => $durationDays,
            'description' => $description,
            'is_featured' => $isFeatured,
            'has_ai_biometrics' => $hasAiBiometrics,
            'status' => $status,
            'updated_at' => date('Y-m-d H:i:s'),
        ];

        $id = (int) ($payload['id'] ?? 0);
        if ($id > 0) {
            $db->table('saas_plans')->where('id', $id)->update($row);
        } else {
            $row['created_at'] = date('Y-m-d H:i:s');
            $db->table('saas_plans')->insert($row);
        }

        return $this->saasPlans();
    }

    public function deactivateSaasPlan(string $id): array
    {
        $db = Database::connect();
        if ($db->tableExists('saas_plans')) {
            $db->table('saas_plans')->where('id', (int) $id)->update(['status' => '90', 'updated_at' => date('Y-m-d H:i:s')]);
        }
        return $this->saasPlans();
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
        $existingCompany = $id ? $model->find($id) : null;
        $logoUrl = trim((string) ($payload['logoUrl'] ?? ''));
        if ($id && $logoUrl === '' && ! empty($existingCompany['logo_path'])) {
            $logoUrl = $existingCompany['logo_path'];
        }

        $registrationType = ! empty($existingCompany['registration_type'])
            ? $existingCompany['registration_type']
            : trim((string) ($payload['registrationType'] ?? 'SUPER_ADMIN'));

        $row = [
            'name' => trim((string) ($payload['name'] ?? '')),
            'brand_name' => trim((string) ($payload['name'] ?? '')),
            'route_slug' => $slug,
            'tagline' => 'UMKM Solution',
            'logo_path' => $logoUrl,
            'theme_color' => $payload['themeColor'] ?? '#6e3a16',
            'subscription_plan' => trim((string) ($payload['subscriptionPlan'] ?? 'Professional')),
            'expires_at' => trim((string) ($payload['expiresAt'] ?? '')) ?: null,
            'max_outlets' => (int) ($payload['maxOutlets'] ?? 5),
            'ai_enable_face_login' => isset($payload['aiEnableFaceLogin']) ? ($payload['aiEnableFaceLogin'] ? 1 : 0) : null,
            'ai_enable_fingerprint' => isset($payload['aiEnableFingerprint']) ? ($payload['aiEnableFingerprint'] ? 1 : 0) : null,
            'registration_type' => $registrationType,
            'status' => StatusCodeService::common($payload['status'] ?? 'active'),
        ];
        if ($id) {
            $model->update($id, $row);
            // Sync branding fields to tenant DB so sidebar logo/favicon is always up-to-date
            $this->syncBrandingToTenantDb($id, $row);
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

    public function renewSubscription(string $companyId, array $payload = []): array
    {
        $id = $this->numericId($companyId);
        if (! $id) throw new \InvalidArgumentException('ID Perusahaan tidak valid.');

        $companyModel = new CompanyModel();
        $company = $companyModel->find($id);
        if (! $company) throw new \InvalidArgumentException('Data Perusahaan tidak ditemukan.');

        $planCode = trim((string) ($payload['subscriptionPlan'] ?? $company['subscription_plan'] ?? 'Professional'));
        $saasPlans = $this->saasPlans();
        $selectedPlan = null;
        foreach ($saasPlans as $plan) {
            if (strtolower($plan['code']) === strtolower($planCode)) {
                $selectedPlan = $plan;
                break;
            }
        }

        $durationDays = (int) ($selectedPlan['durationDays'] ?? 365);
        $currentExpiry = ! empty($company['expires_at']) ? strtotime($company['expires_at']) : time();
        $baseTime = ($currentExpiry > time()) ? $currentExpiry : time();

        $newExpiresAt = ($durationDays > 0)
            ? date('Y-m-d H:i:s', strtotime("+{$durationDays} days", $baseTime))
            : null;

        $paymentProofUrl = trim((string) ($payload['paymentProofUrl'] ?? ''));

        $fromPlanCode = $company['subscription_plan'] ?? 'Starter';
        $toPlanCode = $selectedPlan['code'] ?? $planCode;

        $actionType = 'RENEWAL';
        $fromPrice = 0;
        foreach ($saasPlans as $sp) {
            if (strtolower($sp['code']) === strtolower($fromPlanCode)) {
                $fromPrice = (float) ($sp['price'] ?? 0);
                break;
            }
        }
        $toPrice = (float) ($selectedPlan['price'] ?? 0);
        if (strtolower($fromPlanCode) !== strtolower($toPlanCode)) {
            $actionType = ($toPrice >= $fromPrice) ? 'UPGRADE' : 'DOWNGRADE';
        }

        $companyModel->update($id, [
            'subscription_plan' => $selectedPlan['code'] ?? $planCode,
            'max_outlets' => (int) ($selectedPlan['maxOutlets'] ?? $company['max_outlets'] ?? 5),
            'expires_at' => $newExpiresAt ? date('Y-m-d', strtotime($newExpiresAt)) : null,
            'payment_status' => '10',
            'payment_proof_path' => $paymentProofUrl ?: ($company['payment_proof_path'] ?? ''),
            'payment_notes' => 'Perpanjangan subscription berhasil disetujui & diperbarui.',
            'status' => '10',
            'updated_at' => date('Y-m-d H:i:s'),
        ]);

        $authType  = trim((string) ($payload['_authType']  ?? 'company_admin'));
        $actorName = trim((string) ($payload['_actorName'] ?? ''));
        $isSuperAdmin = $authType === 'super_admin';
        $actorLabel = $isSuperAdmin
            ? 'Super Admin' . ($actorName ? " ({$actorName})" : '')
            : 'Tenant Mandiri' . ($actorName ? " ({$actorName})" : '');

        $this->recordSubscriptionAuditLog([
            'company_id'        => $id,
            'company_name'      => $company['name'],
            'action_type'       => $actionType,
            'from_plan_code'    => $fromPlanCode,
            'from_plan_name'    => $fromPlanCode,
            'to_plan_code'      => $toPlanCode,
            'to_plan_name'      => $selectedPlan['name'] ?? $toPlanCode,
            'price_paid'        => (float) ($selectedPlan['price'] ?? 0),
            'duration_days'     => $durationDays,
            'max_outlets'       => (int) ($selectedPlan['maxOutlets'] ?? 5),
            'has_ai_biometrics' => ! empty($selectedPlan['hasAiBiometrics']),
            'prev_expires_at'   => $company['expires_at'],
            'new_expires_at'    => $newExpiresAt ? date('Y-m-d', strtotime($newExpiresAt)) : null,
            'payment_proof_path'=> $paymentProofUrl ?: ($company['payment_proof_path'] ?? ''),
            'notes'             => "Transaksi {$actionType} paket dari {$fromPlanCode} ke {$toPlanCode} oleh {$actorLabel}.",
        ]);

        $this->recordAuditLog($id, null, 'RENEW_SUBSCRIPTION', "Perpanjangan paket {$planCode} selama {$durationDays} hari berhasil diproses.");

        return [
            'ok' => true,
            'message' => "Masa aktif perusahaan {$company['name']} berhasil diperpanjang hingga " . ($newExpiresAt ? date('d M Y', strtotime($newExpiresAt)) : 'Selamanya (Unlimited)') . '.',
            'company' => $this->companyDetail($this->companyCode($id)),
        ];
    }

    public function recordSubscriptionAuditLog(array $data): void
    {
        try {
            $db = Database::connect();
            if (! $db->tableExists('saas_subscription_logs')) {
                return;
            }

            $claims = (array) (service('request')->jwt ?? []);

            $db->table('saas_subscription_logs')->insert([
                'company_id' => (int) ($data['company_id'] ?? 0),
                'company_name' => (string) ($data['company_name'] ?? '-'),
                'action_type' => (string) ($data['action_type'] ?? 'RENEWAL'),
                'from_plan_code' => (string) ($data['from_plan_code'] ?? ''),
                'from_plan_name' => (string) ($data['from_plan_name'] ?? ''),
                'to_plan_code' => (string) ($data['to_plan_code'] ?? ''),
                'to_plan_name' => (string) ($data['to_plan_name'] ?? ''),
                'price_paid' => (float) ($data['price_paid'] ?? 0),
                'duration_days' => (int) ($data['duration_days'] ?? 365),
                'max_outlets' => (int) ($data['max_outlets'] ?? 5),
                'has_ai_biometrics' => ! empty($data['has_ai_biometrics']) ? 1 : 0,
                'prev_expires_at' => ! empty($data['prev_expires_at']) ? date('Y-m-d', strtotime($data['prev_expires_at'])) : null,
                'new_expires_at' => ! empty($data['new_expires_at']) ? date('Y-m-d', strtotime($data['new_expires_at'])) : null,
                'payment_method' => (string) ($data['payment_method'] ?? 'BANK_TRANSFER'),
                'payment_proof_path' => (string) ($data['payment_proof_path'] ?? ''),
                'notes' => (string) ($data['notes'] ?? ''),
                'created_by_user_id' => (int) ($claims['userId'] ?? $claims['sub'] ?? 0) ?: null,
                'created_by_name' => (string) ($claims['name'] ?? 'Super Admin'),
                'created_at' => date('Y-m-d H:i:s'),
            ]);
        } catch (\Throwable $ex) {
            // Ignore optional audit errors
        }
    }

    public function subscriptionLogs(string $companyCode = ''): array
    {
        try {
            $db = Database::connect();
            if (! $db->tableExists('saas_subscription_logs')) {
                return [];
            }

            $builder = $db->table('saas_subscription_logs')->orderBy('id', 'DESC');
            if ($companyCode !== '') {
                $companyId = $this->numericId($companyCode);
                if ($companyId > 0) {
                    $builder->where('company_id', $companyId);
                }
            }

            $rows = $builder->get()->getResultArray();
            return array_map(fn ($row) => [
                'id' => (int) $row['id'],
                'companyId' => $this->companyCode((int) $row['company_id']),
                'companyName' => $row['company_name'],
                'actionType' => $row['action_type'],
                'fromPlanCode' => $row['from_plan_code'] ?: '-',
                'fromPlanName' => $row['from_plan_name'] ?: '-',
                'toPlanCode' => $row['to_plan_code'],
                'toPlanName' => $row['to_plan_name'],
                'pricePaid' => (float) $row['price_paid'],
                'durationDays' => (int) $row['duration_days'],
                'maxOutlets' => (int) $row['max_outlets'],
                'hasAiBiometrics' => (bool) $row['has_ai_biometrics'],
                'prevExpiresAt' => $row['prev_expires_at'] ?: '-',
                'newExpiresAt' => $row['new_expires_at'] ?: 'Selamanya',
                'paymentMethod' => $row['payment_method'],
                'paymentProofUrl' => $row['payment_proof_path'],
                'notes' => $row['notes'],
                'createdByName' => $row['created_by_name'] ?: 'System',
                'createdAt' => date('d M Y H:i', strtotime($row['created_at'])),
            ], $rows);
        } catch (\Throwable $ex) {
            return [];
        }
    }

    public function publicRegisterCompany(array $payload): array
    {
        $adminName = trim((string) ($payload['adminName'] ?? ''));
        $adminEmail = strtolower(trim((string) ($payload['adminEmail'] ?? '')));
        $companyName = trim((string) ($payload['name'] ?? ''));
        $planCode = trim((string) ($payload['subscriptionPlan'] ?? 'Professional'));
        $paymentProofUrl = trim((string) ($payload['paymentProofUrl'] ?? ''));
        $logoUrl = trim((string) ($payload['logoUrl'] ?? ''));
        $themeColor = trim((string) ($payload['themeColor'] ?? '#3B1F8C')) ?: '#3B1F8C';

        if (! $companyName) throw new \InvalidArgumentException('Nama perusahaan wajib diisi.');
        if (! filter_var($adminEmail, FILTER_VALIDATE_EMAIL)) throw new \InvalidArgumentException('Email admin perusahaan tidak valid.');

        $existingUser = (new UserModel())->where('email', $adminEmail)->first();
        if ($existingUser) {
            $companyModel = new CompanyModel();
            $existingCompany = ! empty($existingUser['company_id']) ? $companyModel->find($existingUser['company_id']) : null;

            $cStatus = (string) ($existingCompany['status'] ?? '');
            $pStatus = (string) ($existingCompany['payment_status'] ?? '');
            $uStatus = (string) ($existingUser['status'] ?? '');

            $isRejected = in_array($cStatus, ['90', 'rejected', '20'], true) || $pStatus === '20' || in_array($uStatus, ['90', 'rejected', '20'], true);
            $isPending = in_array($cStatus, ['00', '0', 'pending'], true) || $pStatus === '00';

            if (! $isRejected) {
                if ($isPending) {
                    throw new \InvalidArgumentException('Pendaftaran dengan email ini sedang dalam proses verifikasi Super Admin.');
                }
                throw new \InvalidArgumentException('Email admin sudah terdaftar dan aktif.');
            }

            // Existing application was REJECTED: Update existing record for Re-registration / Resubmission (Daftar Ulang)
            $db = Database::connect();
            $db->transStart();

            $saasPlans = $this->saasPlans();
            $selectedPlan = null;
            foreach ($saasPlans as $p) {
                if (strtolower($p['code']) === strtolower($planCode)) {
                    $selectedPlan = $p;
                    break;
                }
            }
            $durationDays = $selectedPlan['durationDays'] ?? 365;
            $maxOutlets = $selectedPlan['maxOutlets'] ?? 5;
            $expiresAt = $durationDays > 0 ? date('Y-m-d', strtotime("+{$durationDays} days")) : null;

            $companyId = (int) $existingCompany['id'];
            $companyModel->update($companyId, [
                'name' => $companyName,
                'brand_name' => $companyName,
                'logo_path' => $logoUrl ?: ($existingCompany['logo_path'] ?? ''),
                'theme_color' => $themeColor ?: ($existingCompany['theme_color'] ?? '#3B1F8C'),
                'subscription_plan' => $planCode,
                'expires_at' => $expiresAt,
                'max_outlets' => $maxOutlets,
                'status' => '00', // Reset status back to Pending Approval
                'tenant_status' => 'NOT_CREATED',
                'registration_type' => 'PUBLIC_REGISTRATION',
                'payment_proof_path' => $paymentProofUrl ?: ($existingCompany['payment_proof_path'] ?? ''),
                'payment_status' => '00', // Reset payment status to Pending Verification
                'payment_notes' => 'Pendaftaran ulang mandiri (Daftar Ulang). Menunggu persetujuan Super Admin.',
                'updated_at' => date('Y-m-d H:i:s'),
            ]);

            (new UserModel())->update($existingUser['id'], [
                'name' => $adminName ?: $existingUser['name'],
                'status' => '00', // Reset user status back to Pending
                'updated_at' => date('Y-m-d H:i:s'),
            ]);

            $this->recordAuditLog($companyId, (int) $existingUser['id'], 'PUBLIC_REGISTRATION_RESUBMITTED', "Pendaftaran ulang perusahaan {$companyName} berhasil dikirim kembali (PENDING_APPROVAL).");

            // Audit SaaS: Catat riwayat pengajuan ulang pendaftaran
            $this->recordSubscriptionAuditLog([
                'company_id'        => $companyId,
                'company_name'      => $companyName,
                'action_type'       => 'RESUBMIT_REGISTER',
                'from_plan_code'    => $existingCompany['subscription_plan'] ?? '-',
                'from_plan_name'    => $existingCompany['subscription_plan'] ?? '-',
                'to_plan_code'      => $planCode,
                'to_plan_name'      => $selectedPlan['name'] ?? $planCode,
                'price_paid'        => (float) ($selectedPlan['price'] ?? 0),
                'duration_days'     => (int) ($selectedPlan['durationDays'] ?? 365),
                'max_outlets'       => (int) ($maxOutlets ?? 5),
                'has_ai_biometrics' => ! empty($selectedPlan['hasAiBiometrics']),
                'prev_expires_at'   => null,
                'new_expires_at'    => $expiresAt,
                'payment_proof_path'=> $paymentProofUrl ?: ($existingCompany['payment_proof_path'] ?? ''),
                'notes'             => "Pendaftaran ulang mandiri (RESUBMIT) oleh calon tenant {$companyName}. Menunggu verifikasi Super Admin.",
            ]);

            $db->transComplete();

            $companyRow = $companyModel->find($companyId);
            $userRow = (new UserModel())->find($existingUser['id']);

            $this->sendEmail('user_registration_pending', [
                'company' => $companyRow,
                'user' => $userRow,
            ]);

            $this->sendEmail('admin_registration_notification', [
                'company' => $companyRow,
                'user' => $userRow,
            ]);

            return [
                'ok' => true,
                'message' => 'Pendaftaran ulang perusahaan Anda berhasil dikirim! Tim Super Admin akan memverifikasi ulang pengajuan Anda.',
                'companyId' => $this->companyCode($companyId),
            ];
        }

        $saasPlans = $this->saasPlans();
        $selectedPlan = null;
        foreach ($saasPlans as $p) {
            if (strtolower($p['code']) === strtolower($planCode)) {
                $selectedPlan = $p;
                break;
            }
        }
        $durationDays = $selectedPlan['durationDays'] ?? 365;
        $maxOutlets = $selectedPlan['maxOutlets'] ?? 5;
        $expiresAt = $durationDays > 0 ? date('Y-m-d', strtotime("+{$durationDays} days")) : null;

        $db = Database::connect();
        $db->transStart();

        try {
            $companyModel = new CompanyModel();
            $row = [
                'name' => $companyName,
                'brand_name' => $companyName,
                'route_slug' => null, // Slug generated upon approval provisioning
                'tagline' => 'UMKM Solution',
                'logo_path' => $logoUrl,
                'theme_color' => $themeColor,
                'subscription_plan' => $planCode,
                'expires_at' => $expiresAt,
                'max_outlets' => $maxOutlets,
                'status' => '00',
                'tenant_status' => 'NOT_CREATED',
                'registration_type' => 'PUBLIC_REGISTRATION',
                'payment_proof_path' => $paymentProofUrl,
                'payment_status' => '00', // Pending verification
                'payment_notes' => 'Pendaftaran online mandiri. Menunggu persetujuan Super Admin.',
                'created_at' => date('Y-m-d H:i:s'),
                'updated_at' => date('Y-m-d H:i:s'),
            ];

            $companyId = (int) $companyModel->insert($row);

            $userModel = new UserModel();
            $userId = (int) $userModel->insert([
                'company_id' => $companyId,
                'name' => $adminName ?: 'Admin ' . $companyName,
                'email' => $adminEmail,
                'password_hash' => password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT), // Temporary placeholder hash until approval
                'type' => 'company_admin',
                'status' => '00', // Draft / Pending
                'must_change_password' => 0,
                'created_at' => date('Y-m-d H:i:s'),
                'updated_at' => date('Y-m-d H:i:s'),
            ]);

            $this->recordAuditLog($companyId, $userId, 'PUBLIC_REGISTRATION_SUBMITTED', "Pendaftaran perusahaan {$companyName} berhasil disimpan dengan status PENDING_APPROVAL.");

            // Audit SaaS: Catat riwayat pendaftaran baru mandiri
            $this->recordSubscriptionAuditLog([
                'company_id'        => $companyId,
                'company_name'      => $companyName,
                'action_type'       => 'INITIAL_REGISTER',
                'from_plan_code'    => null,
                'from_plan_name'    => null,
                'to_plan_code'      => $planCode,
                'to_plan_name'      => $selectedPlan['name'] ?? $planCode,
                'price_paid'        => (float) ($selectedPlan['price'] ?? 0),
                'duration_days'     => (int) ($durationDays ?? 365),
                'max_outlets'       => (int) ($maxOutlets ?? 5),
                'has_ai_biometrics' => ! empty($selectedPlan['hasAiBiometrics']),
                'prev_expires_at'   => null,
                'new_expires_at'    => $expiresAt,
                'payment_proof_path'=> $paymentProofUrl,
                'notes'             => "Pendaftaran mandiri baru oleh calon tenant {$companyName} dengan paket {$planCode}. Menunggu verifikasi Super Admin.",
            ]);

            $db->transComplete();

            if ($db->transStatus() === false) {
                throw new \RuntimeException('Gagal menyimpan data pendaftaran perusahaan.');
            }

            $companyRow = $companyModel->find($companyId);
            $userRow = $userModel->find($userId);

            // Step 2: Email to User (Registration received notification, NO password, NO tenant)
            $this->sendEmail('user_registration_pending', [
                'company' => $companyRow,
                'user' => $userRow,
            ]);

            // Step 3: Email to Super Admin
            $this->sendEmail('admin_registration_notification', [
                'company' => $companyRow,
                'user' => $userRow,
            ]);

            return [
                'ok' => true,
                'message' => 'Pendaftaran perusahaan Anda berhasil diterima! Tim Super Admin akan memverifikasi bukti pembayaran Anda.',
                'companyId' => $this->companyCode($companyId),
            ];
        } catch (\Throwable $ex) {
            $db->transRollback();
            throw $ex;
        }
    }

    public function publicForgotPassword(array $payload): array
    {
        $email = strtolower(trim((string) ($payload['email'] ?? '')));
        $companySlug = trim((string) ($payload['companySlug'] ?? ''));

        if (! $email || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new \InvalidArgumentException('Alamat email tidak valid.');
        }

        $userModel = new UserModel();
        $companyModel = new CompanyModel();
        $tenantService = new TenantDatabaseService();

        // 1. Locate User
        $user = $userModel->where('email', $email)->first();
        if (! $user && $companySlug !== '') {
            $tenantDb = $tenantService->connectionForCompanySlug($companySlug);
            if ($tenantDb && $tenantDb->tableExists('users')) {
                $user = $tenantDb->table('users')->where('email', $email)->get()->getRowArray();
            }
        }

        if (! $user) {
            throw new \InvalidArgumentException('Alamat email tidak terdaftar dalam sistem.');
        }

        // 2. Generate Temporary Password
        $tempPassword = 'Tmp' . bin2hex(random_bytes(3)) . '!';
        $tempHash = password_hash($tempPassword, PASSWORD_DEFAULT);
        $now = date('Y-m-d H:i:s');

        // 3. Update Central DB User
        $centralUser = $userModel->where('email', $email)->first();
        if ($centralUser) {
            $userModel->update($centralUser['id'], [
                'password_hash' => $tempHash,
                'must_change_password' => 1,
                'updated_at' => $now,
            ]);
        }

        // 4. Update Tenant DB User
        $companyId = (int) ($user['company_id'] ?? 0);
        $company = $companyId ? $companyModel->find($companyId) : null;
        if (! $company && $companySlug !== '') {
            $company = $tenantService->companyBySlug($companySlug);
        }

        if ($company && ! empty($company['route_slug'])) {
            $tenantDb = $tenantService->connectionForCompanySlug($company['route_slug']);
            if ($tenantDb && $tenantDb->tableExists('users')) {
                $tenantDb->table('users')->where('email', $email)->update([
                    'password_hash' => $tempHash,
                    'must_change_password' => 1,
                    'updated_at' => $now,
                ]);
            }
        }

        // 5. Audit Log & Email
        $this->recordAuditLog($companyId ?: null, (int) ($user['id'] ?? null), 'PASSWORD_RESET_TEMPORARY_ISSUED', "Password sementara diterbitkan untuk email {$email}.");

        $this->sendEmail('user_forgot_password', [
            'company' => $company ?: [],
            'user' => $user,
            'tempPassword' => $tempPassword,
        ]);

        return [
            'ok' => true,
            'message' => 'Password sementara telah berhasil dibuat dan dikirimkan ke email Anda. Silakan periksa inbox email Anda.',
        ];
    }

    public function approveCompany(string $companyId): array
    {
        $id = $this->numericId($companyId);
        if (! $id) throw new \InvalidArgumentException('ID Perusahaan tidak valid.');

        return $this->provisionCompany($id);
    }

    public function provisionCompany(int $companyId): array
    {
        $db = Database::connect();
        $db->transStart();

        try {
            $companyModel = new CompanyModel();
            $company = $companyModel->find($companyId);
            if (! $company) {
                throw new \InvalidArgumentException('Data Perusahaan tidak ditemukan.');
            }

            // 1. Generate unique route slug
            $slug = $company['route_slug'] ?: $this->generateUniqueCompanySlug($company['name'], $companyId);

            // 2. Resolve tenant DB configuration
            $tenantProvisioning = new TenantDatabaseProvisioningService();
            $tenantDbName = $company['db_name'] ?: $tenantProvisioning->databaseNameForSlug($slug);
            $tenantConfig = $tenantProvisioning->tenantConfig($tenantDbName);

            // 3. Generate Temporary Password
            $tempPassword = 'Tmp' . bin2hex(random_bytes(3)) . '!';

            // 4. Update Company record
            $companyUpdate = [
                'route_slug' => $slug,
                'status' => '10', // ACTIVE (numeric)
                'tenant_status' => 'CREATED',
                'payment_status' => '10', // PAID
                'payment_notes' => 'Pendaftaran disetujui & tenant berhasil diprovisi oleh Super Admin.',
                'updated_at' => date('Y-m-d H:i:s'),
            ] + $tenantConfig;
            $companyModel->update($companyId, $companyUpdate);

            // 5. Update Admin User in Central DB
            $userModel = new UserModel();
            $adminUser = $userModel->where('company_id', $companyId)->first();
            if (! $adminUser) {
                $adminUserId = (int) $userModel->insert([
                    'company_id' => $companyId,
                    'name' => 'Admin ' . $company['name'],
                    'email' => strtolower('admin@' . $slug . '.com'),
                    'password_hash' => password_hash($tempPassword, PASSWORD_DEFAULT),
                    'type' => 'company_admin',
                    'status' => '10',
                    'must_change_password' => 1,
                    'created_at' => date('Y-m-d H:i:s'),
                    'updated_at' => date('Y-m-d H:i:s'),
                ]);
                $adminUser = $userModel->find($adminUserId);
            } else {
                $userModel->update($adminUser['id'], [
                    'password_hash' => password_hash($tempPassword, PASSWORD_DEFAULT),
                    'status' => '10',
                    'must_change_password' => 1,
                    'updated_at' => date('Y-m-d H:i:s'),
                ]);
                $adminUser['password_hash'] = password_hash($tempPassword, PASSWORD_DEFAULT);
                $adminUser['status'] = '10';
            }

            // 6. Provision Tenant Database (Run Migrations and Seeders)
            $companyRow = $companyModel->find($companyId);
            $tenantProvisioning->provision($tenantDbName, $companyRow, [
                'name' => $adminUser['name'],
                'email' => strtolower($adminUser['email']),
                'password_hash' => password_hash($tempPassword, PASSWORD_DEFAULT),
                'status' => '10',
                'must_change_password' => 1,
            ]);

            // 7. Record Audit Log
            $this->recordAuditLog($companyId, $adminUser['id'] ?? null, 'APPROVE_COMPANY_PROVISIONING', "Tenant DB {$tenantDbName} berhasil diprovisi dengan slug {$slug}.");

            // Audit SaaS: Catat persetujuan pendaftaran beserta snapshot harga final saat ini
            $saasPlans = $this->saasPlans();
            $approvedPlanCode = $companyRow['subscription_plan'] ?? 'Starter';
            $approvedPlan = null;
            foreach ($saasPlans as $sp) {
                if (strtolower($sp['code']) === strtolower($approvedPlanCode)) {
                    $approvedPlan = $sp;
                    break;
                }
            }
            $this->recordSubscriptionAuditLog([
                'company_id'        => $companyId,
                'company_name'      => $companyRow['name'],
                'action_type'       => 'REGISTRATION_APPROVED',
                'from_plan_code'    => null,
                'from_plan_name'    => null,
                'to_plan_code'      => $approvedPlanCode,
                'to_plan_name'      => $approvedPlan['name'] ?? $approvedPlanCode,
                'price_paid'        => (float) ($approvedPlan['price'] ?? 0),
                'duration_days'     => (int) ($approvedPlan['durationDays'] ?? 365),
                'max_outlets'       => (int) ($approvedPlan['maxOutlets'] ?? $companyRow['max_outlets'] ?? 5),
                'has_ai_biometrics' => ! empty($approvedPlan['hasAiBiometrics']),
                'prev_expires_at'   => null,
                'new_expires_at'    => $companyRow['expires_at'] ?? null,
                'payment_proof_path'=> $companyRow['payment_proof_path'] ?? '',
                'notes'             => "Pendaftaran perusahaan {$companyRow['name']} disetujui Super Admin. Tenant {$tenantDbName} berhasil diprovisi.",
            ]);

            $db->transComplete();

            if ($db->transStatus() === false) {
                throw new \RuntimeException('Gagal memproses DB transaction provisioning tenant.');
            }

            // 8. Send Email Activation to User with Temporary Password
            $this->sendEmail('user_registration_approved', [
                'company' => $companyRow,
                'user' => $adminUser,
                'tempPassword' => $tempPassword,
            ]);

            return $this->data();
        } catch (\Throwable $ex) {
            $db->transRollback();
            $this->recordAuditLog($companyId, null, 'PROVISIONING_FAILED', $ex->getMessage());
            throw $ex;
        }
    }

    public function rejectCompany(string $companyId, string $notes = ''): array
    {
        $id = $this->numericId($companyId);
        if (! $id) throw new \InvalidArgumentException('ID Perusahaan tidak valid.');

        $db = Database::connect();
        $db->transStart();

        $companyModel = new CompanyModel();
        $company = $companyModel->find($id);
        if (! $company) throw new \InvalidArgumentException('Data Perusahaan tidak ditemukan.');

        $companyModel->update($id, [
            'status' => '90', // INACTIVE/REJECTED (numeric)
            'tenant_status' => 'NOT_CREATED',
            'payment_status' => '20', // Rejected
            'payment_notes' => $notes ?: 'Pendaftaran ditolak oleh Super Admin.',
            'updated_at' => date('Y-m-d H:i:s'),
        ]);

        $userModel = new UserModel();
        $adminUser = $userModel->where('company_id', $id)->first();
        if ($adminUser) {
            $userModel->update($adminUser['id'], ['status' => '90']);
        }

        $this->recordAuditLog($id, null, 'REJECT_COMPANY_REGISTRATION', $notes ?: 'Pendaftaran ditolak Super Admin.');

        $db->transComplete();

        if ($adminUser) {
            $hashKey = $this->generateResubmitHashKey($id, $adminUser['email']);
            $this->sendEmail('user_registration_rejected', [
                'company' => $company,
                'user' => $adminUser,
                'notes' => $notes ?: 'Pendaftaran tidak memenuhi verifikasi bukti pembayaran.',
                'hashKey' => $hashKey,
            ]);
        }

        return $this->data();
    }

    public function resendRejectionEmail(string $companyId): array
    {
        $id = $this->numericId($companyId);
        if (! $id) throw new \InvalidArgumentException('ID Perusahaan tidak valid.');

        $companyModel = new CompanyModel();
        $company = $companyModel->find($id);
        if (! $company) throw new \InvalidArgumentException('Data Perusahaan tidak ditemukan.');

        $userModel = new UserModel();
        $adminUser = $userModel->where('company_id', $id)->first();
        if (! $adminUser) throw new \InvalidArgumentException('User admin perusahaan tidak ditemukan.');

        $notes = $company['payment_notes'] ?: 'Pendaftaran tidak memenuhi verifikasi bukti pembayaran.';
        $hashKey = $this->generateResubmitHashKey($id, $adminUser['email']);

        $this->sendEmail('user_registration_rejected', [
            'company' => $company,
            'user' => $adminUser,
            'notes' => $notes,
            'hashKey' => $hashKey,
        ]);

        $this->recordAuditLog($id, null, 'RESEND_REJECTION_EMAIL', "Email penolakan & link perbaikan dikirim ulang ke {$adminUser['email']}.");

        return [
            'ok' => true,
            'message' => "Email penolakan & link perbaikan berhasil dikirim ulang ke {$adminUser['email']}.",
            'hashKey' => $hashKey,
            'resubmitUrl' => rtrim((string) (function_exists('config') ? config('App')->baseURL : 'http://localhost:8081/'), '/') . '/login?action=resubmit&token=' . $hashKey,
        ];
    }

    public function generateResubmitHashKey(int $companyId, string $email): string
    {
        $key = (string) (function_exists('env') ? env('encryption.key') : (getenv('encryption.key') ?: 'IF_SaaS_Secret_Key_2026_Resubmit!'));
        $payload = json_encode([
            'company_id' => $companyId,
            'email' => strtolower(trim($email)),
            'ts' => time(),
        ]);
        $iv = random_bytes(16);
        $ciphertext = openssl_encrypt($payload, 'aes-256-cbc', hash('sha256', $key, true), OPENSSL_RAW_DATA, $iv);
        $hmac = hash_hmac('sha256', $iv . $ciphertext, $key, true);
        return rtrim(strtr(base64_encode($iv . $hmac . $ciphertext), '+/', '-_'), '=');
    }

    public function decryptResubmitHashKey(string $hashKey): ?array
    {
        try {
            $key = (string) (function_exists('env') ? env('encryption.key') : (getenv('encryption.key') ?: 'IF_SaaS_Secret_Key_2026_Resubmit!'));
            $data = base64_decode(strtr($hashKey, '-_', '+/'));
            if (! $data || strlen($data) < 48) return null;

            $iv = substr($data, 0, 16);
            $hmac = substr($data, 16, 32);
            $ciphertext = substr($data, 48);

            $calcHmac = hash_hmac('sha256', $iv . $ciphertext, $key, true);
            if (! hash_equals($hmac, $calcHmac)) {
                return null;
            }

            $decrypted = openssl_decrypt($ciphertext, 'aes-256-cbc', hash('sha256', $key, true), OPENSSL_RAW_DATA, $iv);
            if (! $decrypted) return null;

            return json_decode($decrypted, true);
        } catch (\Throwable $e) {
            return null;
        }
    }

    public function getRegistrationResubmitData(string $hashKey): array
    {
        $payload = $this->decryptResubmitHashKey($hashKey);
        if (! $payload || empty($payload['company_id'])) {
            throw new \InvalidArgumentException('Token hash key perbaikan tidak valid atau telah mengalami manipulasi.');
        }

        $companyId = (int) $payload['company_id'];
        $db = Database::connect();
        $company = $db->table('companies')->where('id', $companyId)->get()->getRowArray();
        if (! $company) {
            throw new \InvalidArgumentException('Data pengajuan perusahaan tidak ditemukan.');
        }

        $cStatus = (string) ($company['status'] ?? '');
        $pStatus = (string) ($company['payment_status'] ?? '');
        if (! in_array($cStatus, ['90', 'rejected', '20'], true) && $pStatus !== '20') {
            throw new \InvalidArgumentException('Pengajuan perusahaan ini tidak dalam status ditolak.');
        }

        $adminUser = $db->table('users')->where('company_id', $companyId)->get()->getRowArray();

        // Fetch Rejection & Application Audit History Logs
        $logs = [];
        if ($db->tableExists('audit_logs')) {
            $logRows = $db->table('audit_logs')
                ->where('company_id', $companyId)
                ->orderBy('id', 'DESC')
                ->get()
                ->getResultArray();

            foreach ($logRows as $l) {
                $actionLabel = $l['action'];
                if ($l['action'] === 'REJECT_COMPANY_REGISTRATION') $actionLabel = '❌ Pendaftaran Ditolak';
                elseif ($l['action'] === 'PUBLIC_REGISTRATION_SUBMITTED') $actionLabel = '📝 Pengajuan Pendaftaran Mandiri';
                elseif (str_contains($l['action'], 'RESUBMITTED')) $actionLabel = '✏️ Perbaikan Pengajuan Dikirim';

                $logs[] = [
                    'id' => (int) $l['id'],
                    'action' => (string) $l['action'],
                    'actionLabel' => $actionLabel,
                    'details' => (string) ($l['details'] ?? ''),
                    'timestamp' => (string) ($l['created_at'] ?? ''),
                    'formattedTime' => ! empty($l['created_at']) ? date('d M Y, H:i', strtotime($l['created_at'])) . ' WIB' : '-',
                ];
            }
        }

        $rejectedAt = ! empty($company['updated_at']) ? date('d M Y, H:i', strtotime($company['updated_at'])) . ' WIB' : 'Baru Saja';
        $submittedAt = ! empty($company['created_at']) ? date('d M Y, H:i', strtotime($company['created_at'])) . ' WIB' : '-';

        return [
            'token' => $hashKey,
            'companyId' => $this->companyCode($companyId),
            'companyName' => $company['name'] ?? '',
            'adminName' => $adminUser['name'] ?? '',
            'adminEmail' => $adminUser['email'] ?? '',
            'subscriptionPlan' => $company['subscription_plan'] ?? 'Professional',
            'logoUrl' => $company['logo_path'] ?? '',
            'themeColor' => $company['theme_color'] ?? '#3B1F8C',
            'paymentProofUrl' => $company['payment_proof_path'] ?? '',
            'rejectionNotes' => $company['payment_notes'] ?? 'Persyaratan belum terpenuhi.',
            'rejectedAt' => $rejectedAt,
            'submittedAt' => $submittedAt,
            'historyLogs' => $logs,
        ];
    }

    public function submitRegistrationResubmit(array $payload): array
    {
        $hashKey = trim((string) ($payload['token'] ?? ''));
        $data = $this->decryptResubmitHashKey($hashKey);
        if (! $data || empty($data['company_id'])) {
            throw new \InvalidArgumentException('Token hash key perbaikan tidak valid.');
        }

        $companyId = (int) $data['company_id'];
        $companyModel = new CompanyModel();
        $company = $companyModel->find($companyId);
        if (! $company) {
            throw new \InvalidArgumentException('Data perusahaan tidak ditemukan.');
        }

        $userModel = new UserModel();
        $adminUser = $userModel->where('company_id', $companyId)->first();

        $companyName = trim((string) ($payload['name'] ?? $company['name']));
        $adminName = trim((string) ($payload['adminName'] ?? ($adminUser['name'] ?? '')));
        $planCode = trim((string) ($payload['subscriptionPlan'] ?? $company['subscription_plan']));
        $paymentProofUrl = trim((string) ($payload['paymentProofUrl'] ?? $company['payment_proof_path']));
        $logoUrl = trim((string) ($payload['logoUrl'] ?? $company['logo_path']));
        $themeColor = trim((string) ($payload['themeColor'] ?? $company['theme_color'])) ?: '#3B1F8C';

        if (! $companyName) throw new \InvalidArgumentException('Nama perusahaan wajib diisi.');
        if (! $paymentProofUrl) throw new \InvalidArgumentException('Bukti pembayaran wajib diunggah.');

        $saasPlans = $this->saasPlans();
        $selectedPlan = null;
        foreach ($saasPlans as $p) {
            if (strtolower($p['code']) === strtolower($planCode)) {
                $selectedPlan = $p;
                break;
            }
        }
        $durationDays = $selectedPlan['durationDays'] ?? 365;
        $maxOutlets = $selectedPlan['maxOutlets'] ?? 5;
        $expiresAt = $durationDays > 0 ? date('Y-m-d', strtotime("+{$durationDays} days")) : null;

        $db = Database::connect();
        $db->transStart();

        $companyModel->update($companyId, [
            'name' => $companyName,
            'brand_name' => $companyName,
            'logo_path' => $logoUrl,
            'theme_color' => $themeColor,
            'subscription_plan' => $planCode,
            'expires_at' => $expiresAt,
            'max_outlets' => $maxOutlets,
            'status' => '00', // Reset to Pending Approval
            'tenant_status' => 'NOT_CREATED',
            'payment_proof_path' => $paymentProofUrl,
            'payment_status' => '00', // Reset to Pending Verification
            'payment_notes' => 'Pendaftaran telah diperbaiki via link khusus token perbaikan. Menunggu persetujuan Super Admin.',
            'updated_at' => date('Y-m-d H:i:s'),
        ]);

        if ($adminUser) {
            $userModel->update($adminUser['id'], [
                'name' => $adminName ?: $adminUser['name'],
                'status' => '00', // Reset user status to Pending
                'updated_at' => date('Y-m-d H:i:s'),
            ]);
        }

        $this->recordAuditLog($companyId, $adminUser ? (int)$adminUser['id'] : null, 'PUBLIC_REGISTRATION_RESUBMITTED_HASHKEY', "Perbaikan pendaftaran perusahaan {$companyName} berhasil dikirim via hash key (PENDING_APPROVAL).");

        $db->transComplete();

        $updatedCompany = $companyModel->find($companyId);
        $updatedUser = $adminUser ? $userModel->find($adminUser['id']) : null;

        $this->sendEmail('user_registration_pending', [
            'company' => $updatedCompany,
            'user' => $updatedUser,
        ]);

        $this->sendEmail('admin_registration_notification', [
            'company' => $updatedCompany,
            'user' => $updatedUser,
        ]);

        return [
            'ok' => true,
            'message' => 'Perbaikan pendaftaran perusahaan Anda berhasil dikirim! Tim Super Admin akan memverifikasi ulang pengajuan Anda.',
            'companyId' => $this->companyCode($companyId),
        ];
    }

    public function recordAuditLog(?int $companyId, ?int $userId, string $action, ?string $details = null): void
    {
        try {
            $db = Database::connect();
            if ($db->tableExists('audit_logs')) {
                $db->table('audit_logs')->insert([
                    'company_id' => $companyId,
                    'user_id' => $userId,
                    'action' => $action,
                    'details' => $details,
                    'created_at' => date('Y-m-d H:i:s'),
                ]);
            }
        } catch (\Throwable $e) {
            log_message('error', 'Gagal mencatat audit log: ' . $e->getMessage());
        }
    }

    private function sendEmail(string $template, array $data): bool
    {
        try {
            $email = service('email');
            $fromEmail = (string) (env('email.fromEmail') ?: env('email.SMTPUser') ?: 'noreply@if-instrument.com');
            $fromName = (string) (env('email.fromName') ?: 'IF Instrument SaaS');

            $company = $data['company'] ?? [];
            $user = $data['user'] ?? [];
            $companyName = htmlspecialchars($company['name'] ?? 'Perusahaan', ENT_QUOTES, 'UTF-8');
            $userName = htmlspecialchars($user['name'] ?? 'Admin', ENT_QUOTES, 'UTF-8');
            $userEmail = $user['email'] ?? '';
            $baseUrl = rtrim((string) config('App')->baseURL, '/');

            if ($template === 'user_registration_pending' && $userEmail) {
                $email->setFrom($fromEmail, $fromName);
                $email->setTo($userEmail);
                $email->setSubject("Pendaftaran Perusahaan {$companyName} Berhasil Diterima");
                $email->setMessage(<<<HTML
<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.6">
  <div style="max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:8px;padding:24px;background:#ffffff">
    <h2 style="color:#3b1f8c;margin-top:0">Pendaftaran Diterima</h2>
    <p>Halo <strong>{$userName}</strong>,</p>
    <p>Pendaftaran perusahaan <strong>{$companyName}</strong> telah berhasil kami terima.</p>
    <div style="background:#f8fafc;padding:16px;border-radius:6px;border-left:4px solid #3b1f8c;margin:16px 0">
      <p style="margin:4px 0"><strong>Status Akun:</strong> PENDING_APPROVAL (Menunggu Verifikasi Admin)</p>
      <p style="margin:4px 0"><strong>Status Tenant:</strong> NOT_CREATED (Belum Dibuat)</p>
      <p style="margin:4px 0"><strong>Bukti Pembayaran:</strong> Dalam Pemeriksaan</p>
    </div>
    <p>Tim Super Admin kami sedang memeriksa berkas pendaftaran dan bukti pembayaran Anda. Anda akan menerima notifikasi email lanjutan setelah proses verifikasi selesai.</p>
    <p style="color:#64748b;font-size:13px">Catatan: Password dan akses login tenant belum dibuat pada tahap ini.</p>
  </div>
</body></html>
HTML);
                return (bool) @$email->send();
            }

            if ($template === 'admin_registration_notification') {
                $superAdminEmail = (string) (env('email.adminNotification') ?: env('email.fromEmail') ?: 'superadmin@central.com');
                $paymentProofUrl = htmlspecialchars($company['payment_proof_path'] ?? '-', ENT_QUOTES, 'UTF-8');
                $planName = htmlspecialchars($company['subscription_plan'] ?? 'Professional', ENT_QUOTES, 'UTF-8');
                $approvalUrl = $baseUrl . '/pages/users.html';

                $email->setFrom($fromEmail, $fromName);
                $email->setTo($superAdminEmail);
                $email->setSubject("🔔 Pendaftaran Perusahaan Baru: {$companyName}");
                $email->setMessage(<<<HTML
<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.6">
  <div style="max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:8px;padding:24px;background:#ffffff">
    <h2 style="color:#3b1f8c;margin-top:0">Pendaftaran Perusahaan Baru</h2>
    <p>Terdapat permohonan registrasi perusahaan baru yang memerlukan persetujuan Super Admin:</p>
    <ul>
      <li><strong>Nama Perusahaan:</strong> {$companyName}</li>
      <li><strong>Nama Administrator/PIC:</strong> {$userName}</li>
      <li><strong>Email:</strong> {$userEmail}</li>
      <li><strong>Paket Subscription:</strong> {$planName}</li>
      <li><strong>Bukti Pembayaran:</strong> <a href="{$paymentProofUrl}" target="_blank">Lihat Bukti Bayar</a></li>
    </ul>
    <p><a href="{$approvalUrl}" style="display:inline-block;padding:10px 18px;background:#3b1f8c;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold">Halaman Approval Admin</a></p>
  </div>
</body></html>
HTML);
                return (bool) @$email->send();
            }

            if ($template === 'user_registration_rejected' && $userEmail) {
                $notes = htmlspecialchars($data['notes'] ?? 'Persyaratan belum terpenuhi.', ENT_QUOTES, 'UTF-8');
                $hashKey = htmlspecialchars($data['hashKey'] ?? '', ENT_QUOTES, 'UTF-8');
                $resubmitUrl = $baseUrl . '/login?action=resubmit&token=' . $hashKey;

                $email->setFrom($fromEmail, $fromName);
                $email->setTo($userEmail);
                $email->setSubject("Pendaftaran Perusahaan {$companyName} Ditolak");
                $email->setMessage(<<<HTML
<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.6">
  <div style="max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:8px;padding:24px;background:#ffffff">
    <h2 style="color:#ef4444;margin-top:0">Pendaftaran Ditolak</h2>
    <p>Halo <strong>{$userName}</strong>,</p>
    <p>Mohon maaf, pendaftaran perusahaan <strong>{$companyName}</strong> belum dapat kami setujui saat ini.</p>
    <div style="background:#fef2f2;padding:16px;border-radius:6px;border-left:4px solid #ef4444;margin:16px 0">
      <p style="margin:0"><strong>Alasan Penolakan:</strong> {$notes}</p>
    </div>
    <p>Anda dapat melakukan perbaikan data atau mengunggah ulang bukti pembayaran melalui link khusus perbaikan di bawah ini:</p>
    <p style="text-align:center;margin:24px 0;">
      <a href="{$resubmitUrl}" style="display:inline-block;padding:12px 24px;background:#ef4444;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;">
        ✏️ Perbaiki Pengajuan Perusahaan
      </a>
    </p>
    <p style="color:#64748b;font-size:12px">Atau salin link berikut ke browser Anda:<br><a href="{$resubmitUrl}" style="color:#ef4444">{$resubmitUrl}</a></p>
  </div>
</body></html>
HTML);
                return (bool) @$email->send();
            }

            if ($template === 'user_registration_approved' && $userEmail) {
                $slug = htmlspecialchars($company['route_slug'] ?? '', ENT_QUOTES, 'UTF-8');
                $tempPassword = htmlspecialchars($data['tempPassword'] ?? '', ENT_QUOTES, 'UTF-8');
                $loginUrl = $baseUrl . '/' . $slug . '/login';

                $email->setFrom($fromEmail, $fromName);
                $email->setTo($userEmail);
                $email->setSubject("🎉 Selamat! Perusahaan {$companyName} Telah Aktif");
                $email->setMessage(<<<HTML
<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.6">
  <div style="max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:8px;padding:24px;background:#ffffff">
    <h2 style="color:#10b981;margin-top:0">Perusahaan & Tenant Berhasil Aktif</h2>
    <p>Halo <strong>{$userName}</strong>,</p>
    <p>Selamat! Pendaftaran perusahaan <strong>{$companyName}</strong> telah disetujui dan tenant database Anda telah berhasil dibuat.</p>
    <div style="background:#f0fdf4;padding:16px;border-radius:6px;border-left:4px solid #10b981;margin:16px 0">
      <p style="margin:4px 0"><strong>URL Login:</strong> <a href="{$loginUrl}">{$loginUrl}</a></p>
      <p style="margin:4px 0"><strong>Slug Company:</strong> {$slug}</p>
      <p style="margin:4px 0"><strong>Username / Email:</strong> {$userEmail}</p>
      <p style="margin:4px 0"><strong>Temporary Password:</strong> <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px">{$tempPassword}</code></p>
    </div>
    <p style="color:#dc2626;font-weight:bold">⚠️ PENTING: Anda diwajibkan untuk langsung mengganti password sementara ini saat pertama kali melakukan login.</p>
    <p><a href="{$loginUrl}" style="display:inline-block;padding:10px 18px;background:#10b981;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold">Login ke Perusahaan</a></p>
  </div>
</body></html>
HTML);
                return (bool) @$email->send();
            }

            if ($template === 'user_forgot_password' && $userEmail) {
                $slug = htmlspecialchars($company['route_slug'] ?? '', ENT_QUOTES, 'UTF-8');
                $tempPassword = htmlspecialchars($data['tempPassword'] ?? '', ENT_QUOTES, 'UTF-8');
                $loginUrl = $slug ? ($baseUrl . '/' . $slug . '/login') : ($baseUrl . '/login');

                $email->setFrom($fromEmail, $fromName);
                $email->setTo($userEmail);
                $email->setSubject("🔑 Password Sementara Akun Anda - IF Instrument");
                $email->setMessage(<<<HTML
<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.6">
  <div style="max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:8px;padding:24px;background:#ffffff">
    <h2 style="color:#3b1f8c;margin-top:0">Permintaan Reset Password</h2>
    <p>Halo <strong>{$userName}</strong>,</p>
    <p>Kami menerima permintaan untuk mereset password akun Anda. Password sementara baru Anda telah berhasil dibuat.</p>
    <div style="background:#f8fafc;padding:16px;border-radius:6px;border-left:4px solid #3b1f8c;margin:16px 0">
      <p style="margin:4px 0"><strong>URL Login:</strong> <a href="{$loginUrl}">{$loginUrl}</a></p>
      <p style="margin:4px 0"><strong>Email Akun:</strong> {$userEmail}</p>
      <p style="margin:4px 0"><strong>Password Sementara:</strong> <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px">{$tempPassword}</code></p>
    </div>
    <p style="color:#dc2626;font-weight:bold">⚠️ PENTING: Saat pertama kali login menggunakan password sementara ini, Anda akan secara otomatis diminta untuk membuat password baru yang aman.</p>
    <p><a href="{$loginUrl}" style="display:inline-block;padding:10px 18px;background:#3b1f8c;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold">Login Sekarang</a></p>
  </div>
</body></html>
HTML);
                return (bool) @$email->send();
            }

            return false;
        } catch (\Throwable $e) {
            log_message('error', 'Gagal mengirim email: ' . $e->getMessage());
            return false;
        }
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

    private function generateUniqueCompanySlug(string $name, int $companyId = 0): string
    {
        $baseSlug = strtolower($this->slugify($name)) ?: 'company';
        $reserved = ['api', 'assets', 'pages', 'scripts', 'uploads', 'sales', 'products', 'inventory', 'reports', 'admin', 'invitation', 'login', 'login.html', 'index.html'];

        $candidate = $baseSlug;
        $counter = 1;

        while (true) {
            $isReserved = in_array($candidate, $reserved, true);
            $builder = Database::connect()->table('companies')->where('route_slug', $candidate);
            if ($companyId > 0) {
                $builder->where('id !=', $companyId);
            }
            $exists = $builder->countAllResults() > 0;

            if (! $isReserved && ! $exists) {
                return $candidate;
            }

            $candidate = $baseSlug . '-' . $counter;
            $counter++;
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

    public function centralPaymentAccounts(): array
    {
        try {
            $db = Database::connect();
            if (! $db->tableExists('central_payment_accounts')) {
                return [];
            }
            $rows = $db->table('central_payment_accounts')
                ->whereIn('status', [StatusCodeService::ACTIVE, 'active', '10'])
                ->orderBy('id')
                ->get()
                ->getResultArray();

            return array_map(fn ($row) => [
                'id' => (int) $row['id'],
                'bankName' => $row['bank_name'] ?? '',
                'accountNumber' => $row['account_number'] ?? '',
                'accountHolder' => $row['account_holder'] ?? '',
                'notes' => $row['notes'] ?? '',
                'qrisImageUrl' => $row['qris_image_url'] ?? '',
                'status' => StatusCodeService::common($row['status'] ?? ''),
            ], $rows);
        } catch (\Throwable $exception) {
            return [];
        }
    }

    public function saveCentralPaymentAccount(array $payload): array
    {
        $db = Database::connect();
        if (! $db->tableExists('central_payment_accounts')) {
            throw new \RuntimeException('Tabel central_payment_accounts belum ada.');
        }

        $bankName = trim((string) ($payload['bankName'] ?? ''));
        $accountNumber = trim((string) ($payload['accountNumber'] ?? ''));
        $accountHolder = trim((string) ($payload['accountHolder'] ?? ''));
        $notes = trim((string) ($payload['notes'] ?? ''));
        $qrisImageUrl = trim((string) ($payload['qrisImageUrl'] ?? $payload['qris_image_url'] ?? ''));
        $status = StatusCodeService::common($payload['status'] ?? 'active');

        if (! $bankName || ! $accountNumber || ! $accountHolder) {
            throw new \InvalidArgumentException('Nama Bank, Nomor Rekening, dan Nama Pemilik wajib diisi.');
        }

        $row = [
            'bank_name' => $bankName,
            'account_number' => $accountNumber,
            'account_holder' => $accountHolder,
            'notes' => $notes,
            'qris_image_url' => $qrisImageUrl,
            'status' => $status,
            'updated_at' => date('Y-m-d H:i:s'),
        ];

        $id = (int) ($payload['id'] ?? 0);
        if ($id > 0) {
            $db->table('central_payment_accounts')->where('id', $id)->update($row);
        } else {
            $row['created_at'] = date('Y-m-d H:i:s');
            $db->table('central_payment_accounts')->insert($row);
        }

        return $this->centralPaymentAccounts();
    }

    public function deactivateCentralPaymentAccount(string $id): array
    {
        $db = Database::connect();
        if ($db->tableExists('central_payment_accounts')) {
            $db->table('central_payment_accounts')->where('id', (int) $id)->update([
                'status' => StatusCodeService::INACTIVE,
                'updated_at' => date('Y-m-d H:i:s'),
            ]);
        }
        return $this->centralPaymentAccounts();
    }
}
