<?php

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Services\CrmService;

class CrmController extends BaseController
{
    private CrmService $crm;

    public function __construct()
    {
        $this->crm = new CrmService();
    }

    public function listCustomers()
    {
        [$companyId, $outletId] = $this->scope();
        return $this->response->setJSON([
            'ok' => true,
            'data' => $this->crm->customerPage($companyId, $outletId, $this->request->getGet()),
        ]);
    }

    public function listTransactions()
    {
        [$companyId, $outletId] = $this->scope();
        return $this->response->setJSON([
            'ok' => true,
            'data' => $this->crm->transactionPage($companyId, $outletId, $this->request->getGet()),
        ]);
    }

    public function getCustomer(string $id)
    {
        [$companyId, $outletId] = $this->scope();
        return $this->jsonAction(fn () => $this->crm->customerDetail($id, $companyId, $outletId));
    }

    public function customer()
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->crm->saveCustomer($payload, $companyId, $outletId));
    }

    public function updateCustomer(string $id)
    {
        $payload = ['id' => $id] + $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->crm->saveCustomer($payload, $companyId, $outletId));
    }

    public function deleteCustomer(string $id)
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->crm->deactivateCustomer($id, $companyId, $outletId));
    }

    private function payload(): array
    {
        return $this->request->getJSON(true) ?: [];
    }

    private function scope(array $payload = []): array
    {
        return [
            (int) ($payload['company_id'] ?? $this->request->getGet('company_id') ?? 1),
            (int) ($payload['outlet_id'] ?? $this->request->getGet('outlet_id') ?? 1),
        ];
    }

    private function jsonAction(callable $action)
    {
        try {
            return $this->response->setJSON(['ok' => true, 'data' => $action()]);
        } catch (\Throwable $exception) {
            return $this->response
                ->setStatusCode(422)
                ->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }
}
