<?php

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Services\DashboardService;
use App\Services\StatusCodeService;
use Config\Database;

class DashboardController extends BaseController
{
    public function show()
    {
        $claims = (array) (service('request')->jwt ?? []);
        $companyId = $this->companyId($claims, (int) ($this->request->getGet('company_id') ?: 1));
        $outletId = $this->outletId($claims, $companyId, (int) ($this->request->getGet('outlet_id') ?: 1));

        return $this->response->setJSON([
            'ok' => true,
            'data' => (new DashboardService())->summary($companyId, $outletId),
        ]);
    }

    private function companyId(array $claims, int $requested): int
    {
        if (($claims['authType'] ?? '') === 'super_admin') return $requested;
        $value = $claims['companyId'] ?? null;
        if (is_numeric($value)) return (int) $value;
        if ($value === 'company-main') return 1;
        return preg_match('/(\d+)$/', (string) $value, $matches) ? (int) $matches[1] : $requested;
    }

    private function outletId(array $claims, int $companyId, int $requested): int
    {
        $db = Database::connect();
        $belongsToCompany = function (int $id) use ($db, $companyId): bool {
            $builder = $db->table('outlets')->where('id', $id)->whereNotIn('status', [StatusCodeService::INACTIVE, 'inactive']);
            if ($db->fieldExists('company_id', 'outlets')) {
                $builder->where('company_id', $companyId);
            }
            return $builder->countAllResults() > 0;
        };
        if (($claims['authType'] ?? '') === 'company_admin') {
            if ($belongsToCompany($requested)) return $requested;
            $fallback = $db->table('outlets')->select('id')->whereNotIn('status', [StatusCodeService::INACTIVE, 'inactive'])->orderBy('id');
            if ($db->fieldExists('company_id', 'outlets')) {
                $fallback->where('company_id', $companyId);
            }
            return (int) ($fallback->get()->getRowArray()['id'] ?? -1);
        }

        $userId = (int) ($claims['sub'] ?? 0);
        $role = $db->table('user_roles ur')->select('r.scope')->join('roles r', 'r.id = ur.role_id', 'left')->where('ur.user_id', $userId)->get()->getRowArray();
        if (($role['scope'] ?? '') === 'all' && $belongsToCompany($requested)) return $requested;
        $assigned = $db->table('user_outlets uo')->select('uo.outlet_id')->join('outlets o', 'o.id = uo.outlet_id', 'inner')
            ->where('uo.user_id', $userId)->whereNotIn('o.status', [StatusCodeService::INACTIVE, 'inactive'])->orderBy('uo.outlet_id');
        if ($db->fieldExists('company_id', 'outlets')) {
            $assigned->where('o.company_id', $companyId);
        }
        $assigned = $assigned->get()->getResultArray();
        $ids = array_map(fn ($row) => (int) $row['outlet_id'], $assigned);
        return in_array($requested, $ids, true) ? $requested : ($ids[0] ?? -1);
    }
}
