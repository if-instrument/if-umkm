<?php

namespace App\Services\Api;

use App\Services\AccessManagementService;

class AccessApiService
{
    public function pageData(int $companyId = 0, bool $superAdmin = false): array
    {
        $data = (new AccessManagementService())->data();
        if ($superAdmin) {
            $db = \Config\Database::connect();
            $centralGateways = [];
            if ($db->tableExists('payment_gateways')) {
                $rows = $db->table('payment_gateways')->get()->getResultArray();
                foreach ($rows as $row) {
                    $centralGateways[$row['provider']] = [
                        'status' => ($row['status'] ?? 'active') === 'active' ? 'active' : 'inactive',
                        'apiKey' => (string) ($row['api_key'] ?? ''),
                        'apiKeySet' => trim((string) ($row['api_key'] ?? '')) !== '',
                        'qrisRate' => (float) ($row['qris_rate'] ?? 0.7),
                        'cardRate' => (float) ($row['card_rate'] ?? 2.0),
                        'vaFee' => (float) ($row['va_fee'] ?? 4000),
                        'ewalletRate' => (float) ($row['ewallet_rate'] ?? 1.5),
                    ];
                }
            }

            $xenditMaster = $centralGateways['xendit'] ?? [
                'status' => 'active', 'apiKey' => '', 'apiKeySet' => false, 'qrisRate' => 0.7, 'cardRate' => 2.0, 'vaFee' => 4500, 'ewalletRate' => 1.5,
            ];
            $midtransMaster = $centralGateways['midtrans'] ?? [
                'status' => 'active', 'apiKey' => '', 'apiKeySet' => false, 'qrisRate' => 0.7, 'cardRate' => 1.9, 'vaFee' => 4000, 'ewalletRate' => 1.7,
            ];

            return [
                'activeCompanyId' => $data['companies'][0]['id'] ?? 'company-main',
                'companies' => $data['companies'] ?? [],
                'outlets' => [],
                'companyRoles' => [],
                'users' => [],
                'centralPaymentGateway' => [
                    'centralMasterGateway' => [
                        'xendit' => $xenditMaster,
                        'midtrans' => $midtransMaster,
                    ],
                ],
            ];
        }

        $companyCode = $companyId <= 1 ? 'company-main' : 'company-' . $companyId;

        return [
            'activeCompanyId' => $companyCode,
            'companies' => array_values(array_filter($data['companies'] ?? [], fn ($row) => ($row['id'] ?? '') === $companyCode)),
            'outlets' => array_values(array_filter($data['outlets'] ?? [], fn ($row) => ($row['companyId'] ?? '') === $companyCode)),
            'companyRoles' => array_values(array_filter($data['companyRoles'] ?? [], fn ($row) => ($row['companyId'] ?? '') === $companyCode)),
            'users' => array_values(array_filter($data['users'] ?? [], fn ($row) => ($row['companyId'] ?? '') === $companyCode)),
        ];
    }
}
