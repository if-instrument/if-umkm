<?php

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Services\ProductSuiteService;
use App\Services\StatusCodeService;
use Config\Database;

class ProductSuiteController extends BaseController
{
    private ProductSuiteService $products;

    public function __construct()
    {
        $this->products = new ProductSuiteService();
    }

    public function listProducts()
    {
        [$companyId, $outletId] = $this->scope();
        return $this->response->setJSON([
            'ok' => true,
            'data' => $this->products->productPage($companyId, $outletId, $this->request->getGet()),
        ]);
    }

    public function getProduct(string $id)
    {
        [$companyId, $outletId] = $this->scope();
        return $this->jsonAction(fn () => $this->products->productDetail($id, $companyId, $outletId));
    }

    public function category()
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->products->saveCategory($payload, $companyId, $outletId, $this->authClaims()));
    }

    public function listCategories()
    {
        [$companyId, $outletId] = $this->scope();
        return $this->response->setJSON(['ok' => true, 'data' => $this->products->categoryPage($companyId, $outletId, $this->request->getGet())]);
    }

    public function getCategory(string $id)
    {
        [$companyId, $outletId] = $this->scope();
        return $this->jsonAction(fn () => $this->products->categoryDetail($id, $companyId, $outletId));
    }

    public function updateCategory(string $id)
    {
        $payload = ['id' => $id] + $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->products->saveCategory($payload, $companyId, $outletId, $this->authClaims()));
    }

    public function deleteCategory(string $id)
    {
        [$companyId, $outletId] = $this->scope($this->payload());
        return $this->jsonAction(fn () => $this->products->deactivateCategory($id, $companyId, $outletId, $this->authClaims()));
    }

    public function product()
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->products->saveProduct($payload, $companyId, $outletId, $this->authClaims()));
    }

    public function updateProduct(string $id)
    {
        $payload = ['id' => $id] + $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->products->saveProduct($payload, $companyId, $outletId, $this->authClaims()));
    }

    public function updateProductPrice(string $id)
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->products->saveProductOutletPrice($id, $payload, $companyId, $outletId, $this->authClaims()));
    }

    public function updateProductCategory(string $id)
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->products->saveProductOutletCategoryMapping($id, $payload, $companyId, $outletId, $this->authClaims()));
    }

    public function deleteProductCategory(string $id)
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->products->deleteProductOutletCategoryMapping($id, $companyId, $outletId, $this->authClaims()));
    }

    public function produceProduct(string $id)
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->products->produceProductBatch($id, $payload, $companyId, $outletId));
    }

    public function productBatchLoss(string $id)
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->products->recordProductBatchLoss($id, $payload, $companyId, $outletId));
    }

    public function deleteProduct(string $id)
    {
        [$companyId, $outletId] = $this->scope($this->payload());
        return $this->jsonAction(fn () => $this->products->deactivateProduct($id, $companyId, $outletId, $this->authClaims()));
    }

    public function uploadProductImage()
    {
        $file = $this->request->getFile('productImage');
        if (! $file || ! $file->isValid()) {
            return $this->response->setStatusCode(422)->setJSON([
                'ok' => false,
                'message' => 'Foto produk wajib diupload.',
            ]);
        }

        if (! in_array($file->getMimeType(), ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], true)) {
            return $this->response->setStatusCode(422)->setJSON([
                'ok' => false,
                'message' => 'Format foto produk harus JPG, PNG, WEBP, atau GIF.',
            ]);
        }

        if ($file->getSize() > 3 * 1024 * 1024) {
            return $this->response->setStatusCode(422)->setJSON([
                'ok' => false,
                'message' => 'Ukuran foto produk maksimal 3 MB.',
            ]);
        }

        $target = FCPATH . 'uploads/products';
        if (! is_dir($target)) {
            mkdir($target, 0775, true);
        }

        $extension = $file->guessExtension() ?: $file->getExtension();
        $name = date('YmdHis') . '-' . bin2hex(random_bytes(6)) . '.' . $extension;
        $file->move($target, $name);

        return $this->response->setJSON([
            'ok' => true,
            'url' => '/uploads/products/' . $name,
        ]);
    }

    public function modifier()
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->products->saveModifier($payload, $companyId, $outletId, $this->authClaims()));
    }

    public function listModifiers()
    {
        [$companyId, $outletId] = $this->scope();
        return $this->response->setJSON(['ok' => true, 'data' => $this->products->modifierPage($companyId, $outletId, $this->request->getGet())]);
    }

    public function getModifier(string $id)
    {
        [$companyId, $outletId] = $this->scope();
        return $this->jsonAction(fn () => $this->products->modifierDetail($id, $companyId, $outletId));
    }

    public function updateModifier(string $id)
    {
        $payload = ['id' => $id] + $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->products->saveModifier($payload, $companyId, $outletId, $this->authClaims()));
    }

    public function updateModifierOptionPrice(string $id)
    {
        $payload = ['modifierId' => $id] + $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->products->saveModifierOptionOutletPrice($payload, $companyId, $outletId));
    }

    public function deleteModifier(string $id)
    {
        [$companyId, $outletId] = $this->scope($this->payload());
        return $this->jsonAction(fn () => $this->products->deactivateModifier($id, $companyId, $outletId, $this->authClaims()));
    }

    public function recipeLine()
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->products->saveRecipeLine($payload, $companyId, $outletId, $this->authClaims()));
    }

    public function listRecipes()
    {
        [$companyId, $outletId] = $this->scope();
        return $this->response->setJSON(['ok' => true, 'data' => $this->products->recipePage($companyId, $outletId, $this->request->getGet())]);
    }

    public function productModifiers()
    {
        $payload = $this->payload();
        [$companyId, $outletId] = $this->scope($payload);
        return $this->jsonAction(fn () => $this->products->assignProductModifiers($payload, $companyId, $outletId));
    }

    private function payload(): array
    {
        return $this->request->getJSON(true) ?: [];
    }

    private function scope(array $payload = []): array
    {
        $claims = $this->authClaims();
        $claimCompanyId = $this->numericScopeId($claims['companyId'] ?? null, 'company');
        $requestedCompanyId = (int) ($payload['company_id'] ?? $this->request->getGet('company_id') ?? 1);
        $companyId = ($claims['authType'] ?? '') !== 'super_admin' && $claimCompanyId ? $claimCompanyId : $requestedCompanyId;
        $requestedOutletId = (int) ($payload['outlet_id'] ?? $this->request->getGet('outlet_id') ?? 1);
        return [$companyId, $this->authorizedOutletId($claims, $companyId, $requestedOutletId)];
    }

    private function numericScopeId(string|int|null $value, string $type): int
    {
        if (is_numeric($value)) return (int) $value;
        if ($type === 'company' && $value === 'company-main') return 1;
        if ($type === 'outlet' && $value === 'outlet-main') return 1;
        return preg_match('/(\d+)$/', (string) $value, $matches) ? (int) $matches[1] : 0;
    }

    private function authorizedOutletId(array $claims, int $companyId, int $requestedOutletId): int
    {
        if (($claims['authType'] ?? '') === 'super_admin') return -1;
        $db = Database::connect();
        $companyOutlet = $db->table('outlets')
            ->where('id', $requestedOutletId)
            ->whereNotIn('status', [StatusCodeService::INACTIVE, 'inactive'])
;
        if ($db->fieldExists('company_id', 'outlets')) {
            $companyOutlet->where('company_id', $companyId);
        }
        $companyOutlet = $companyOutlet->countAllResults() > 0;
        if (($claims['authType'] ?? '') === 'company_admin') {
            if ($companyOutlet) return $requestedOutletId;
            $fallback = $db->table('outlets')->select('id')->whereNotIn('status', [StatusCodeService::INACTIVE, 'inactive'])->orderBy('id');
            if ($db->fieldExists('company_id', 'outlets')) {
                $fallback->where('company_id', $companyId);
            }
            return (int) ($fallback->get()->getRowArray()['id'] ?? -1);
        }

        $userId = (int) ($claims['sub'] ?? 0);
        $role = $db->table('user_roles ur')
            ->select('r.scope')
            ->join('roles r', 'r.id = ur.role_id', 'left')
            ->where('ur.user_id', $userId)
            ->get()
            ->getRowArray();
        if (($role['scope'] ?? '') === 'all' && $companyOutlet) return $requestedOutletId;

        $assigned = $db->table('user_outlets uo')
            ->select('uo.outlet_id')
            ->join('outlets o', 'o.id = uo.outlet_id', 'inner')
            ->where('uo.user_id', $userId)
            ->whereNotIn('o.status', [StatusCodeService::INACTIVE, 'inactive'])
            ->orderBy('uo.outlet_id');
        if ($db->fieldExists('company_id', 'outlets')) {
            $assigned->where('o.company_id', $companyId);
        }
        $assigned = $assigned->get()
            ->getResultArray();
        $assignedIds = array_map(fn ($row) => (int) $row['outlet_id'], $assigned);
        return in_array($requestedOutletId, $assignedIds, true) ? $requestedOutletId : ($assignedIds[0] ?? -1);
    }

    private function authClaims(): array
    {
        return (array) (service('request')->jwt ?? []);
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
