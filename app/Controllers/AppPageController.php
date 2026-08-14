<?php

namespace App\Controllers;

use App\Services\TenantDatabaseService;

class AppPageController extends BaseController
{
    private TenantDatabaseService $tenantDb;

    public function __construct(?TenantDatabaseService $tenantDb = null)
    {
        $this->tenantDb = $tenantDb ?? service('tenantDatabaseService');
    }

    public function dashboard()
    {
        return $this->renderHtml('index.html');
    }

    public function tenantDashboard(string $slug)
    {
        return $this->renderTenantHtml($slug, 'index.html');
    }

    public function page(string $path)
    {
        return $this->renderHtml('pages/' . $path);
    }

    public function tenantPage(string $slug, string $path)
    {
        return $this->renderTenantHtml($slug, 'pages/' . $path);
    }

    public function cardPayment(string $reference)
    {
        return $this->renderHtml('pages/card-payment.html', [
            '__PAYMENT_REFERENCE__' => $reference,
        ]);
    }

    public function invitation(string $token)
    {
        return $this->renderHtml('pages/invitation.html', [
            '__INVITATION_TOKEN__' => $token,
        ]);
    }

    private function renderTenantHtml(string $slug, string $path): \CodeIgniter\HTTP\ResponseInterface
    {
        $company = $this->tenantDb->companyBySlug($slug);
        if (! $company) {
            $rawCompany = $this->tenantDb->rawCompanyBySlug($slug);
            if ($rawCompany) {
                $status = (string) ($rawCompany['status'] ?? '');
                if ($status !== '10' && strtolower($status) !== 'active') {
                    return $this->renderAccessBlockedPage(
                        $rawCompany['name'] ?? 'Perusahaan',
                        'Akses Ditolak: Perusahaan Tidak Aktif',
                        'Status perusahaan ini saat ini sedang tidak aktif atau belum disetujui. Silakan hubungi Administrator Super Admin.'
                    );
                }
                if (! empty($rawCompany['expires_at'])) {
                    $expiryTime = strtotime(substr((string) $rawCompany['expires_at'], 0, 10));
                    if ($expiryTime < strtotime(date('Y-m-d'))) {
                        return $this->renderAccessBlockedPage(
                            $rawCompany['name'] ?? 'Perusahaan',
                            'Akses Ditolak: Masa Aktif Lisensi Kadaluarsa',
                            'Masa berlaku lisensi perusahaan ini telah berakhir pada ' . date('d-m-Y', $expiryTime) . '. Silakan hubungi Super Admin untuk memperbarui langganan SaaS Anda.'
                        );
                    }
                }
            }
            return $this->response->setStatusCode(404)->setBody('Company route tidak ditemukan.');
        }

        return $this->renderHtml($path, [
            '__COMPANY_SLUG__' => (string) ($company['route_slug'] ?? $slug),
        ]);
    }

    private function renderAccessBlockedPage(string $companyName, string $title, string $message): \CodeIgniter\HTTP\ResponseInterface
    {
        $html = '<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: "Plus Jakarta Sans", sans-serif; }
        body { background: #f8fafc; color: #1e293b; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
        .card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); max-width: 480px; width: 100%; padding: 32px; text-align: center; }
        .icon-box { width: 64px; height: 64px; background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 28px; }
        .company-tag { background: #f1f5f9; color: #475569; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 20px; display: inline-block; margin-bottom: 12px; }
        h1 { font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 10px; }
        p { font-size: 14px; color: #64748b; line-height: 1.6; margin-bottom: 24px; }
        .btn { display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 10px 20px; border-radius: 8px; transition: all 0.2s; }
        .btn:hover { background: #1d4ed8; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon-box">🔒</div>
        <span class="company-tag">' . htmlspecialchars($companyName, ENT_QUOTES, 'UTF-8') . '</span>
        <h1>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</h1>
        <p>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p>
        <a href="/" class="btn">Kembali ke Portal Utama</a>
    </div>
</body>
</html>';

        return $this->response->setStatusCode(403)->setBody($html);
    }

    private function renderHtml(string $path, array $globals = []): \CodeIgniter\HTTP\ResponseInterface
    {
        $target = realpath(FCPATH . ltrim($path, '/'));
        $publicRoot = realpath(FCPATH);
        if (! $target || ! $publicRoot || ! str_starts_with($target, $publicRoot) || ! is_file($target) || pathinfo($target, PATHINFO_EXTENSION) !== 'html') {
            return $this->response->setStatusCode(404)->setBody('Halaman tidak ditemukan.');
        }

        $inject = '<base href="/">';
        foreach ($globals as $name => $value) {
            $inject .= '<script>window.' . $name . '=' . json_encode($value) . ';</script>';
        }

        $html = file_get_contents($target) ?: '';
        return $this->renderHtmlResponse($html, $inject);
    }
}
