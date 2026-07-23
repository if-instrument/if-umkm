<?php

namespace App\Filters;

use App\Services\JwtService;
use App\Services\TenantDatabaseService;
use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;
use Config\Database;

class JwtAuthFilter implements FilterInterface
{
    public function before(RequestInterface $request, $arguments = null)
    {
        $header = $request->getHeaderLine('Authorization');
        if (! preg_match('/^Bearer\s+(.+)$/i', $header, $matches)) {
            return service('response')->setStatusCode(401)->setJSON([
                'ok' => false,
                'message' => 'Token API wajib dikirim.',
            ]);
        }

        $claims = (new JwtService())->verify($matches[1]);
        if (! $claims) {
            return service('response')->setStatusCode(401)->setJSON([
                'ok' => false,
                'message' => 'Token API tidak valid atau sudah kedaluwarsa.',
            ]);
        }

        (new TenantDatabaseService())->activateForClaims($claims);

        if (! $this->claimsStillValid($claims)) {
            return service('response')->setStatusCode(401)->setJSON([
                'ok' => false,
                'message' => 'Session sudah tidak berlaku. Silakan login ulang.',
            ]);
        }

        $permissionOptions = $this->permissionOptions($request);
        if ($permissionOptions && ! $this->hasAnyPermission($claims, $permissionOptions)) {
            return service('response')->setStatusCode(403)->setJSON([
                'ok' => false,
                'message' => 'Anda tidak punya permission untuk aksi API ini.',
            ]);
        }

        service('request')->jwt = $claims;
    }

    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
    }

    private function permissionOptions(RequestInterface $request): array
    {
        $method = strtolower($request->getMethod());
        $path = trim($request->getUri()->getPath(), '/');
        $path = preg_replace('#^.+?/api/#', 'api/', $path) ?: $path;
        $apiPath = str_starts_with($path, 'api/') ? substr($path, 4) : $path;

        if ($method === 'get') {
            if ($apiPath === 'page/pos/bootstrap') return [['pos.transaction', 'read'], ['pos.transaction', 'create']];
            if ($apiPath === 'page/settings/bootstrap') return [['settings.outlet', 'read'], ['settings.payment', 'read'], ['settings.tables', 'read'], ['settings.packaging', 'read'], ['settings.costing', 'read'], ['company.branding', 'read']];
            if ($apiPath === 'page/users/bootstrap') return [['users.manage', 'read'], ['roles.manage', 'read'], ['outlets.manage', 'read'], ['admin.companies', 'read']];
            if ($apiPath === 'page/products/bootstrap') return [['categories.manage', 'read'], ['products.catalog', 'read'], ['modifiers.master', 'read'], ['recipes.template', 'read'], ['recipes.outletMapping', 'read'], ['ingredients.template', 'read']];
            if ($apiPath === 'dashboard') return [['dashboard.overview', 'read']];
            if ($apiPath === 'onboarding') return [['company.branding', 'read'], ['outlets.manage', 'read']];
            if (str_starts_with($apiPath, 'reports/')) return [['reports.profitLoss', 'read'], ['reports.sales', 'read'], ['reports.inventoryLoss', 'read']];
            if (str_starts_with($apiPath, 'finance/expense')) return [['reports.operatingExpenses', 'read']];
            if (str_starts_with($apiPath, 'order')) return [['pos.transaction', 'read'], ['queue.kitchen', 'read'], ['queue.cashier', 'read']];
            if ($apiPath === 'payment-gateway-log') return [['settings.payment', 'read']];
            if (str_starts_with($apiPath, 'payment-transaction')) return [['pos.payment', 'read'], ['pos.transaction', 'read']];
            if ($apiPath === 'setting') return [['settings.outlet', 'read'], ['settings.costing', 'read'], ['pos.transaction', 'read'], ['pos.transaction', 'create']];
            if ($apiPath === 'printer') return [['settings.outlet', 'read'], ['settings.outlet', 'update']];
            if (str_starts_with($apiPath, 'dining-table')) return [['settings.tables', 'read'], ['pos.transaction', 'read'], ['pos.payment', 'read']];
            if (str_starts_with($apiPath, 'payment-method')) return [['settings.payment', 'read'], ['pos.transaction', 'read'], ['pos.payment', 'read']];
            if (str_starts_with($apiPath, 'packaging-rule')) return [['settings.packaging', 'read'], ['pos.transaction', 'read'], ['pos.transaction', 'create']];
            if (str_starts_with($apiPath, 'ingredient-template')) return [['recipes.template', 'read'], ['modifiers.ingredientTemplate', 'read'], ['inventory.ingredients', 'read']];
            if (str_starts_with($apiPath, 'ingredient')) return [['inventory.ingredients', 'read'], ['pos.transaction', 'read'], ['pos.transaction', 'create'], ['recipes.outletMapping', 'read'], ['modifiers.ingredientTemplate', 'read']];
            if (str_starts_with($apiPath, 'stock-movement')) return [['inventory.movement', 'read'], ['inventory.purchase', 'read'], ['inventory.waste', 'read'], ['reports.inventoryLoss', 'read']];
            if (str_starts_with($apiPath, 'category')) return [['categories.manage', 'read'], ['products.catalog', 'read'], ['pos.transaction', 'read'], ['pos.transaction', 'create']];
            if (str_starts_with($apiPath, 'product')) return [['products.catalog', 'read'], ['recipes.template', 'read'], ['inventory.overview', 'read'], ['pos.transaction', 'read'], ['pos.transaction', 'create']];
            if (str_starts_with($apiPath, 'modifier')) return [['modifiers.master', 'read'], ['recipes.template', 'read'], ['pos.transaction', 'read'], ['pos.transaction', 'create']];
            if (str_starts_with($apiPath, 'recipe')) return [['recipes.template', 'read']];
            if (str_starts_with($apiPath, 'user')) return [['users.manage', 'read']];
            return [];
        }

        if ($apiPath === 'payment-method-qris-image') return [['settings.payment', 'create'], ['settings.payment', 'update']];
        if ($apiPath === 'company-logo' || $apiPath === 'product-image') {
            return $apiPath === 'company-logo' ? [['company.branding', 'update'], ['admin.companies', 'update']] : [['products.catalog', 'create'], ['products.catalog', 'update']];
        }
        if (preg_match('#^company/[^/]+/invite-admin$#', $apiPath)) return [['admin.companies', 'update']];
        if (preg_match('#^user/[^/]+/invite$#', $apiPath)) return [['users.manage', 'create']];
        if (preg_match('#^company(?:/[^/]+)?$#', $apiPath)) return $method === 'post' ? [['admin.companies', 'create']] : ($method === 'delete' ? [['admin.companies', 'delete']] : [['company.branding', 'update'], ['admin.companies', 'update']]);
        if (preg_match('#^outlet(?:/[^/]+)?$#', $apiPath)) return [[$method === 'post' ? 'outlets.manage' : 'outlets.manage', $this->crudAction($method)]];
        if (preg_match('#^role(?:/[^/]+)?$#', $apiPath)) return [['roles.manage', $this->crudAction($method)]];
        if (preg_match('#^user(?:/[^/]+)?$#', $apiPath)) return [['users.manage', $this->crudAction($method)]];
        if ($apiPath === 'setting') return [['settings.outlet', 'update'], ['settings.costing', 'update'], ['settings.tables', 'update']];
        if (preg_match('#^dining-table(?:/[^/]+)?$#', $apiPath)) return [['settings.tables', $this->crudAction($method)]];
        if (preg_match('#^payment-method(?:/[^/]+)?$#', $apiPath)) return [['settings.payment', $this->crudAction($method)]];
        if (preg_match('#^packaging-rule(?:/[^/]+)?$#', $apiPath)) return [['settings.packaging', $this->crudAction($method)]];
        if (preg_match('#^finance/expense(?:/[^/]+)?$#', $apiPath)) return [['reports.operatingExpenses', $this->crudAction($method)]];
        if (preg_match('#^ingredient-template(?:/[^/]+)?$#', $apiPath)) return [['recipes.template', $this->crudAction($method)], ['modifiers.ingredientTemplate', $this->crudAction($method)]];
        if (preg_match('#^ingredient(?:/[^/]+)?$#', $apiPath)) return [['inventory.ingredients', $this->crudAction($method)]];
        if ($apiPath === 'ingredient-mapping') return [['recipes.outletMapping', 'update'], ['modifiers.ingredientTemplate', 'update']];
        if ($apiPath === 'purchase') return [['inventory.purchase', 'create']];
        if ($apiPath === 'inventory-loss') return [['inventory.waste', 'create']];
        if (preg_match('#^category(?:/[^/]+)?$#', $apiPath)) return [['categories.manage', $this->crudAction($method)]];
        if ($apiPath === 'product-modifier') return [['recipes.template', 'update']];
        if (preg_match('#^product/[^/]+/price$#', $apiPath)) return [['products.outletPrice', 'update']];
        if (preg_match('#^product/[^/]+/category$#', $apiPath)) return [['products.catalog', 'update']];
        if (preg_match('#^product/[^/]+/produce$#', $apiPath)) return [['products.catalog', 'update']];
        if (preg_match('#^product-batch/[^/]+/loss$#', $apiPath)) return [['inventory.waste', 'create'], ['inventory.ingredients', 'update']];
        if (preg_match('#^product(?:/[^/]+)?$#', $apiPath)) return [['products.catalog', $this->crudAction($method)]];
        if (preg_match('#^modifier/[^/]+/option-price$#', $apiPath)) return [['modifiers.outletPrice', 'update']];
        if (preg_match('#^modifier(?:/[^/]+)?$#', $apiPath)) return [['modifiers.master', $this->crudAction($method)]];
        if ($apiPath === 'recipe') return [['recipes.template', 'create'], ['recipes.template', 'update']];
        if ($apiPath === 'order') return [['pos.transaction', 'create']];
        if ($apiPath === 'payment-transaction') return [['pos.payment', 'create'], ['pos.transaction', 'create']];
        if (preg_match('#^payment-transaction/[^/]+/(confirm|cancel)$#', $apiPath)) return [['pos.payment', 'create']];
        if (preg_match('#^order/[^/]+/status$#', $apiPath)) {
            $payload = (array) ($request->getJSON(true) ?: []);
            $st = $payload['status'] ?? '';
            if (in_array($st, ['20', '30', 'preparing', 'ready'], true)) {
                return [['queue.kitchen', 'update']];
            }
            if (in_array($st, ['90', 'completed'], true)) {
                return [['queue.cashier', 'update']];
            }
            return [['queue.kitchen', 'update'], ['queue.cashier', 'update']];
        }
        if (preg_match('#^order/[^/]+/ready-items$#', $apiPath)) return [['queue.kitchen', 'update']];
        if (preg_match('#^order/[^/]+/settle$#', $apiPath)) return [['pos.payment', 'create']];
        if (preg_match('#^order/[^/]+/move-table$#', $apiPath)) return [['pos.orderEdit', 'update']];
        if (preg_match('#^order/[^/]+$#', $apiPath)) return [['pos.orderEdit', 'update'], ['pos.transaction', 'create']];

        return [];
    }

    private function claimsStillValid(array $claims): bool
    {
        $db = Database::connect();
        if (! $db->tableExists('users')) {
            return false;
        }

        $userId = (int) ($claims['sub'] ?? 0);
        $email = strtolower((string) ($claims['email'] ?? ''));
        if ($userId <= 0 || $email === '') {
            return false;
        }

        $user = $db->table('users')
            ->where('id', $userId)
            ->where('email', $email)
            ->whereIn('status', [\App\Services\StatusCodeService::ACTIVE, 'active'])
            ->get()
            ->getRowArray();
        if (! $user) {
            return false;
        }

        $authType = (string) ($claims['authType'] ?? '');
        if (($user['type'] ?? '') !== $authType) {
            return false;
        }

        $issuedAt = (int) ($claims['iat'] ?? 0);
        $userUpdatedAt = strtotime((string) ($user['updated_at'] ?? '')) ?: 0;
        if ($userUpdatedAt > 0 && $issuedAt > 0 && $issuedAt < ($userUpdatedAt - 1)) {
            return false;
        }

        if ($authType === 'super_admin') {
            return empty($user['company_id'] ?? null);
        }

        $tenant = (array) (service('request')->tenant ?? []);
        if (! empty($tenant)) {
            return true;
        }

        if (! $db->fieldExists('company_id', 'users')) {
            return true;
        }

        return ! empty($user['company_id']);
    }

    private function crudAction(string $method): string
    {
        switch ($method) {
            case 'post':
                return 'create';
            case 'put':
            case 'patch':
                return 'update';
            case 'delete':
                return 'delete';
            default:
                return 'read';
        }
    }

    private function hasAnyPermission(array $claims, array $permissionOptions): bool
    {
        $authType = $claims['authType'] ?? '';
        if ($authType === 'company_admin') return true;

        foreach ($permissionOptions as [$module, $action]) {
            if ($authType === 'super_admin' && $module === 'admin.companies') return true;
            if (($claims['permissionMatrix'][$module][$action] ?? false) === true) return true;
            if ($this->legacyPermissionAllows($claims['permissions'] ?? [], $module)) return true;
        }

        return false;
    }

    private function legacyPermissionAllows(array $permissions, string $module): bool
    {
        $legacyMap = [
            'dashboard.overview' => 'operations',
            'pos.transaction' => 'pos',
            'pos.orderEdit' => 'pos',
            'pos.payment' => 'pos',
            'queue.kitchen' => 'kitchen',
            'queue.cashier' => 'pos',
            'categories.manage' => 'operations',
            'products.catalog' => 'operations',
            'products.outletPrice' => 'operations',
            'recipes.template' => 'operations',
            'recipes.outletMapping' => 'operations',
            'modifiers.master' => 'operations',
            'modifiers.options' => 'operations',
            'modifiers.outletPrice' => 'operations',
            'modifiers.ingredientTemplate' => 'operations',
            'inventory.overview' => 'inventory',
            'inventory.ingredients' => 'inventory',
            'inventory.purchase' => 'inventory',
            'inventory.movement' => 'inventory',
            'inventory.waste' => 'inventory',
            'reports.profitLoss' => 'reports',
            'reports.operatingExpenses' => 'reports',
            'reports.sales' => 'reports',
            'reports.inventoryLoss' => 'reports',
            'settings.outlet' => 'settings',
            'settings.payment' => 'settings',
            'settings.tables' => 'settings',
            'settings.packaging' => 'settings',
            'settings.costing' => 'settings',
            'company.branding' => 'company',
            'outlets.manage' => 'outlet',
            'users.manage' => 'user',
            'roles.manage' => 'role',
        ];

        return in_array($legacyMap[$module] ?? '', $permissions, true);
    }
}
