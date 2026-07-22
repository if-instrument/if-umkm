<?php

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Services\SettingsService;

class SettingsController extends BaseController
{
    private SettingsService $settings;

    public function __construct(?SettingsService $settings = null)
    {
        $this->settings = $settings ?? service('settingsService');
    }

    public function general()
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->response->setJSON(['ok' => true, 'data' => $this->settings->saveGeneral($payload, $companyId, $outletId)]);
    }

    public function getGeneral()
    {
        [$companyId, $outletId] = $this->scope();
        return $this->response->setJSON(['ok' => true, 'data' => $this->settings->generalSettings($companyId, $outletId)]);
    }

    public function listPrinters()
    {
        return $this->response->setJSON(['ok' => true, 'data' => $this->settings->printerPage()]);
    }

    public function diningTable()
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->response->setJSON(['ok' => true, 'data' => $this->settings->saveDiningTable($payload, $companyId, $outletId)]);
    }

    public function listDiningTables()
    {
        [$companyId, $outletId] = $this->scope();
        return $this->response->setJSON(['ok' => true, 'data' => $this->settings->diningTablePage($companyId, $outletId, $this->request->getGet())]);
    }

    public function getDiningTable(string $id)
    {
        [$companyId, $outletId] = $this->scope();
        return $this->response->setJSON(['ok' => true, 'data' => $this->settings->diningTableDetail($id, $companyId, $outletId)]);
    }

    public function updateDiningTable(string $id)
    {
        $payload = ['id' => $id] + $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->response->setJSON(['ok' => true, 'data' => $this->settings->saveDiningTable($payload, $companyId, $outletId)]);
    }

    public function deleteDiningTable(string $id)
    {
        [$companyId, $outletId] = $this->scope($this->payload());
        return $this->response->setJSON(['ok' => true, 'data' => $this->settings->deactivateDiningTable($id, $companyId, $outletId)]);
    }

    public function paymentMethod()
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->settings->savePaymentMethod($payload, $companyId, $outletId));
    }

    public function listPaymentMethods()
    {
        [$companyId, $outletId] = $this->scope();
        return $this->response->setJSON(['ok' => true, 'data' => $this->settings->paymentMethodPage($companyId, $outletId, $this->request->getGet())]);
    }

    public function getPaymentMethod(string $id)
    {
        [$companyId, $outletId] = $this->scope();
        return $this->response->setJSON(['ok' => true, 'data' => $this->settings->paymentMethodDetail($id, $companyId, $outletId)]);
    }

    public function updatePaymentMethod(string $id)
    {
        $payload = ['id' => $id] + $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->settings->savePaymentMethod($payload, $companyId, $outletId));
    }

    public function deletePaymentMethod(string $id)
    {
        [$companyId, $outletId] = $this->scope($this->payload());
        return $this->response->setJSON(['ok' => true, 'data' => $this->settings->deactivatePaymentMethod($id, $companyId, $outletId)]);
    }

    public function uploadQrisImage()
    {
        $file = $this->request->getFile('qrisImage');
        if (! $file || ! $file->isValid()) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => 'Gambar QRIS wajib diupload.']);
        }
        if (! in_array($file->getMimeType(), ['image/jpeg', 'image/png', 'image/webp'], true)) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => 'Format QRIS harus JPG, PNG, atau WEBP.']);
        }
        if ($file->getSize() > 3 * 1024 * 1024) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => 'Ukuran gambar QRIS maksimal 3 MB.']);
        }

        $target = FCPATH . 'uploads/qris';
        if (! is_dir($target)) {
            mkdir($target, 0775, true);
        }
        $extension = $file->guessExtension() ?: $file->getExtension();
        $name = date('YmdHis') . '-' . bin2hex(random_bytes(6)) . '.' . $extension;
        $file->move($target, $name);

        return $this->response->setJSON(['ok' => true, 'url' => '/uploads/qris/' . $name]);
    }

    public function packagingRule()
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->response->setJSON(['ok' => true, 'data' => $this->settings->savePackagingRule($payload, $companyId, $outletId)]);
    }

    public function listPackagingRules()
    {
        [$companyId, $outletId] = $this->scope();
        return $this->response->setJSON(['ok' => true, 'data' => $this->settings->packagingRulePage($companyId, $outletId, $this->request->getGet())]);
    }

    public function getPackagingRule(string $id)
    {
        [$companyId, $outletId] = $this->scope();
        return $this->response->setJSON(['ok' => true, 'data' => $this->settings->packagingRuleDetail($id, $companyId, $outletId)]);
    }

    public function updatePackagingRule(string $id)
    {
        $payload = ['id' => $id] + $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->response->setJSON(['ok' => true, 'data' => $this->settings->savePackagingRule($payload, $companyId, $outletId)]);
    }

    public function deletePackagingRule(string $id)
    {
        [$companyId, $outletId] = $this->scope($this->payload());
        return $this->response->setJSON(['ok' => true, 'data' => $this->settings->deactivatePackagingRule($id, $companyId, $outletId)]);
    }

    private function payload(): array
    {
        return $this->request->getJSON(true) ?: [];
    }

    private function scope(array $payload = []): array
    {
        $companyId = (int) ($payload['company_id'] ?? $this->request->getGet('company_id') ?? 1);
        $outletId = (int) ($payload['outlet_id'] ?? $this->request->getGet('outlet_id') ?? 1);
        $this->validateScope($companyId, $outletId);
        return [$companyId, $outletId];
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
