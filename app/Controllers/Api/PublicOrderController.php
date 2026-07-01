<?php

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Services\Api\OnlineOrderApiService;

class PublicOrderController extends BaseController
{
    public function bootstrap()
    {
        return $this->jsonAction(function () {
            return (new OnlineOrderApiService())->bootstrap($this->request->getGet());
        });
    }

    public function member()
    {
        return $this->jsonAction(function () {
            return (new OnlineOrderApiService())->member($this->request->getGet());
        });
    }

    public function submit()
    {
        return $this->jsonAction(function () {
            $payload = $this->request->getJSON(true) ?: [];
            return (new OnlineOrderApiService())->submit($payload);
        });
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
