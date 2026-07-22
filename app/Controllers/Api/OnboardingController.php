<?php

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Services\OnboardingService;

class OnboardingController extends BaseController
{
    private OnboardingService $onboarding;

    public function __construct(?OnboardingService $onboarding = null)
    {
        $this->onboarding = $onboarding ?? service('onboardingService');
    }

    public function show()
    {
        try {
            $companyId = (int) ($this->request->getGet('company_id') ?: 1);
            $this->validateScope($companyId, -1);
            return $this->response->setJSON([
                'ok' => true,
                'data' => $this->onboarding->status($companyId),
            ]);
        } catch (\Throwable $exception) {
            return $this->response->setStatusCode(422)->setJSON(['ok' => false, 'message' => $exception->getMessage()]);
        }
    }
}
