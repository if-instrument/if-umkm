<?php

namespace App\Controllers;

use CodeIgniter\Controller;
use CodeIgniter\HTTP\CLIRequest;
use CodeIgniter\HTTP\IncomingRequest;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;
use Psr\Log\LoggerInterface;

abstract class BaseController extends Controller
{
    /**
     * @var CLIRequest|IncomingRequest
     */
    protected $request;

    protected $helpers = ['form', 'url', 'number'];

    public function initController(RequestInterface $request, ResponseInterface $response, LoggerInterface $logger): void
    {
        parent::initController($request, $response, $logger);
    }

    protected function validateScope(int $requestedCompanyId, int $requestedOutletId): void
    {
        $claims = service('request')->jwt ?? [];
        if (empty($claims)) {
            return;
        }

        if (($claims['authType'] ?? '') === 'super_admin') {
            return;
        }

        $userCompanyId = $this->numericCompanyId((string) ($claims['companyId'] ?? ''));
        if ($userCompanyId !== $requestedCompanyId) {
            throw new \RuntimeException('Akses tidak sah: Company ID tidak sesuai.', 403);
        }

        if ($requestedOutletId <= 0) {
            return;
        }

        if (($claims['authType'] ?? '') === 'company_admin') {
            $db = \Config\Database::connect();
            $builder = $db->table('outlets')
                ->where('id', $requestedOutletId)
                ->whereNotIn('status', ['inactive', '90']);
            if ($db->fieldExists('company_id', 'outlets')) {
                $builder->where('company_id', $requestedCompanyId);
            }
            $exists = $builder->countAllResults() > 0;
            if (!$exists) {
                throw new \RuntimeException('Akses tidak sah: Outlet tidak berada di bawah wewenang perusahaan Anda.', 403);
            }
            return;
        }

        $allowedOutlets = array_map(fn ($id) => (int) $id, $claims['outletIds'] ?? []);
        if (! in_array($requestedOutletId, $allowedOutlets, true)) {
            throw new \RuntimeException('Akses tidak sah: Anda tidak memiliki akses ke outlet ini.', 403);
        }
    }

    protected function renderHtmlResponse(string $html, string $inject = ''): ResponseInterface
    {
        if ($inject !== '') {
            $html = str_replace('<head>', '<head>' . $inject, $html);
        }

        // Dynamic timestamp script & stylesheet versioning to prevent browser cache issues
        $timestamp = time();
        $html = preg_replace('/(\.(?:js|css))\?v=[^"\'\s>]+/i', '$1?v=' . $timestamp, $html);

        $response = $this->response ?? response();
        return $response->setContentType('text/html')->setBody($html);
    }

    private function numericCompanyId(string $code): int
    {
        if ($code === 'company-main') {
            return 1;
        }
        if (preg_match('/^company-(\d+)$/', $code, $matches)) {
            return (int) $matches[1];
        }

        return ctype_digit($code) ? (int) $code : 0;
    }
}
