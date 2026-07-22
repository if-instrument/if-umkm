<?php

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Services\InventoryService;

class InventoryController extends BaseController
{
    private InventoryService $inventory;

    public function __construct(?InventoryService $inventory = null)
    {
        $this->inventory = $inventory ?? service('inventoryService');
    }

    public function listIngredients()
    {
        [$companyId, $outletId] = $this->scope();
        return $this->response->setJSON([
            'ok' => true,
            'data' => $this->inventory->ingredientPage($companyId, $outletId, $this->request->getGet()),
        ]);
    }

    public function listIngredientTemplates()
    {
        [$companyId] = $this->scope();
        return $this->response->setJSON([
            'ok' => true,
            'data' => $this->inventory->templatePage($companyId, $this->request->getGet()),
        ]);
    }

    public function ingredientTemplate()
    {
        $payload = $this->payload();
        [$companyId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->inventory->saveTemplate($payload, $companyId));
    }

    public function updateIngredientTemplate(string $id)
    {
        $payload = ['id' => $id] + $this->payload();
        [$companyId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->inventory->saveTemplate($payload, $companyId));
    }

    public function deleteIngredientTemplate(string $id)
    {
        [$companyId] = $this->scope($this->payload());
        return $this->jsonAction(fn () => $this->inventory->deactivateTemplate($id, $companyId));
    }

    public function getIngredient(string $id)
    {
        [$companyId, $outletId] = $this->scope();
        return $this->jsonAction(fn () => $this->inventory->ingredientDetail($id, $companyId, $outletId));
    }

    public function ingredient()
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->inventory->saveIngredient($payload, $companyId, $outletId));
    }

    public function updateIngredient(string $id)
    {
        $payload = ['id' => $id] + $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->inventory->saveIngredient($payload, $companyId, $outletId));
    }

    public function ingredientMapping()
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->inventory->saveIngredientMapping($payload, $companyId, $outletId));
    }

    public function deleteIngredient(string $id)
    {
        [$companyId, $outletId] = $this->scope($this->payload());
        return $this->jsonAction(fn () => $this->inventory->deactivateIngredient($id, $companyId, $outletId));
    }

    public function listMovements()
    {
        [$companyId, $outletId] = $this->scope();
        return $this->response->setJSON([
            'ok' => true,
            'data' => $this->inventory->movementPage($companyId, $outletId, $this->request->getGet()),
        ]);
    }

    public function purchase()
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->inventory->purchase($payload, $companyId, $outletId));
    }

    public function waste()
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->inventory->waste($payload, $companyId, $outletId));
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
            return $this->response
                ->setStatusCode(422)
                ->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }
}
