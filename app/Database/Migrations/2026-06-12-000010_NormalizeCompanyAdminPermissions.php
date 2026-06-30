<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class NormalizeCompanyAdminPermissions extends Migration
{
    public function up(): void
    {
        if (! $this->db->tableExists('roles') || ! $this->db->fieldExists('permission_matrix', 'roles')) {
            return;
        }

        $permissions = ['company', 'outlet', 'user', 'role', 'operations', 'pos', 'kitchen', 'inventory', 'reports', 'settings'];
        $this->db->table('roles')
            ->where('name', 'Company Admin')
            ->update([
                'permissions' => json_encode($permissions),
                'permission_matrix' => json_encode($this->matrixFromLegacy($permissions)),
            ]);
    }

    public function down(): void
    {
        if (! $this->db->tableExists('roles') || ! $this->db->fieldExists('permission_matrix', 'roles')) {
            return;
        }

        $permissions = ['company', 'outlet', 'user', 'role', 'operations', 'reports', 'settings'];
        $this->db->table('roles')
            ->where('name', 'Company Admin')
            ->update([
                'permissions' => json_encode($permissions),
                'permission_matrix' => json_encode($this->matrixFromLegacy($permissions)),
            ]);
    }

    private function matrixFromLegacy(array $permissions): array
    {
        $modules = [
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

        $legacy = array_flip($permissions);
        $matrix = [];
        foreach ($modules as $module => $permission) {
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
}
