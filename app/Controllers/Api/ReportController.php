<?php

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Services\ProfitLossService;

class ReportController extends BaseController
{
    private ProfitLossService $profitLoss;

    public function __construct()
    {
        $this->profitLoss = new ProfitLossService();
    }

    public function profitLoss()
    {
        return $this->response->setJSON([
            'ok' => true,
            'data' => $this->profitLoss->report([
                'company_id' => (int) ($this->request->getGet('company_id') ?? 1),
                'outlet_id' => (int) ($this->request->getGet('outlet_id') ?? 1),
                'period' => $this->request->getGet('period') ?: 'daily',
                'anchor_date' => $this->request->getGet('anchor_date') ?: date('Y-m-d'),
            ]),
        ]);
    }

    public function listOperatingExpenses()
    {
        return $this->response->setJSON([
            'ok' => true,
            'data' => $this->profitLoss->expensePage([
                'company_id' => (int) ($this->request->getGet('company_id') ?? 1),
                'outlet_id' => (int) ($this->request->getGet('outlet_id') ?? 1),
                'period' => $this->request->getGet('period') ?: 'daily',
                'anchor_date' => $this->request->getGet('anchor_date') ?: date('Y-m-d'),
            ]),
        ]);
    }

    public function operatingExpense()
    {
        try {
            $payload = (array) ($this->request->getJSON(true) ?: $this->request->getPost());
            return $this->response->setJSON([
                'ok' => true,
                'data' => $this->profitLoss->saveExpense(
                    $payload,
                    (int) ($payload['company_id'] ?? $payload['companyId'] ?? 1),
                    (int) ($payload['outlet_id'] ?? $payload['outletId'] ?? 1)
                ),
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
            return $this->response->setJSON([
                'ok' => true,
                'data' => $this->profitLoss->saveExpense(
                    $payload,
                    (int) ($payload['company_id'] ?? $payload['companyId'] ?? 1),
                    (int) ($payload['outlet_id'] ?? $payload['outletId'] ?? 1)
                ),
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
            return $this->response->setJSON([
                'ok' => true,
                'data' => $this->profitLoss->voidExpense(
                    $id,
                    (int) ($payload['company_id'] ?? $payload['companyId'] ?? $this->request->getGet('company_id') ?? 1),
                    (int) ($payload['outlet_id'] ?? $payload['outletId'] ?? $this->request->getGet('outlet_id') ?? 1)
                ),
            ]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON([
                'ok' => false,
                'message' => $exception->getMessage(),
            ]);
        }
    }
}
