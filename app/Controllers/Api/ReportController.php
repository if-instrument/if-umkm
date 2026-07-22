<?php

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Services\ProfitLossService;

class ReportController extends BaseController
{
    private ProfitLossService $profitLoss;

    public function __construct(?ProfitLossService $profitLoss = null)
    {
        $this->profitLoss = $profitLoss ?? service('profitLossService');
    }

    public function profitLoss()
    {
        try {
            [$companyId, $outletId] = $this->scope();
            return $this->response->setJSON([
                'ok' => true,
                'data' => $this->profitLoss->report([
                    'company_id' => $companyId,
                    'outlet_id' => $outletId,
                    'period' => $this->request->getGet('period') ?: 'daily',
                    'anchor_date' => $this->request->getGet('anchor_date') ?: date('Y-m-d'),
                ]),
            ]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    public function listOperatingExpenses()
    {
        try {
            [$companyId, $outletId] = $this->scope();
            return $this->response->setJSON([
                'ok' => true,
                'data' => $this->profitLoss->expensePage([
                    'company_id' => $companyId,
                    'outlet_id' => $outletId,
                    'period' => $this->request->getGet('period') ?: 'daily',
                    'anchor_date' => $this->request->getGet('anchor_date') ?: date('Y-m-d'),
                ]),
            ]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    public function operatingExpense()
    {
        try {
            $payload = (array) ($this->request->getJSON(true) ?: $this->request->getPost());
            [$companyId, $outletId] = $this->scope($payload);
            return $this->response->setJSON([
                'ok' => true,
                'data' => $this->profitLoss->saveExpense($payload, $companyId, $outletId),
            ]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON([
                'ok' => false,
                'message' => $exception->getMessage(),
            ]);
        }
    }

    public function updateOperatingExpense(string $id)
    {
        try {
            $payload = (array) ($this->request->getJSON(true) ?: []);
            $payload['id'] = $id;
            [$companyId, $outletId] = $this->scope($payload);
            return $this->response->setJSON([
                'ok' => true,
                'data' => $this->profitLoss->saveExpense($payload, $companyId, $outletId),
            ]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON([
                'ok' => false,
                'message' => $exception->getMessage(),
            ]);
        }
    }

    public function deleteOperatingExpense(string $id)
    {
        try {
            $payload = (array) ($this->request->getJSON(true) ?: []);
            [$companyId, $outletId] = $this->scope($payload);
            return $this->response->setJSON([
                'ok' => true,
                'data' => $this->profitLoss->voidExpense($id, $companyId, $outletId),
            ]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON([
                'ok' => false,
                'message' => $exception->getMessage(),
            ]);
        }
    }

    private function scope(array $payload = []): array
    {
        $companyId = (int) ($payload['company_id'] ?? $payload['companyId'] ?? $this->request->getGet('company_id') ?? 1);
        $outletId = (int) ($payload['outlet_id'] ?? $payload['outletId'] ?? $this->request->getGet('outlet_id') ?? 1);
        $this->validateScope($companyId, $outletId);
        return [$companyId, $outletId];
    }
}
