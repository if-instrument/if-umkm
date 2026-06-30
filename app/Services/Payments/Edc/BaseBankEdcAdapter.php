<?php

namespace App\Services\Payments\Edc;

abstract class BaseBankEdcAdapter implements EdcTerminalAdapter
{
    protected string $bankCode = 'EDC';

    public function authorize(array $method, float $amount, string $reference, string $orderNo): array
    {
        $terminalId = trim((string) ($method['terminal_id'] ?? ''));
        $merchantId = trim((string) ($method['merchant_id'] ?? ''));
        $serial = trim((string) ($method['terminal_serial'] ?? ''));
        $connectorStatus = trim((string) ($method['connector_status'] ?? 'not_configured'));
        $target = 'edc://' . strtolower($this->bankCode) . '/' . ($terminalId ?: 'unassigned');
        $request = [
            'bank' => $this->bankCode,
            'merchantId' => $merchantId,
            'terminalId' => $terminalId,
            'terminalSerial' => $serial,
            'reference' => $reference,
            'orderNo' => $orderNo,
            'amount' => $amount,
        ];

        if ($connectorStatus !== 'ready' || $merchantId === '' || $terminalId === '' || $serial === '') {
            return [
                'ok' => false,
                'status' => 'not_configured',
                'message' => 'Connector EDC ' . $this->bankCode . ' belum lengkap. Lengkapi merchant ID, terminal ID, serial mesin, dan status connector.',
                'target' => $target,
                'httpMethod' => 'TERMINAL',
                'httpStatus' => null,
                'requestPayload' => $request,
                'responsePayload' => [
                    'status' => 'not_configured',
                    'bank' => $this->bankCode,
                    'required' => ['merchantId', 'terminalId', 'terminalSerial', 'connectorStatus=ready'],
                ],
            ];
        }

        return [
            'ok' => false,
            'status' => 'connector_not_implemented',
            'message' => 'Konfigurasi EDC ' . $this->bankCode . ' sudah siap, tetapi host/API terminal bank belum dihubungkan.',
            'target' => $target,
            'httpMethod' => 'TERMINAL',
            'httpStatus' => null,
            'requestPayload' => $request,
            'responsePayload' => [
                'status' => 'connector_not_implemented',
                'bank' => $this->bankCode,
                'nextStep' => 'Hubungkan connector vendor terminal atau API host acquirer bank.',
            ],
        ];
    }
}
