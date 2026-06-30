<?php

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Services\AccessManagementService;

class AccessController extends BaseController
{
    private AccessManagementService $access;

    public function __construct()
    {
        $this->access = new AccessManagementService();
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
        return $this->response->setJSON(['ok' => true, 'data' => $this->access->deactivateCompany($id)]);
    }

    public function resendCompanyAdminInvitation(string $id)
    {
        return $this->jsonAction(fn () => $this->access->resendCompanyAdminInvitation($id));
    }

    public function outlet()
    {
        return $this->response->setJSON(['ok' => true, 'data' => $this->access->saveOutlet($this->payload())]);
    }

    public function listOutlets()
    {
        $companyId = $this->request->getGet('companyId') ?: $this->request->getGet('company_id');
        $outlets = $this->access->data()['outlets'] ?? [];
        if ($companyId) {
            $legacyCompanyId = is_numeric($companyId) ? ((int) $companyId === 1 ? 'company-main' : 'company-' . $companyId) : (string) $companyId;
            $outlets = array_values(array_filter($outlets, fn ($outlet) => $outlet['companyId'] === $legacyCompanyId));
        }
        return $this->response->setJSON(['ok' => true, 'data' => $this->arrayPage($outlets, $this->request->getGet())]);
    }

    public function updateOutlet(string $id)
    {
        return $this->response->setJSON(['ok' => true, 'data' => $this->access->saveOutlet(['id' => $id] + $this->payload())]);
    }

    public function getOutlet(string $id)
    {
        return $this->jsonAction(fn () => $this->access->outletDetail($id));
    }

    public function deleteOutlet(string $id)
    {
        return $this->response->setJSON(['ok' => true, 'data' => $this->access->deactivateOutlet($id)]);
    }

    public function role()
    {
        return $this->response->setJSON(['ok' => true, 'data' => $this->access->saveRole($this->payload())]);
    }

    public function listRoles()
    {
        $companyId = $this->request->getGet('companyId') ?: $this->request->getGet('company_id');
        $roles = $this->access->data()['companyRoles'] ?? [];
        if ($companyId) {
            $legacyCompanyId = is_numeric($companyId) ? ((int) $companyId === 1 ? 'company-main' : 'company-' . $companyId) : (string) $companyId;
            $roles = array_values(array_filter($roles, fn ($role) => $role['companyId'] === $legacyCompanyId));
        }
        return $this->response->setJSON(['ok' => true, 'data' => $this->arrayPage($roles, $this->request->getGet())]);
    }

    public function updateRole(string $id)
    {
        return $this->response->setJSON(['ok' => true, 'data' => $this->access->saveRole(['id' => $id] + $this->payload())]);
    }

    public function getRole(string $id)
    {
        return $this->jsonAction(fn () => $this->access->roleDetail($id));
    }

    public function deleteRole(string $id)
    {
        return $this->response->setJSON(['ok' => true, 'data' => $this->access->deactivateRole($id)]);
    }

    public function user()
    {
        return $this->jsonAction(fn () => $this->access->saveUser($this->payload()));
    }

    public function listUsers()
    {
        return $this->response->setJSON([
            'ok' => true,
            'data' => $this->access->userPage($this->companyId(), $this->request->getGet()),
        ]);
    }

    public function getUser(string $id)
    {
        return $this->jsonAction(fn () => $this->access->userDetail($id, $this->companyId()));
    }

    public function updateUser(string $id)
    {
        return $this->jsonAction(fn () => $this->access->saveUser(['id' => $id] + $this->payload()));
    }

    public function resendUserInvitation(string $id)
    {
        return $this->jsonAction(fn () => $this->access->resendUserInvitation($id, $this->companyId()));
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
        return $this->response->setJSON(['ok' => true, 'data' => $this->access->deactivateUser($id)]);
    }

    private function payload(): array
    {
        return $this->request->getJSON(true) ?: [];
    }

    private function companyId(): int
    {
        return (int) ($this->request->getGet('company_id') ?? $this->payload()['company_id'] ?? 1);
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
