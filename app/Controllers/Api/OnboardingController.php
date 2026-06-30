<?php

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Services\OnboardingService;

class OnboardingController extends BaseController
{
    public function show()
    {
        try {
            return $this->response->setJSON([
                'ok' => true,
                'data' => (new OnboardingService())->status((int) ($this->request->getGet('company_id') ?: 1)),
            ]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }
}
