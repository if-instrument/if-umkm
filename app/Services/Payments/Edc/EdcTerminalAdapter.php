<?php

namespace App\Services\Payments\Edc;

interface EdcTerminalAdapter
{
    public function authorize(array $method, float $amount, string $reference, string $orderNo): array;
}
