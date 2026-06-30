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
}
