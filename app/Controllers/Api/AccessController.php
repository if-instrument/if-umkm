<?php

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Services\AccessManagementService;

class AccessController extends BaseController
{
    private AccessManagementService $access;

    public function __construct(?AccessManagementService $access = null)
    {
        $this->access = $access ?? service('accessManagementService');
    }

    public function listCompanies()
    {
        return $this->response->setJSON(['ok' => true, 'data' => $this->arrayPage($this->access->data()['companies'] ?? [], $this->request->getGet())]);
    }

    public function getCompany(string $id)
    {
        return $this->jsonAction(fn () => $this->access->companyDetail($id));
    }

    public function company()
    {
        try {
            return $this->response->setJSON(['ok' => true, 'data' => $this->access->saveCompany($this->payload())]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON([
                'ok' => false,
                'message' => $exception->getMessage(),
            ]);
        }
    }

    public function updateCompany(string $id)
    {
        try {
            $companyId = $this->numericCompanyId($id);
            $this->validateScope($companyId, -1);
            return $this->response->setJSON(['ok' => true, 'data' => $this->access->saveCompany(['id' => $id] + $this->payload())]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON([
                'ok' => false,
                'message' => $exception->getMessage(),
            ]);
        }
    }

    public function deleteCompany(string $id)
    {
        try {
            $companyId = $this->numericCompanyId($id);
            $this->validateScope($companyId, -1);
            return $this->response->setJSON(['ok' => true, 'data' => $this->access->deactivateCompany($id)]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    public function resendCompanyAdminInvitation(string $id)
    {
        try {
            $companyId = $this->numericCompanyId($id);
            $this->validateScope($companyId, -1);
            return $this->jsonAction(fn () => $this->access->resendCompanyAdminInvitation($id));
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    public function outlet()
    {
        try {
            $payload = $this->payload();
            $companyId = (int) ($payload['company_id'] ?? 1);
            $this->validateScope($companyId, -1);
            return $this->response->setJSON(['ok' => true, 'data' => $this->access->saveOutlet($payload)]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    public function listOutlets()
    {
        try {
            $companyId = (int) ($this->request->getGet('companyId') ?: $this->request->getGet('company_id') ?: 1);
            $this->validateScope($companyId, -1);
            $outlets = $this->access->data()['outlets'] ?? [];
            if ($companyId) {
                $legacyCompanyId = $companyId === 1 ? 'company-main' : 'company-' . $companyId;
                $outlets = array_values(array_filter($outlets, fn ($outlet) => $outlet['companyId'] === $legacyCompanyId));
            }
            return $this->response->setJSON(['ok' => true, 'data' => $this->arrayPage($outlets, $this->request->getGet())]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    public function updateOutlet(string $id)
    {
        try {
            $payload = $this->payload();
            $companyId = (int) ($payload['company_id'] ?? 1);
            $this->validateScope($companyId, (int) $id);
            return $this->response->setJSON(['ok' => true, 'data' => $this->access->saveOutlet(['id' => $id] + $payload)]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    public function getOutlet(string $id)
    {
        try {
            $outlet = $this->access->outletDetail($id);
            $companyId = $this->numericCompanyId($outlet['companyId'] ?? '');
            $this->validateScope($companyId, (int) $id);
            return $this->response->setJSON(['ok' => true, 'data' => $outlet]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    public function deleteOutlet(string $id)
    {
        try {
            $outlet = $this->access->outletDetail($id);
            $companyId = $this->numericCompanyId($outlet['companyId'] ?? '');
            $this->validateScope($companyId, (int) $id);
            return $this->response->setJSON(['ok' => true, 'data' => $this->access->deactivateOutlet($id)]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    public function role()
    {
        try {
            $payload = $this->payload();
            $companyId = (int) ($payload['company_id'] ?? 1);
            $this->validateScope($companyId, -1);
            return $this->response->setJSON(['ok' => true, 'data' => $this->access->saveRole($payload)]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    public function listRoles()
    {
        try {
            $companyId = (int) ($this->request->getGet('companyId') ?: $this->request->getGet('company_id') ?: 1);
            $this->validateScope($companyId, -1);
            $roles = $this->access->data()['companyRoles'] ?? [];
            if ($companyId) {
                $legacyCompanyId = $companyId === 1 ? 'company-main' : 'company-' . $companyId;
                $roles = array_values(array_filter($roles, fn ($role) => $role['companyId'] === $legacyCompanyId));
            }
            return $this->response->setJSON(['ok' => true, 'data' => $this->arrayPage($roles, $this->request->getGet())]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    public function updateRole(string $id)
    {
        try {
            $payload = $this->payload();
            $companyId = (int) ($payload['company_id'] ?? 1);
            $this->validateScope($companyId, -1);
            return $this->response->setJSON(['ok' => true, 'data' => $this->access->saveRole(['id' => $id] + $payload)]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    public function getRole(string $id)
    {
        try {
            $role = $this->access->roleDetail($id);
            $companyId = $this->numericCompanyId($role['companyId'] ?? '');
            $this->validateScope($companyId, -1);
            return $this->response->setJSON(['ok' => true, 'data' => $role]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    public function deleteRole(string $id)
    {
        try {
            $role = $this->access->roleDetail($id);
            $companyId = $this->numericCompanyId($role['companyId'] ?? '');
            $this->validateScope($companyId, -1);
            return $this->response->setJSON(['ok' => true, 'data' => $this->access->deactivateRole($id)]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    public function user()
    {
        try {
            $payload = $this->payload();
            $companyId = (int) ($payload['company_id'] ?? 1);
            $this->validateScope($companyId, -1);
            return $this->response->setJSON(['ok' => true, 'data' => $this->access->saveUser($payload)]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    public function listUsers()
    {
        try {
            $companyId = $this->companyId();
            $this->validateScope($companyId, -1);
            return $this->response->setJSON([
                'ok' => true,
                'data' => $this->access->userPage($companyId, $this->request->getGet()),
            ]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    public function getUser(string $id)
    {
        try {
            $companyId = $this->companyId();
            $this->validateScope($companyId, -1);
            return $this->response->setJSON(['ok' => true, 'data' => $this->access->userDetail($id, $companyId)]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    public function updateUser(string $id)
    {
        try {
            $payload = $this->payload();
            $companyId = (int) ($payload['company_id'] ?? 1);
            $this->validateScope($companyId, -1);
            return $this->response->setJSON(['ok' => true, 'data' => $this->access->saveUser(['id' => $id] + $payload)]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    public function resendUserInvitation(string $id)
    {
        try {
            $companyId = $this->companyId();
            $this->validateScope($companyId, -1);
            return $this->jsonAction(fn () => $this->access->resendUserInvitation($id, $companyId));
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    public function uploadLogo()
    {
        $file = $this->request->getFile('logo');
        if (! $file || ! $file->isValid()) {
            return $this->response->setStatusCode(422)->setJSON([
                'ok' => false,
                'message' => 'File logo wajib diupload.',
            ]);
        }

        if (! in_array($file->getMimeType(), ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], true)) {
            return $this->response->setStatusCode(422)->setJSON([
                'ok' => false,
                'message' => 'Format logo harus JPG, PNG, WEBP, atau GIF.',
            ]);
        }

        if ($file->getSize() > 2 * 1024 * 1024) {
            return $this->response->setStatusCode(422)->setJSON([
                'ok' => false,
                'message' => 'Ukuran logo maksimal 2 MB.',
            ]);
        }

        $target = FCPATH . 'uploads/logos';
        if (! is_dir($target)) {
            mkdir($target, 0775, true);
        }

        $name = date('YmdHis') . '-' . bin2hex(random_bytes(6)) . '.' . $file->getExtension();
        $file->move($target, $name);

        return $this->response->setJSON([
            'ok' => true,
            'url' => '/uploads/logos/' . $name,
        ]);
    }

    public function deleteUser(string $id)
    {
        try {
            $companyId = $this->companyId();
            $this->validateScope($companyId, -1);
            return $this->response->setJSON(['ok' => true, 'data' => $this->access->deactivateUser($id)]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    private function payload(): array
    {
        return $this->request->getJSON(true) ?: [];
    }

    private function companyId(): int
    {
        $companyId = (int) ($this->request->getGet('company_id') ?? $this->payload()['company_id'] ?? 1);
        $this->validateScope($companyId, -1);
        return $companyId;
    }

    private function jsonAction(callable $action)
    {
        try {
            return $this->response->setJSON(['ok' => true, 'data' => $action()]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }

    private function arrayPage(array $items, array $filters = []): array
    {
        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = min(100, max(1, (int) ($filters['per_page'] ?? $filters['perPage'] ?? 25)));
        $total = count($items);
        return [
            'items' => array_slice($items, ($page - 1) * $perPage, $perPage),
            'meta' => [
                'page' => $page,
                'perPage' => $perPage,
                'total' => $total,
                'totalPages' => (int) max(1, ceil($total / max(1, $perPage))),
            ],
        ];
    }
}
