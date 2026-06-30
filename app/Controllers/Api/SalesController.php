<?php

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Services\PaymentGatewayService;
use App\Services\SalesService;

class SalesController extends BaseController
{
    private SalesService $sales;
    private PaymentGatewayService $payments;

    public function __construct()
    {
        $this->sales = new SalesService();
        $this->payments = new PaymentGatewayService();
    }

    public function listOrders()
    {
        [$companyId, $outletId] = $this->scope();
        return $this->response->setJSON(['ok' => true, 'data' => $this->sales->orderPage($companyId, $outletId, $this->request->getGet())]);
    }

    public function getOrder(string $id)
    {
        [$companyId, $outletId] = $this->scope();
        return $this->jsonAction(fn () => $this->sales->orderDetail($id, $companyId, $outletId));
    }

    public function order()
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->sales->saveOrder($payload, $companyId, $outletId));
    }

    public function updateOrder(string $id)
    {
        $payload = ['id' => $id] + $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->sales->saveOrder($payload, $companyId, $outletId));
    }

    public function status(string $id)
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->sales->updateStatus($id, $payload['status'] ?? SalesService::STATUS_WAITING, $companyId, $outletId));
    }

    public function readyItems(string $id)
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->sales->readyItems($id, $payload['readyItemKeys'] ?? [], $companyId, $outletId));
    }

    public function settle(string $id)
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->sales->settle($id, $payload['paymentMethod'] ?? 'Settlement', $companyId, $outletId, $payload));
    }

    public function approve(string $id)
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->sales->approvePendingOrder($id, $payload['paymentMethod'] ?? 'Cash', $companyId, $outletId, $payload));
    }

    public function moveTable(string $id)
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->sales->moveTable($id, $payload['tableName'] ?? '', $companyId, $outletId));
    }

    public function createPayment()
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->payments->create($payload, $companyId, $outletId));
    }

    public function paymentStatus(string $id)
    {
        [$companyId, $outletId] = $this->scope();
        return $this->jsonAction(fn () => $this->payments->status($id, $companyId, $outletId));
    }

    public function paymentLogs()
    {
        $claims = service('request')->jwt ?? [];
        if (($claims['authType'] ?? '') !== 'company_admin') {
            return $this->response->setStatusCode(403)->setJSON([
                'ok' => false,
                'message' => 'Log payment gateway hanya bisa dilihat admin perusahaan.',
            ]);
        }
        [$companyId] = $this->scope();
        return $this->jsonAction(fn () => $this->payments->logPage($companyId, $this->request->getGet()));
    }

    public function confirmPayment(string $id)
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->payments->confirm($id, $companyId, $outletId));
    }

    public function xenditWebhook()
    {
        return $this->jsonAction(fn () => $this->payments->handleXenditWebhook($this->payload()));
    }

    public function publicCardPayment(string $reference)
    {
        return $this->jsonAction(fn () => $this->payments->publicCardPayment($reference));
    }

    public function syncPublicCardPayment(string $reference)
    {
        return $this->jsonAction(fn () => $this->payments->syncPublicCardPayment($reference));
    }

    public function cancelPayment(string $id)
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->payments->cancel($id, $companyId, $outletId));
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
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }
}
