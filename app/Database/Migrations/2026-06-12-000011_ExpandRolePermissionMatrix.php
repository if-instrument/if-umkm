<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class ExpandRolePermissionMatrix extends Migration
{
    public function up(): void
    {
        if (! $this->db->tableExists('roles') || ! $this->db->fieldExists('permission_matrix', 'roles')) {
            return;
        }

        $roles = $this->db->table('roles')->select('id, permissions')->get()->getResultArray();
        foreach ($roles as $role) {
            $permissions = json_decode($role['permissions'] ?: '[]', true) ?: [];
            $this->db->table('roles')
                ->where('id', $role['id'])
                ->update(['permission_matrix' => json_encode($this->matrixFromLegacy($permissions))]);
        }
    }

    public function down(): void
    {
        if (! $this->db->tableExists('roles') || ! $this->db->fieldExists('permission_matrix', 'roles')) {
            return;
        }

        $roles = $this->db->table('roles')->select('id, permissions')->get()->getResultArray();
        foreach ($roles as $role) {
            $permissions = json_decode($role['permissions'] ?: '[]', true) ?: [];
            $this->db->table('roles')
                ->where('id', $role['id'])
                ->update(['permission_matrix' => json_encode($this->legacyMatrixFromPermissions($permissions))]);
        }
    }

    private function matrixFromLegacy(array $permissions): array
    {
        $legacy = array_flip($permissions);
        $matrix = [];
        foreach ($this->expandedModules() as $module => $permission) {
            $enabled = isset($legacy[$permission]) || isset($legacy[$module]);
            $matrix[$module] = [
                'create' => $enabled,
                'read' => $enabled,
                'update' => $enabled,
                'delete' => $enabled,
            ];
        }
        return $matrix;
    }

    private function legacyMatrixFromPermissions(array $permissions): array
    {
        $legacy = array_flip($permissions);
        $matrix = [];
        foreach ($this->legacyModules() as $module => $permission) {
            $enabled = isset($legacy[$permission]) || isset($legacy[$module]);
            $matrix[$module] = [
                'create' => $enabled,
                'read' => $enabled,
                'update' => $enabled,
                'delete' => $enabled,
            ];
        }
        return $matrix;
    }

    private function expandedModules(): array
    {
        return [
            'dashboard.overview' => 'operations',
            'dashboard.recommendations' => 'operations',
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
    }

    private function legacyModules(): array
    {
        return [
            'dashboard' => 'operations',
            'pos' => 'pos',
            'queue' => 'kitchen',
            'categories' => 'operations',
            'products' => 'operations',
            'modifiers' => 'operations',
            'recipes' => 'operations',
            'ingredientMapping' => 'operations',
            'inventory' => 'inventory',
            'purchase' => 'inventory',
            'stockMovement' => 'inventory',
            'reports' => 'reports',
            'settings' => 'settings',
            'company' => 'company',
            'outlets' => 'outlet',
            'users' => 'user',
            'roles' => 'role',
        ];
    }
}
