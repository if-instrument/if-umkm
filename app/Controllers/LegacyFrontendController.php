<?php

namespace App\Controllers;

class LegacyFrontendController extends BaseController
{
    private array $pageMap = [
        'dashboard' => '/index.html',
        'login' => '/login.html',
    ];

    public function show(string $page = 'dashboard')
    {
        $target = $this->pageMap[$page] ?? '/index.html';

        return $this->response
            ->setStatusCode(302)
            ->setHeader('Location', $target);
    }

    public function dashboard() { return $this->show('dashboard'); }
    public function login() { return $this->show('login'); }

    public function tenantDashboard(string $slug)
    {
        return $this->tenantFile($slug, 'index.html');
    }

    public function tenantLogin(string $slug)
    {
        return $this->tenantFile($slug, 'login.html');
    }

    public function tenantPage(string $slug, string $path)
    {
        return $this->tenantFile($slug, 'pages/' . $path);
    }

    public function cardPayment(string $reference)
    {
        $target = realpath(FCPATH . 'pages/card-payment.html');
        if (! $target || ! is_file($target)) {
            return $this->response->setStatusCode(404)->setBody('Halaman pembayaran tidak ditemukan.');
        }
        $html = file_get_contents($target) ?: '';
        $html = str_replace('<head>', '<head><base href="/"><script>window.__PAYMENT_REFERENCE__=' . json_encode($reference) . ';</script>', $html);
        return $this->response->setContentType('text/html')->setBody($html);
    }

    public function publicOrder()
    {
        $target = realpath(FCPATH . 'pages/order.html');
        if (! $target || ! is_file($target)) {
            return $this->response->setStatusCode(404)->setBody('Halaman order tidak ditemukan.');
        }
        return $this->response->setContentType('text/html')->setBody(file_get_contents($target) ?: '');
    }

    public function tenantOrder(string $slug)
    {
        return $this->tenantFile($slug, 'pages/order.html');
    }

    public function invitation(string $token)
    {
        $target = realpath(FCPATH . 'pages/invitation.html');
        if (! $target || ! is_file($target)) {
            return $this->response->setStatusCode(404)->setBody('Halaman undangan tidak ditemukan.');
        }
        $html = file_get_contents($target) ?: '';
        $html = str_replace('<head>', '<head><base href="/"><script>window.__INVITATION_TOKEN__=' . json_encode($token) . ';</script>', $html);
        return $this->response->setContentType('text/html')->setBody($html);
    }

    public function tenantFile(string $slug, string $path)
    {
        $company = model(\App\Models\CompanyModel::class)->where('route_slug', $slug)->where('status', 'active')->first();
        if (! $company) {
            return $this->response->setStatusCode(404)->setBody('Company route tidak ditemukan.');
        }

        $target = realpath(FCPATH . ltrim($path, '/'));
        $publicRoot = realpath(FCPATH);
        if (! $target || ! str_starts_with($target, $publicRoot) || ! is_file($target) || pathinfo($target, PATHINFO_EXTENSION) !== 'html') {
            return $this->response->setStatusCode(404)->setBody('Halaman tidak ditemukan.');
        }

        $html = file_get_contents($target) ?: '';
        $html = str_replace('<head>', '<head><base href="/"><script>window.__COMPANY_SLUG__=' . json_encode($slug) . ';</script>', $html);

        return $this->response->setContentType('text/html')->setBody($html);
    }
}
