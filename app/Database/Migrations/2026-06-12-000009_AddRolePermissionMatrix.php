<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddRolePermissionMatrix extends Migration
{
    public function up(): void
    {
        if (! $this->db->fieldExists('permission_matrix', 'roles')) {
            $this->forge->addColumn('roles', [
                'permission_matrix' => [
                    'type' => 'JSON',
                    'null' => true,
                    'after' => 'permissions',
                ],
            ]);
        }

        $this->backfillPermissionMatrix();
    }

    public function down(): void
    {
        if ($this->db->fieldExists('permission_matrix', 'roles')) {
            $this->forge->dropColumn('roles', 'permission_matrix');
        }
    }

    private function backfillPermissionMatrix(): void
    {
        $rows = $this->db->table('roles')
            ->select('id, permissions, permission_matrix')
            ->get()
            ->getResultArray();

        foreach ($rows as $row) {
            if (! empty($row['permission_matrix'])) {
                continue;
            }

            $permissions = json_decode($row['permissions'] ?: '[]', true) ?: [];
            $this->db->table('roles')
                ->where('id', $row['id'])
                ->update(['permission_matrix' => json_encode($this->matrixFromLegacy($permissions))]);
        }
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
