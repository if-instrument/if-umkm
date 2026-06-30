<?php

namespace App\Services;

use App\Models\UserModel;
use Config\Database;

class OrderNotificationService
{
    public function sendPaidOrderEmail(int $orderId): bool
    {
        try {
            $db = Database::connect();
            $order = $db->table('orders')->where('id', $orderId)->get()->getRowArray();
            if (! $order || ($order['payment_status'] ?? '') !== 'paid') return false;
            return $this->sendOrderReceiptEmail($orderId, 'Receipt pembayaran berhasil');
        } catch (\Throwable) {
            return false;
        }
    }

    public function sendOrderReceiptEmail(int $orderId, string $title = 'Receipt order'): bool
    {
        try {
            $db = Database::connect();
            $order = $db->table('orders')->where('id', $orderId)->get()->getRowArray();
            if (! $order) return false;

            $company = $db->table('companies')->where('id', (int) ($order['company_id'] ?? 1))->get()->getRowArray() ?: [];
            $outlet = $db->table('outlets')->where('id', (int) $order['outlet_id'])->get()->getRowArray() ?: [];
            $items = $db->table('order_items')->where('order_id', $orderId)->get()->getResultArray();
            $customerEmail = (string) ($order['customer_email'] ?? '');
            $adminEmails = $this->adminEmails((int) ($order['company_id'] ?? 1), (int) $order['outlet_id']);
            $to = filter_var($customerEmail, FILTER_VALIDATE_EMAIL) ? [$customerEmail] : $adminEmails;
            $bcc = filter_var($customerEmail, FILTER_VALIDATE_EMAIL) ? $adminEmails : [];
            if (! $to) return false;

            $brand = $company['brand_name'] ?: ($company['name'] ?? 'IF Instrument');
            $email = service('email');
            $email->clear(true);
            $email->setFrom((string) (env('email.fromEmail') ?: env('email.SMTPUser')), (string) (env('email.fromName') ?: 'IF Instrument'));
            $email->setTo($to);
            if ($bcc) $email->setBCC($bcc);
            $email->setSubject('Receipt #' . $order['order_no'] . ' - ' . $brand);
            $email->setMailType('html');
            $logoSrc = $this->attachInlineLogo($email, (string) ($company['logo_path'] ?? ''));
            $email->setMessage((new ReceiptRendererService())->renderHtml($order, $company, $outlet, $items, [
                'title' => $title,
                'logoSrc' => $logoSrc,
            ]));

            return (bool) $email->send();
        } catch (\Throwable) {
            return false;
        }
    }

    private function adminEmails(int $companyId, int $outletId): array
    {
        $db = Database::connect();
        $emails = [];

        $adminModel = new UserModel();
        if ($db->fieldExists('company_id', 'users')) $adminModel->where('company_id', $companyId);
        foreach ($adminModel->where('type', 'company_admin')->where('status', 'active')->findAll() as $user) {
            $emails[] = $user['email'] ?? '';
        }

        if ($db->tableExists('user_outlets') && $db->tableExists('user_roles') && $db->tableExists('roles')) {
            $builder = $db->table('users u')
                ->select('u.email')
                ->join('user_outlets uo', 'uo.user_id = u.id', 'inner')
                ->join('user_roles ur', 'ur.user_id = u.id', 'left')
                ->join('roles r', 'r.id = ur.role_id', 'left')
                ->where('u.status', 'active')
                ->where('uo.outlet_id', $outletId)
                ->groupStart()
                ->like('LOWER(r.name)', 'admin')
                ->orLike('LOWER(r.name)', 'manager')
                ->orWhere('r.scope', 'all')
                ->groupEnd();
            if ($db->fieldExists('company_id', 'users')) $builder->where('u.company_id', $companyId);
            foreach ($builder->get()->getResultArray() as $user) {
                $emails[] = $user['email'] ?? '';
            }
        }

        return array_values(array_unique(array_filter($emails, fn ($email) => filter_var($email, FILTER_VALIDATE_EMAIL))));
    }

    private function attachInlineLogo($email, string $path): string
    {
        if ($path === '') return '';
        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) return $path;

        $fallback = rtrim((string) base_url(), '/') . '/' . ltrim($path, '/');
        $local = FCPATH . ltrim($path, '/');
        if (! is_file($local) || ! is_readable($local)) return $fallback;

        if (! $email->attach($local, 'inline')) return $fallback;

        $cid = $email->setAttachmentCID($local);
        return $cid ? 'cid:' . $cid : $fallback;
    }
}
