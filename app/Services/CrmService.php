<?php

namespace App\Services;

use App\Models\CustomerMemberModel;
use Config\Database;

class CrmService
{
    private $db;

    public function __construct()
    {
        $this->db = Database::connect();
    }

    public function customerPage(int $companyId, int $outletId, array $filters = []): array
    {
        if (! $this->db->tableExists('customer_members')) {
            return ['items' => [], 'pagination' => ['page' => 1, 'perPage' => 25, 'total' => 0, 'totalPages' => 1], 'summary' => $this->summary([])];
        }

        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = min(100, max(10, (int) ($filters['per_page'] ?? $filters['perPage'] ?? 25)));
        $search = strtolower(trim((string) ($filters['search'] ?? '')));
        $status = trim((string) ($filters['status'] ?? ''));

        $builder = $this->baseCustomerBuilder($companyId);
        if ($search !== '') {
            $builder->groupStart()
                ->like('LOWER(name)', $search)
                ->orLike('LOWER(email)', $search)
                ->orLike('phone', $search)
                ->groupEnd();
        }
        if ($status !== '') {
            $builder->whereIn('status', $this->statusAliases($status));
        }

        $total = (clone $builder)->countAllResults();
        $rows = $builder
            ->orderBy('last_order_at', 'DESC')
            ->orderBy('name', 'ASC')
            ->limit($perPage, ($page - 1) * $perPage)
            ->get()
            ->getResultArray();

        $items = array_map(fn ($row) => $this->customerPayload($row), $rows);

        return [
            'items' => $items,
            'pagination' => [
                'page' => $page,
                'perPage' => $perPage,
                'total' => $total,
                'totalPages' => max(1, (int) ceil($total / $perPage)),
            ],
            'summary' => $this->summary($items),
        ];
    }

    public function transactionPage(int $companyId, int $outletId, array $filters = []): array
    {
        if (! $this->db->tableExists('orders')) {
            return ['items' => [], 'pagination' => ['page' => 1, 'perPage' => 25, 'total' => 0, 'totalPages' => 1], 'summary' => ['transactions' => 0, 'revenue' => 0, 'members' => 0]];
        }

        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = min(100, max(10, (int) ($filters['per_page'] ?? $filters['perPage'] ?? 25)));
        $search = strtolower(trim((string) ($filters['search'] ?? '')));
        $dateFrom = trim((string) ($filters['date_from'] ?? $filters['dateFrom'] ?? ''));
        $dateTo = trim((string) ($filters['date_to'] ?? $filters['dateTo'] ?? ''));

        $builder = $this->baseTransactionBuilder($companyId);
        if ($search !== '') {
            $builder->groupStart()
                ->like('LOWER(o.order_no)', $search)
                ->orLike('LOWER(o.customer_name)', $search)
                ->orLike('LOWER(o.customer_email)', $search)
                ->orLike('LOWER(cm.name)', $search)
                ->orLike('LOWER(cm.email)', $search)
                ->groupEnd();
        }
        if ($dateFrom !== '') {
            $builder->where('DATE(o.created_at) >=', $dateFrom);
        }
        if ($dateTo !== '') {
            $builder->where('DATE(o.created_at) <=', $dateTo);
        }

        $total = (clone $builder)->countAllResults();
        $rows = $builder
            ->select('o.id, o.order_no, o.created_at, o.service_type, o.customer_name, o.customer_email, o.customer_phone, o.customer_member_id, o.payment_status, o.payment_method, o.status, o.grand_total, cm.name AS member_name, cm.email AS member_email, cm.phone AS member_phone')
            ->orderBy('o.created_at', 'DESC')
            ->limit($perPage, ($page - 1) * $perPage)
            ->get()
            ->getResultArray();

        $items = array_map(fn ($row) => $this->transactionPayload($row), $rows);

        return [
            'items' => $items,
            'pagination' => [
                'page' => $page,
                'perPage' => $perPage,
                'total' => $total,
                'totalPages' => max(1, (int) ceil($total / $perPage)),
            ],
            'summary' => [
                'transactions' => count($items),
                'revenue' => array_sum(array_map(fn ($row) => (float) ($row['total'] ?? 0), $items)),
                'members' => count(array_unique(array_filter(array_map(fn ($row) => $row['customerMemberId'] ?? '', $items)))),
            ],
        ];
    }

    public function customerDetail(string $id, int $companyId, int $outletId): array
    {
        $row = $this->findCustomer($id, $companyId);
        return $this->customerPayload($row);
    }

    public function saveCustomer(array $payload, int $companyId, int $outletId): array
    {
        if (! $this->db->tableExists('customer_members')) {
            throw new \InvalidArgumentException('Tabel customer member belum tersedia.');
        }

        $id = $this->numericId($payload['id'] ?? '');
        $name = trim((string) ($payload['name'] ?? ''));
        $email = strtolower(trim((string) ($payload['email'] ?? '')));
        $phone = trim((string) ($payload['phone'] ?? ''));
        $status = StatusCodeService::isInactive($payload['status'] ?? '') ? StatusCodeService::INACTIVE : StatusCodeService::ACTIVE;

        if ($name === '') {
            throw new \InvalidArgumentException('Nama customer wajib diisi.');
        }
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new \InvalidArgumentException('Email customer tidak valid.');
        }
        if ($phone === '') {
            throw new \InvalidArgumentException('No HP customer wajib diisi.');
        }

        $duplicate = $this->db->table('customer_members')
            ->where('email', $email);
        if ($this->hasCompanyColumn('customer_members')) {
            $duplicate->where('company_id', $companyId);
        }
        if ($id) {
            $duplicate->where('id !=', $id);
        }
        if ($duplicate->get()->getRowArray()) {
            throw new \InvalidArgumentException('Email sudah terdaftar untuk customer lain.');
        }

        $data = [
            'company_id' => $companyId,
            'outlet_id' => $outletId,
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
            'status' => $status,
        ];
        if (! $this->hasCompanyColumn('customer_members')) {
            unset($data['company_id']);
        }

        $model = new CustomerMemberModel();
        if ($id) {
            $this->findCustomer('member-' . $id, $companyId);
            $model->update($id, $data);
            return $this->customerDetail('member-' . $id, $companyId, $outletId);
        }

        $data['last_order_at'] = null;
        $model->insert($data);
        return $this->customerDetail('member-' . $model->getInsertID(), $companyId, $outletId);
    }

    public function deactivateCustomer(string $id, int $companyId, int $outletId): array
    {
        $row = $this->findCustomer($id, $companyId);
        (new CustomerMemberModel())->update((int) $row['id'], ['status' => StatusCodeService::INACTIVE]);
        return $this->customerDetail($id, $companyId, $outletId);
    }

    private function baseCustomerBuilder(int $companyId)
    {
        $builder = $this->db->table('customer_members');
        if ($this->hasCompanyColumn('customer_members')) {
            $builder->where('company_id', $companyId);
        }
        return $builder;
    }

    private function findCustomer(string $id, int $companyId): array
    {
        $numericId = $this->numericId($id);
        if (! $numericId || ! $this->db->tableExists('customer_members')) {
            throw new \InvalidArgumentException('Customer tidak ditemukan.');
        }
        $row = $this->baseCustomerBuilder($companyId)->where('id', $numericId)->get()->getRowArray();
        if (! $row) {
            throw new \InvalidArgumentException('Customer tidak ditemukan.');
        }
        return $row;
    }

    private function customerPayload(array $row): array
    {
        return [
            'id' => 'member-' . $row['id'],
            'name' => $row['name'],
            'email' => $row['email'],
            'phone' => $row['phone'] ?? '',
            'status' => $row['status'] ?? StatusCodeService::ACTIVE,
            'lastOrderAt' => $row['last_order_at'] ?? '',
            'createdAt' => $row['created_at'] ?? '',
            'updatedAt' => $row['updated_at'] ?? '',
        ];
    }

    private function baseTransactionBuilder(int $companyId)
    {
        $builder = $this->db->table('orders o')
            ->join('customer_members cm', 'cm.id = o.customer_member_id', 'left')
            ->where('o.customer_member_id IS NOT NULL', null, false);
        if ($this->hasCompanyColumn('orders')) {
            $builder->where('o.company_id', $companyId);
        }
        return $builder;
    }

    private function transactionPayload(array $row): array
    {
        return [
            'id' => 'ord-' . $row['id'],
            'orderNumber' => $row['order_no'],
            'createdAt' => $row['created_at'] ?? '',
            'serviceType' => $row['service_type'] ?? '',
            'customerMemberId' => $row['customer_member_id'] ? 'member-' . $row['customer_member_id'] : '',
            'customerName' => $row['member_name'] ?: ($row['customer_name'] ?? ''),
            'customerEmail' => $row['member_email'] ?: ($row['customer_email'] ?? ''),
            'customerPhone' => $row['member_phone'] ?: ($row['customer_phone'] ?? ''),
            'status' => StatusCodeService::order($row['status'] ?? ''),
            'paymentStatus' => StatusCodeService::payment($row['payment_status'] ?? ''),
            'paymentMethod' => $row['payment_method'] ?? '',
            'total' => (float) ($row['grand_total'] ?? 0),
        ];
    }

    private function summary(array $items): array
    {
        return [
            'active' => count(array_filter($items, fn ($row) => ! StatusCodeService::isInactive($row['status'] ?? ''))),
            'inactive' => count(array_filter($items, fn ($row) => StatusCodeService::isInactive($row['status'] ?? ''))),
            'withOrder' => count(array_filter($items, fn ($row) => ! empty($row['lastOrderAt']))),
        ];
    }

    private function numericId($value): int
    {
        $id = preg_replace('/\D+/', '', (string) $value);
        return $id === '' ? 0 : (int) $id;
    }

    private function statusAliases(string $status): array
    {
        $code = StatusCodeService::common($status, $status);
        if ($code === StatusCodeService::ACTIVE) {
            return [StatusCodeService::ACTIVE, 'active'];
        }
        if ($code === StatusCodeService::INACTIVE) {
            return [StatusCodeService::INACTIVE, 'inactive'];
        }
        return [$status];
    }

    private function hasCompanyColumn(string $table): bool
    {
        return $this->db->fieldExists('company_id', $table);
    }
}
