<?php

namespace App\Services;

use App\Models\PaymentMethodModel;
use App\Models\PaymentTransactionLogModel;
use App\Models\PaymentTransactionModel;
use App\Services\Payments\Edc\BcaEdcAdapter;
use App\Services\Payments\Edc\BniEdcAdapter;
use App\Services\Payments\Edc\BriEdcAdapter;
use App\Services\Payments\Edc\EdcTerminalAdapter;
use App\Services\Payments\Edc\MandiriEdcAdapter;
use Config\Database;

class PaymentGatewayService
{
    private PaymentTransactionModel $transactions;
    private PaymentTransactionLogModel $transactionLogs;
    private const XENDIT_PAYMENT_REQUEST_URL = 'https://api.xendit.co/v3/payment_requests';
    private const XENDIT_INVOICE_URL = 'https://api.xendit.co/v2/invoices';
    private const XENDIT_API_VERSION = '2024-11-11';
    private const MIDTRANS_SANDBOX_CHARGE_URL = 'https://api.sandbox.midtrans.com/v2/charge';
    private const MIDTRANS_PRODUCTION_CHARGE_URL = 'https://api.midtrans.com/v2/charge';
    private const MIDTRANS_SANDBOX_SNAP_URL = 'https://app.sandbox.midtrans.com/snap/v1/transactions';
    private const MIDTRANS_PRODUCTION_SNAP_URL = 'https://app.midtrans.com/snap/v1/transactions';

    public function __construct()
    {
        $this->transactions = new PaymentTransactionModel();
        $this->transactionLogs = new PaymentTransactionLogModel();
    }

    public function create(array $payload, int $companyId, int $outletId): array
    {
        $methodId = $this->numericId($payload['paymentMethodId'] ?? $payload['payment_method_id'] ?? '');
        $method = $methodId ? (new PaymentMethodModel())->find($methodId) : null;
        if (! $method || ! $this->rowBelongsToCompany($method, $companyId) || (int) $method['outlet_id'] !== $outletId || $method['status'] !== 'active') {
            throw new \InvalidArgumentException('Metode bayar tidak ditemukan atau tidak aktif.');
        }

        $amount = (float) ($payload['amount'] ?? 0);
        if ($amount <= 0) {
            throw new \InvalidArgumentException('Nominal payment wajib lebih dari 0.');
        }

        $type = $method['type'] ?: 'other';
        if (! in_array($type, ['qris', 'card'], true)) {
            throw new \InvalidArgumentException('Payment request third party hanya untuk QRIS dinamis atau EDC.');
        }

        $orderNo = trim((string) ($payload['orderNumber'] ?? $payload['order_no'] ?? 'POS-' . date('YmdHis')));
        $gatewaySettings = $this->gatewaySettings($companyId, $outletId);
        $provider = $this->gatewayProvider($gatewaySettings, $type, $method);
        $reference = strtoupper($provider) . '-' . strtoupper($type) . '-' . date('YmdHis') . '-' . random_int(1000, 9999);
        $feeAmount = array_key_exists('paymentFeeAmount', $payload)
            ? (float) $payload['paymentFeeAmount']
            : ($amount * ((float) $method['fee_rate'] / 100));
        $gateway = $this->createGatewayPayment($provider, $type, $method, $gatewaySettings, $reference, $amount, $orderNo);
        $initialStatus = $this->initialTransactionStatus((string) ($gateway['responsePayload']['status'] ?? 'pending'));

        $id = (int) $this->transactions->insert($this->withCompanyData('payment_transactions', [
            'company_id' => $companyId,
            'outlet_id' => $outletId,
            'order_id' => $this->numericId($payload['orderId'] ?? $payload['order_id'] ?? null),
            'order_no' => $orderNo,
            'payment_method_id' => $methodId,
            'method_name' => $method['name'],
            'method_type' => $type,
            'provider' => $provider,
            'provider_reference' => $gateway['reference'] ?: $reference,
            'amount' => $amount,
            'fee_amount' => $feeAmount,
            'status' => $initialStatus,
            'qr_payload' => $gateway['qrPayload'] ?: null,
            'edc_instruction' => $gateway['edcInstruction'] ?: null,
            'request_payload' => json_encode([
                'posPayload' => $payload,
                'gatewayPayload' => $gateway['requestPayload'],
            ]),
            'response_payload' => json_encode($gateway['responsePayload']),
        ], $companyId));
        $this->writeGatewayLogs($id, $companyId, $outletId, $gateway['logs'] ?? [[
            'direction' => 'internal',
            'action' => 'create_payment_transaction',
            'target' => '/api/payment-transaction',
            'httpMethod' => 'POST',
            'httpStatus' => null,
            'status' => $gateway['responsePayload']['status'] ?? 'pending',
            'requestPayload' => [
                'posPayload' => $payload,
                'gatewayPayload' => $gateway['requestPayload'],
            ],
            'responsePayload' => $gateway['responsePayload'],
            'errorMessage' => $gateway['responsePayload']['error'] ?? null,
        ]]);

        return $this->transactionPayload($this->transactions->find($id));
    }

    public function status(string $legacyId, int $companyId, int $outletId): array
    {
        $row = $this->transactionRow($legacyId, $companyId, $outletId);
        if ($row['provider'] === 'midtrans' && $row['status'] === 'pending') {
            $row = $this->syncMidtransTransaction($row);
        }
        return $this->transactionPayload($row);
    }

    public function logPage(int $companyId, array $filters = []): array
    {
        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = min(100, max(10, (int) ($filters['per_page'] ?? $filters['perPage'] ?? 25)));
        $builder = $this->transactions;
        if ($this->hasCompanyColumn('payment_transactions')) {
            $builder->where('company_id', $companyId);
        }
        if (! empty($filters['outlet_id'])) {
            $builder->where('outlet_id', (int) $filters['outlet_id']);
        }
        if (! empty($filters['provider'])) {
            $builder->where('provider', $filters['provider']);
        }
        if (! empty($filters['status'])) {
            $builder->where('status', $filters['status']);
        }
        if (! empty($filters['q'])) {
            $q = trim((string) $filters['q']);
            $builder->groupStart()
                ->like('order_no', $q)
                ->orLike('provider_reference', $q)
                ->orLike('method_name', $q)
                ->groupEnd();
        }
        $total = (clone $builder)->countAllResults();
        $rows = $builder
            ->orderBy('id', 'DESC')
            ->findAll($perPage, ($page - 1) * $perPage);

        return [
            'items' => array_map(fn ($row) => $this->logPayload($row), $rows),
            'meta' => [
                'page' => $page,
                'perPage' => $perPage,
                'total' => $total,
                'totalPages' => max(1, (int) ceil($total / $perPage)),
            ],
        ];
    }

    public function publicCardPayment(string $reference): array
    {
        $row = $this->transactions->where('provider_reference', $reference)->where('method_type', 'card')->first();
        if (! $row) {
            throw new \InvalidArgumentException('Transaksi kartu tidak ditemukan.');
        }
        $company = Database::connect()->table('companies')->where('id', (int) ($row['company_id'] ?? 1))->get()->getRowArray() ?: [];
        $outlet = Database::connect()->table('outlets')->where('id', (int) $row['outlet_id'])->get()->getRowArray() ?: [];
        $payload = $this->transactionPayload($row);
        return [
            'reference' => $payload['reference'],
            'orderNo' => $payload['orderNo'],
            'amount' => $payload['amount'],
            'status' => $payload['status'],
            'provider' => $payload['provider'],
            'mode' => $payload['paymentGatewayMode'],
            'hostedPaymentUrl' => $payload['hostedPaymentUrl'] ?? '',
            'companyName' => $company['name'] ?? 'IF Instrument',
            'outletName' => $outlet['name'] ?? 'Outlet',
            'message' => ($payload['hostedPaymentUrl'] ?? '')
                ? 'Isi detail kartu di halaman aman ' . ucfirst((string) $payload['provider']) . '. Data kartu tidak diproses langsung oleh server POS.'
                : 'Hosted card page gateway belum tersedia. Pastikan secret key provider aktif benar dan payment request berhasil dibuat.',
        ];
    }

    public function syncPublicCardPayment(string $reference): array
    {
        $row = $this->transactions->where('provider_reference', $reference)->where('method_type', 'card')->first();
        if (! $row) {
            throw new \InvalidArgumentException('Transaksi kartu tidak ditemukan.');
        }
        if (! in_array($row['provider'], ['xendit', 'midtrans'], true)) {
            return $this->publicCardPayment($reference);
        }

        if ($row['provider'] === 'midtrans') {
            return $this->syncMidtransCardPayment($row, $reference);
        }

        $responsePayload = json_decode($row['response_payload'] ?? '{}', true) ?: [];
        $invoiceId = (string) ($responsePayload['xenditInvoiceId'] ?? ($responsePayload['raw']['id'] ?? ''));
        if ($invoiceId === '') {
            return $this->publicCardPayment($reference);
        }

        $settings = $this->gatewaySettings((int) ($row['company_id'] ?? 1), (int) $row['outlet_id']);
        $secret = $this->credential('XENDIT_SECRET_KEY', $settings['xenditSecretKey'] ?? '');
        if ($secret === '') {
            throw new \InvalidArgumentException('XENDIT_SECRET_KEY belum diisi.');
        }

        $target = self::XENDIT_INVOICE_URL . '/' . rawurlencode($invoiceId);
        $gatewayResponse = $this->getJson($target, 'Basic ' . base64_encode($secret . ':'), (int) ($settings['timeout'] ?? 15));
        $body = $gatewayResponse['body'];
        $status = $gatewayResponse['ok'] ? $this->xenditInvoiceStatus((string) ($body['status'] ?? '')) : 'pending';
        $responsePayload['rawSync'] = $body;
        $responsePayload['syncHttpStatus'] = $gatewayResponse['status'];
        $responsePayload['syncError'] = $gatewayResponse['error'];
        if ($status !== 'pending') {
            $responsePayload['status'] = $status;
        }

        $update = ['response_payload' => json_encode($responsePayload)];
        if ($status !== 'pending') {
            $update['status'] = $status;
        }
        if ($status === 'paid') {
            $update['paid_at'] = date('Y-m-d H:i:s');
        }
        $this->transactions->update((int) $row['id'], $update);
        $this->writeGatewayLog((int) $row['id'], (int) ($row['company_id'] ?? 1), (int) $row['outlet_id'], $this->httpLog('sync_xendit_card_invoice', $target, ['reference' => $reference, 'invoiceId' => $invoiceId], $gatewayResponse, 'GET'));

        return $this->publicCardPayment($reference);
    }

    public function confirm(string $legacyId, int $companyId, int $outletId): array
    {
        $row = $this->transactionRow($legacyId, $companyId, $outletId);
        if ($row['status'] !== 'paid') {
            if (in_array($row['provider'], ['xendit', 'midtrans'], true)) {
                throw new \InvalidArgumentException('Pembayaran online harus dikonfirmasi oleh status atau webhook gateway.');
            }
            $this->transactions->update((int) $row['id'], [
                'status' => 'paid',
                'paid_at' => date('Y-m-d H:i:s'),
                'response_payload' => json_encode([
                    'provider' => $row['provider'],
                    'reference' => $row['provider_reference'],
                    'status' => 'paid',
                    'confirmedBy' => 'cashier_offline_confirmation',
                ]),
            ]);
            $this->writeGatewayLog((int) $row['id'], (int) ($row['company_id'] ?? 1), (int) $row['outlet_id'], [
                'direction' => 'internal',
                'action' => 'confirm_offline_payment',
                'target' => '/api/payment-transaction/' . $legacyId . '/confirm',
                'httpMethod' => 'PUT',
                'status' => 'paid',
                'requestPayload' => ['paymentTransactionId' => $legacyId],
                'responsePayload' => ['status' => 'paid', 'confirmedBy' => 'cashier_offline_confirmation'],
            ]);
        }
        return $this->transactionPayload($this->transactions->find((int) $row['id']));
    }

    public function cancel(string $legacyId, int $companyId, int $outletId): array
    {
        $row = $this->transactionRow($legacyId, $companyId, $outletId);
        if ($row['status'] === 'pending') {
            $this->transactions->update((int) $row['id'], ['status' => 'cancelled']);
            $this->writeGatewayLog((int) $row['id'], (int) ($row['company_id'] ?? 1), (int) $row['outlet_id'], [
                'direction' => 'internal',
                'action' => 'cancel_payment_transaction',
                'target' => '/api/payment-transaction/' . $legacyId . '/cancel',
                'httpMethod' => 'PUT',
                'status' => 'cancelled',
                'requestPayload' => ['paymentTransactionId' => $legacyId],
                'responsePayload' => ['status' => 'cancelled'],
            ]);
        }
        return $this->transactionPayload($this->transactions->find((int) $row['id']));
    }

    public function handleXenditWebhook(array $payload): array
    {
        $event = (string) ($payload['event'] ?? '');
        $data = $payload['data'] ?? [];
        $paymentReference = (string) ($data['payment_request_id'] ?? $data['external_id'] ?? $payload['external_id'] ?? '');
        if ($paymentReference === '') {
            throw new \InvalidArgumentException('Webhook Xendit tidak memiliki payment reference.');
        }
        $row = $this->transactions->where('provider', 'xendit')->where('provider_reference', $paymentReference)->first();
        if (! $row) {
            throw new \InvalidArgumentException('Payment transaction Xendit tidak ditemukan.');
        }
        $status = $this->xenditWebhookStatus($event, (string) ($data['status'] ?? $payload['status'] ?? ''));
        $response = json_decode($row['response_payload'] ?? '{}', true) ?: [];
        $response['provider'] = 'xendit';
        $response['reference'] = $paymentReference;
        $response['status'] = $status;
        $response['webhookEvent'] = $event;
        $response['webhookPayload'] = $payload;
        $response['simulated'] = (bool) ($data['metadata']['simulation'] ?? false);
        $update = [
            'status' => $status,
            'response_payload' => json_encode($response),
        ];
        if ($status === 'paid') {
            $captureTime = $data['captures'][0]['capture_timestamp'] ?? null;
            $update['paid_at'] = $captureTime ? date('Y-m-d H:i:s', strtotime((string) $captureTime)) : date('Y-m-d H:i:s');
        }
        $this->transactions->update((int) $row['id'], $update);
        $this->writeGatewayLog((int) $row['id'], (int) ($row['company_id'] ?? 1), (int) $row['outlet_id'], [
            'direction' => 'inbound',
            'action' => $event ?: 'xendit_webhook',
            'target' => '/api/webhook/xendit',
            'httpMethod' => 'POST',
            'status' => $status,
            'requestPayload' => $payload,
            'responsePayload' => $response,
        ]);
        return $this->transactionPayload($this->transactions->find((int) $row['id']));
    }

    public function attachOrder(string $legacyId, int $orderId, int $companyId, int $outletId): void
    {
        if (! $legacyId) return;
        $row = $this->transactionRow($legacyId, $companyId, $outletId);
        $this->transactions->update((int) $row['id'], ['order_id' => $orderId]);
    }

    private function transactionRow(string $legacyId, int $companyId, int $outletId): array
    {
        $id = $this->numericId($legacyId);
        $row = $id ? $this->transactions->find($id) : null;
        if (! $row || ! $this->rowBelongsToCompany($row, $companyId) || (int) $row['outlet_id'] !== $outletId) {
            throw new \InvalidArgumentException('Transaksi payment tidak ditemukan.');
        }
        return $row;
    }

    private function transactionPayload(array $row): array
    {
        $qrPayload = $row['qr_payload'] ?: '';
        $qrPayloadValid = $this->isValidQrisPayload($qrPayload);
        $response = json_decode($row['response_payload'] ?? '{}', true) ?: [];
        $method = ! empty($row['payment_method_id']) ? (new PaymentMethodModel())->find((int) $row['payment_method_id']) : null;
        $qrisMode = $row['method_type'] === 'qris' ? ($method['qris_mode'] ?? ($row['provider'] === 'manual_qris' ? 'offline' : 'online')) : '';
        $cardActionUrl = (string) ($response['actionUrl'] ?? '') ?: $this->xenditActionUrl($response['raw'] ?? []);
        return [
            'id' => 'paytxn-' . $row['id'],
            'orderNo' => $row['order_no'],
            'methodName' => $row['method_name'],
            'methodType' => $row['method_type'],
            'provider' => $row['provider'],
            'reference' => $row['provider_reference'],
            'amount' => (float) $row['amount'],
            'feeAmount' => (float) $row['fee_amount'],
            'status' => $row['status'],
            'qrPayload' => $qrPayload,
            'qrPayloadValid' => $qrPayloadValid,
            'qrPayloadKind' => $qrPayloadValid ? 'qris-emv' : ($qrPayload ? 'provider-placeholder' : ''),
            'qrPayloadMessage' => $qrPayloadValid
                ? 'Payload QRIS valid dan siap discan.'
                : ($qrPayload ? 'Provider mengirim payload non-QRIS untuk mode sandbox/testing. Payload ini tidak bisa discan aplikasi pembayaran.' : ''),
            'qrisMode' => $qrisMode,
            'qrisImageUrl' => $qrisMode === 'offline' ? ($method['qris_image_path'] ?? '') : '',
            'edcInstruction' => $row['edc_instruction'] ?: '',
            'cardActionUrl' => $cardActionUrl,
            'hostedPaymentUrl' => (string) ($response['hostedPaymentUrl'] ?? $response['invoiceUrl'] ?? ''),
            'cardActionType' => $cardActionUrl ? 'redirect' : '',
            'cardActionMessage' => $cardActionUrl
                ? 'Buka halaman otorisasi kartu dari ' . ucfirst((string) $row['provider']) . '. Status pembayaran akan diperbarui otomatis.'
                : ($row['method_type'] === 'card' ? ($row['edc_instruction'] ?: 'Menunggu konfirmasi kartu/EDC dari gateway.') : ''),
            'paymentGatewayMode' => (string) ($this->responseValue($row, 'mode') ?: ''),
            'simulated' => (bool) ($this->responseValue($row, 'simulated') ?: false),
            'errorMessage' => (string) ($response['configurationRequired'] ?? $response['error'] ?? ''),
            'paidAt' => $row['paid_at'] ?: '',
        ];
    }

    private function logPayload(array $row): array
    {
        $response = json_decode($row['response_payload'] ?? '{}', true) ?: [];
        $detailLogs = $this->transactionLogs
            ->where('payment_transaction_id', (int) $row['id'])
            ->orderBy('id', 'ASC')
            ->findAll();
        return [
            'id' => 'paytxn-' . $row['id'],
            'companyId' => 'company-' . ($row['company_id'] ?? 1),
            'outletId' => 'outlet-' . $row['outlet_id'],
            'orderNo' => $row['order_no'],
            'methodName' => $row['method_name'],
            'methodType' => $row['method_type'],
            'provider' => $row['provider'],
            'reference' => $row['provider_reference'],
            'amount' => (float) $row['amount'],
            'feeAmount' => (float) $row['fee_amount'],
            'status' => $row['status'],
            'mode' => (string) ($response['mode'] ?? ''),
            'httpStatus' => $response['httpStatus'] ?? '',
            'webhookEvent' => $response['webhookEvent'] ?? '',
            'simulated' => (bool) ($response['simulated'] ?? false),
            'qrPayloadValid' => $this->isValidQrisPayload((string) ($row['qr_payload'] ?? '')),
            'paidAt' => $row['paid_at'] ?: '',
            'createdAt' => $row['created_at'] ?: '',
            'detailLogs' => array_map(fn ($log) => $this->detailLogPayload($log), $detailLogs),
        ];
    }

    private function detailLogPayload(array $row): array
    {
        return [
            'id' => 'paylog-' . $row['id'],
            'direction' => $row['direction'],
            'action' => $row['action'],
            'target' => $row['target'],
            'httpMethod' => $row['http_method'],
            'httpStatus' => $row['http_status'] !== null ? (int) $row['http_status'] : null,
            'status' => $row['status'] ?? '',
            'errorMessage' => $row['error_message'] ?? '',
            'requestPayload' => json_decode($row['request_payload'] ?: '{}', true) ?: [],
            'responsePayload' => json_decode($row['response_payload'] ?: '{}', true) ?: [],
            'createdAt' => $row['created_at'] ?: '',
        ];
    }

    private function qrisPayload(string $reference, float $amount, string $orderNo): string
    {
        return 'QRIS-DYNAMIC|REF=' . $reference . '|ORDER=' . $orderNo . '|AMOUNT=' . number_format($amount, 2, '.', '');
    }

    private function createGatewayPayment(string $provider, string $type, array $method, array $settings, string $reference, float $amount, string $orderNo): array
    {
        if ($type === 'qris' && $provider === 'xendit') {
            return $this->createXenditQris($method, $settings, $reference, $amount, $orderNo);
        }
        if ($type === 'card' && $provider === 'xendit') {
            return $this->createXenditCard($method, $settings, $reference, $amount, $orderNo);
        }
        if ($type === 'qris' && $provider === 'midtrans') {
            return $this->createMidtransQris($method, $settings, $reference, $amount, $orderNo);
        }
        if ($type === 'card' && $provider === 'midtrans') {
            return $this->createMidtransCard($method, $settings, $reference, $amount, $orderNo);
        }
        if ($type === 'card' && $provider === 'manual_edc' && ($method['edc_mode'] ?? 'manual') === 'integrated') {
            return $this->createIntegratedEdcPayment($provider, $method, $settings, $reference, $amount, $orderNo);
        }
        return $this->offlineGatewayResponse($provider, $type, $method, $settings, $reference, $amount, $orderNo);
    }

    private function createIntegratedEdcPayment(string $provider, array $method, array $settings, string $reference, float $amount, string $orderNo): array
    {
        $adapter = $this->edcAdapter((string) ($method['channel_code'] ?? ''));
        if (! $adapter) {
            return $this->offlineGatewayResponse($provider, 'card', $method, $settings, $reference, $amount, $orderNo, [
                'edcMode' => 'integrated',
                'fallbackReason' => 'Bank acquirer belum didukung connector terminal.',
                'connectorStatus' => $method['connector_status'] ?? 'not_configured',
            ]);
        }

        $result = $adapter->authorize($method, $amount, $reference, $orderNo);
        if ($result['ok'] ?? false) {
            return [
                'reference' => (string) ($result['reference'] ?? $reference),
                'qrPayload' => null,
                'edcInstruction' => null,
                'requestPayload' => $result['requestPayload'] ?? [],
                'responsePayload' => [
                    'provider' => $provider,
                    'channel' => $method['channel_code'] ?? '',
                    'terminal' => $method['terminal_id'] ?? '',
                    'edcMode' => 'integrated',
                    'reference' => (string) ($result['reference'] ?? $reference),
                    'status' => $result['status'] ?? 'pending',
                    'mode' => $settings['mode'] ?? 'sandbox',
                    'raw' => $result['responsePayload'] ?? [],
                ],
                'logs' => [$this->edcTerminalLog($result)],
            ];
        }

        $fallback = $this->offlineGatewayResponse($provider, 'card', $method, $settings, $reference, $amount, $orderNo, [
            'edcMode' => 'integrated',
            'fallbackReason' => $result['message'] ?? 'Connector terminal EDC belum tersedia.',
            'connectorStatus' => $method['connector_status'] ?? 'not_configured',
            'integratedAttempt' => $result['responsePayload'] ?? [],
        ]);
        $fallback['logs'] = array_merge([$this->edcTerminalLog($result)], $fallback['logs']);
        return $fallback;
    }

    private function createXenditQris(array $method, array $settings, string $reference, float $amount, string $orderNo): array
    {
        $payload = [
            'reference_id' => $reference,
            'type' => 'PAY',
            'country' => 'ID',
            'currency' => 'IDR',
            'request_amount' => (int) round($amount),
            'capture_method' => 'AUTOMATIC',
            'channel_code' => 'QRIS',
            'channel_properties' => (object) [],
            'description' => 'POS Order ' . $orderNo,
            'metadata' => [
                'order_no' => $orderNo,
                'payment_method_id' => (string) ($method['id'] ?? ''),
                'outlet_terminal' => (string) ($method['terminal_id'] ?? ''),
            ],
        ];
        $secret = $this->credential('XENDIT_SECRET_KEY', $settings['xenditSecretKey'] ?? '');
        if ($secret === '') {
            return [
                'reference' => $reference,
                'qrPayload' => null,
                'edcInstruction' => null,
                'requestPayload' => $payload,
                'responsePayload' => [
                    'provider' => 'xendit',
                    'reference' => $reference,
                    'status' => 'failed',
                    'configurationRequired' => 'XENDIT_SECRET_KEY belum diisi.',
                    'mode' => $settings['mode'] ?? 'sandbox',
                ],
                'logs' => [[
                    'direction' => 'outbound',
                    'action' => 'create_xendit_qris_payment_request',
                    'target' => self::XENDIT_PAYMENT_REQUEST_URL,
                    'httpMethod' => 'POST',
                    'status' => 'configuration_required',
                    'requestPayload' => $payload,
                    'responsePayload' => ['configurationRequired' => 'XENDIT_SECRET_KEY belum diisi.'],
                    'errorMessage' => 'XENDIT_SECRET_KEY belum diisi.',
                ]],
            ];
        }

        $response = $this->postJson(self::XENDIT_PAYMENT_REQUEST_URL, $payload, 'Basic ' . base64_encode($secret . ':'), (int) ($settings['timeout'] ?? 15), [
            'api-version: ' . self::XENDIT_API_VERSION,
        ]);
        $body = $response['body'];
        $qrPayload = $this->xenditPresentedQr($body) ?: $this->qrisPayload($reference, $amount, $orderNo);
        $providerReference = $body['payment_request_id'] ?? $body['id'] ?? $body['reference_id'] ?? $reference;
        return [
            'reference' => $providerReference,
            'qrPayload' => $qrPayload,
            'edcInstruction' => null,
            'requestPayload' => $payload,
            'responsePayload' => [
                'provider' => 'xendit',
                'status' => $response['ok'] ? $this->xenditLocalStatus((string) ($body['status'] ?? 'REQUIRES_ACTION')) : 'fallback_pending',
                'httpStatus' => $response['status'],
                'reference' => $providerReference,
                'raw' => $body,
                'error' => $response['error'],
            ],
            'logs' => [$this->httpLog('create_xendit_qris_payment_request', self::XENDIT_PAYMENT_REQUEST_URL, $payload, $response)],
        ];
    }

    private function createXenditCard(array $method, array $settings, string $reference, float $amount, string $orderNo): array
    {
        return $this->xenditCustomerCardLink($method, $settings, $reference, $amount, $orderNo);
    }

    private function xenditCustomerCardLink(array $method, array $settings, string $reference, float $amount, string $orderNo): array
    {
        $target = $this->customerCardUrl($reference);
        $secret = $this->credential('XENDIT_SECRET_KEY', $settings['xenditSecretKey'] ?? '');
        $payload = [
            'external_id' => $reference,
            'amount' => (int) round($amount),
            'currency' => 'IDR',
            'description' => 'POS Online Card Order ' . $orderNo,
            'success_redirect_url' => $this->customerCardUrl($reference) . '?result=success',
            'failure_redirect_url' => $this->customerCardUrl($reference) . '?result=failed',
            'payment_methods' => ['CREDIT_CARD'],
            'fees' => [],
            'customer' => [
                'given_names' => 'POS Customer',
            ],
        ];
        if ($secret === '') {
            return [
                'reference' => $reference,
                'qrPayload' => null,
                'edcInstruction' => 'Minta pelanggan scan QR pembayaran kartu: ' . $target,
                'requestPayload' => $payload,
                'responsePayload' => [
                    'provider' => 'xendit',
                    'status' => 'pending',
                    'reference' => $reference,
                    'actionUrl' => $target,
                    'hostedPaymentUrl' => '',
                    'mode' => $settings['mode'] ?? 'sandbox',
                    'integration' => 'customer_card_page',
                    'configurationRequired' => 'XENDIT_SECRET_KEY belum diisi.',
                    'note' => 'Halaman customer siap, tetapi hosted card page Xendit belum dibuat karena secret key kosong.',
                ],
                'logs' => [[
                    'direction' => 'internal',
                    'action' => 'create_customer_card_payment_page_without_gateway',
                    'target' => $target,
                    'httpMethod' => 'LOCAL',
                    'httpStatus' => null,
                    'status' => 'configuration_required',
                    'requestPayload' => $payload,
                    'responsePayload' => ['actionUrl' => $target, 'configurationRequired' => 'XENDIT_SECRET_KEY belum diisi.'],
                    'errorMessage' => 'XENDIT_SECRET_KEY belum diisi.',
                ]],
            ];
        }

        $response = $this->postJson(self::XENDIT_INVOICE_URL, $payload, 'Basic ' . base64_encode($secret . ':'), (int) ($settings['timeout'] ?? 15));
        $body = $response['body'];
        $hostedUrl = (string) ($body['invoice_url'] ?? '');

        return [
            'reference' => $reference,
            'qrPayload' => null,
            'edcInstruction' => 'Minta pelanggan scan QR pembayaran kartu: ' . $target,
            'requestPayload' => $payload,
            'responsePayload' => [
                'provider' => 'xendit',
                'status' => $response['ok'] ? 'pending' : 'failed',
                'httpStatus' => $response['status'],
                'reference' => $reference,
                'xenditInvoiceId' => $body['id'] ?? '',
                'actionUrl' => $target,
                'hostedPaymentUrl' => $hostedUrl,
                'mode' => $settings['mode'] ?? 'sandbox',
                'integration' => 'xendit_hosted_card_invoice',
                'raw' => $body,
                'error' => $response['error'],
                'note' => $hostedUrl
                    ? 'Customer scan halaman POS lalu diarahkan ke hosted payment page Xendit untuk mengisi detail kartu.'
                    : 'Xendit belum mengembalikan hosted card URL.',
            ],
            'logs' => [
                $this->httpLog('create_xendit_card_hosted_invoice', self::XENDIT_INVOICE_URL, $payload, $response),
                [
                    'direction' => 'internal',
                    'action' => 'create_customer_card_payment_page',
                    'target' => $target,
                    'httpMethod' => 'LOCAL',
                    'httpStatus' => null,
                    'status' => $response['ok'] ? 'pending' : 'failed',
                    'requestPayload' => ['reference' => $reference, 'hostedPaymentUrl' => $hostedUrl],
                    'responsePayload' => ['actionUrl' => $target, 'integration' => 'xendit_hosted_card_invoice'],
                    'errorMessage' => $response['error'],
                ],
            ],
        ];
    }

    private function createXenditCardRequestWithCardDetails(array $method, array $settings, string $reference, float $amount, string $orderNo, array $cardDetails): array
    {
        $payload = [
            'reference_id' => $reference,
            'type' => 'PAY',
            'country' => 'ID',
            'currency' => 'IDR',
            'request_amount' => (int) round($amount),
            'capture_method' => 'AUTOMATIC',
            'channel_code' => 'CARDS',
            'channel_properties' => [
                'card_details' => $cardDetails,
                'success_return_url' => $this->returnUrl('payment-success', $orderNo),
                'failure_return_url' => $this->returnUrl('payment-failed', $orderNo),
            ],
            'description' => 'POS Card Order ' . $orderNo,
            'metadata' => [
                'order_no' => $orderNo,
                'payment_method_id' => (string) ($method['id'] ?? ''),
                'outlet_terminal' => (string) ($method['terminal_id'] ?? ''),
                'integration' => 'cards_payment_request',
            ],
        ];
        $secret = $this->credential('XENDIT_SECRET_KEY', $settings['xenditSecretKey'] ?? '');
        if ($secret === '') {
            return [
                'reference' => $reference,
                'qrPayload' => null,
                'edcInstruction' => 'Xendit Cards belum aktif karena secret key belum diisi. Lengkapi gateway di Pengaturan.',
                'requestPayload' => $payload,
                'responsePayload' => [
                    'provider' => 'xendit',
                    'reference' => $reference,
                    'status' => 'fallback_pending',
                    'configurationRequired' => 'XENDIT_SECRET_KEY belum diisi.',
                    'mode' => $settings['mode'] ?? 'sandbox',
                ],
                'logs' => [[
                    'direction' => 'outbound',
                    'action' => 'create_xendit_card_payment_request',
                    'target' => self::XENDIT_PAYMENT_REQUEST_URL,
                    'httpMethod' => 'POST',
                    'httpStatus' => null,
                    'status' => 'configuration_required',
                    'requestPayload' => $payload,
                    'responsePayload' => ['configurationRequired' => 'XENDIT_SECRET_KEY belum diisi.'],
                    'errorMessage' => 'XENDIT_SECRET_KEY belum diisi.',
                ]],
            ];
        }

        $response = $this->postJson(self::XENDIT_PAYMENT_REQUEST_URL, $payload, 'Basic ' . base64_encode($secret . ':'), (int) ($settings['timeout'] ?? 15), [
            'api-version: ' . self::XENDIT_API_VERSION,
        ]);
        $body = $response['body'];
        $providerReference = $body['payment_request_id'] ?? $body['id'] ?? $body['reference_id'] ?? $reference;
        $actionUrl = $this->xenditActionUrl($body);
        return [
            'reference' => $providerReference,
            'qrPayload' => null,
            'edcInstruction' => $actionUrl
                ? 'Buka halaman otorisasi kartu Xendit: ' . $actionUrl
                : ($response['ok']
                    ? 'Payment request kartu dibuat. Tunggu approval kartu atau webhook Xendit.'
                    : 'Xendit Cards menolak request. Untuk Payment Requests channel CARDS, Xendit membutuhkan card_details dari secure card component/token. Gunakan metode EDC manual untuk mesin fisik, atau aktifkan integrasi Xendit Components sebelum memproses kartu online.'),
            'requestPayload' => $payload,
            'responsePayload' => [
                'provider' => 'xendit',
                'status' => $response['ok'] ? $this->xenditLocalStatus((string) ($body['status'] ?? 'REQUIRES_ACTION')) : 'failed',
                'httpStatus' => $response['status'],
                'reference' => $providerReference,
                'actionUrl' => $actionUrl,
                'raw' => $body,
                'error' => $response['error'],
                'hint' => ! $response['ok'] && str_contains((string) ($response['error'] ?? ''), 'card_details')
                    ? 'CARDS via Payment Requests membutuhkan channel_properties.card_details. Aplikasi POS ini tidak menyimpan data kartu mentah; gunakan EDC manual atau Xendit Components/tokenization.'
                    : null,
                'mode' => $settings['mode'] ?? 'sandbox',
            ],
            'logs' => [$this->httpLog('create_xendit_card_payment_request', self::XENDIT_PAYMENT_REQUEST_URL, $payload, $response)],
        ];
    }

    private function createMidtransQris(array $method, array $settings, string $reference, float $amount, string $orderNo): array
    {
        $acquirer = strtolower(trim((string) ($method['channel_code'] ?? ''))) ?: 'gopay';
        if ($acquirer === 'qris') $acquirer = 'gopay';
        $payload = [
            'payment_type' => 'qris',
            'transaction_details' => [
                'order_id' => $reference,
                'gross_amount' => (int) round($amount),
            ],
            'item_details' => [[
                'id' => $orderNo,
                'price' => (int) round($amount),
                'quantity' => 1,
                'name' => 'POS Order ' . $orderNo,
            ]],
            'qris' => [
                'acquirer' => $acquirer,
            ],
        ];
        $secret = $this->credential('MIDTRANS_SERVER_KEY', $settings['midtransServerKey'] ?? '');
        if ($secret === '') {
            return [
                'reference' => $reference,
                'qrPayload' => null,
                'edcInstruction' => null,
                'requestPayload' => $payload,
                'responsePayload' => [
                    'provider' => 'midtrans',
                    'reference' => $reference,
                    'status' => 'failed',
                    'configurationRequired' => 'MIDTRANS_SERVER_KEY belum diisi.',
                    'mode' => $settings['mode'] ?? 'sandbox',
                ],
                'logs' => [[
                    'direction' => 'outbound',
                    'action' => 'create_midtrans_qris_charge',
                    'target' => $this->isSandbox($settings) ? self::MIDTRANS_SANDBOX_CHARGE_URL : self::MIDTRANS_PRODUCTION_CHARGE_URL,
                    'httpMethod' => 'POST',
                    'status' => 'configuration_required',
                    'requestPayload' => $payload,
                    'responsePayload' => ['configurationRequired' => 'MIDTRANS_SERVER_KEY belum diisi.'],
                    'errorMessage' => 'MIDTRANS_SERVER_KEY belum diisi.',
                ]],
            ];
        }

        $url = $this->isSandbox($settings) ? self::MIDTRANS_SANDBOX_CHARGE_URL : self::MIDTRANS_PRODUCTION_CHARGE_URL;
        $response = $this->postJson($url, $payload, 'Basic ' . base64_encode($secret . ':'), (int) ($settings['timeout'] ?? 15));
        $body = $response['body'];
        $qrPayload = $this->midtransQrActionUrl($body) ?: $this->qrisPayload($reference, $amount, $orderNo);
        return [
            'reference' => $body['transaction_id'] ?? $body['order_id'] ?? $reference,
            'qrPayload' => $qrPayload,
            'edcInstruction' => null,
            'requestPayload' => $payload,
            'responsePayload' => [
                'provider' => 'midtrans',
                'status' => $response['ok'] ? ($body['transaction_status'] ?? 'pending') : 'fallback_pending',
                'httpStatus' => $response['status'],
                'reference' => $body['transaction_id'] ?? $body['order_id'] ?? $reference,
                'raw' => $body,
                'error' => $response['error'],
            ],
            'logs' => [$this->httpLog('create_midtrans_qris_charge', $url, $payload, $response)],
        ];
    }

    private function createMidtransCard(array $method, array $settings, string $reference, float $amount, string $orderNo): array
    {
        $customerUrl = $this->customerCardUrl($reference);
        $payload = [
            'transaction_details' => [
                'order_id' => $reference,
                'gross_amount' => (int) round($amount),
            ],
            'item_details' => [[
                'id' => $orderNo,
                'price' => (int) round($amount),
                'quantity' => 1,
                'name' => 'POS Order ' . $orderNo,
            ]],
            'enabled_payments' => ['credit_card'],
            'credit_card' => ['secure' => true],
            'callbacks' => ['finish' => $customerUrl . '?result=success'],
        ];
        $secret = $this->credential('MIDTRANS_SERVER_KEY', $settings['midtransServerKey'] ?? '');
        $url = $this->isSandbox($settings) ? self::MIDTRANS_SANDBOX_SNAP_URL : self::MIDTRANS_PRODUCTION_SNAP_URL;
        if ($secret === '') {
            return [
                'reference' => $reference,
                'qrPayload' => null,
                'edcInstruction' => null,
                'requestPayload' => $payload,
                'responsePayload' => [
                    'provider' => 'midtrans',
                    'status' => 'failed',
                    'reference' => $reference,
                    'actionUrl' => $customerUrl,
                    'hostedPaymentUrl' => '',
                    'mode' => $settings['mode'] ?? 'sandbox',
                    'configurationRequired' => 'MIDTRANS_SERVER_KEY belum diisi.',
                ],
                'logs' => [[
                    'direction' => 'outbound',
                    'action' => 'create_midtrans_card_snap',
                    'target' => $url,
                    'httpMethod' => 'POST',
                    'status' => 'configuration_required',
                    'requestPayload' => $payload,
                    'responsePayload' => ['configurationRequired' => 'MIDTRANS_SERVER_KEY belum diisi.'],
                    'errorMessage' => 'MIDTRANS_SERVER_KEY belum diisi.',
                ]],
            ];
        }

        $response = $this->postJson($url, $payload, 'Basic ' . base64_encode($secret . ':'), (int) ($settings['timeout'] ?? 15));
        $body = $response['body'];
        $hostedUrl = (string) ($body['redirect_url'] ?? '');
        return [
            'reference' => $reference,
            'qrPayload' => null,
            'edcInstruction' => null,
            'requestPayload' => $payload,
            'responsePayload' => [
                'provider' => 'midtrans',
                'status' => $response['ok'] ? 'pending' : 'failed',
                'httpStatus' => $response['status'],
                'reference' => $reference,
                'midtransOrderId' => $reference,
                'snapToken' => $body['token'] ?? '',
                'actionUrl' => $customerUrl,
                'hostedPaymentUrl' => $hostedUrl,
                'mode' => $settings['mode'] ?? 'sandbox',
                'integration' => 'midtrans_snap_card',
                'raw' => $body,
                'error' => $response['error'],
            ],
            'logs' => [$this->httpLog('create_midtrans_card_snap', $url, $payload, $response)],
        ];
    }

    private function syncMidtransCardPayment(array $row, string $reference): array
    {
        $this->syncMidtransTransaction($row);
        return $this->publicCardPayment($reference);
    }

    private function syncMidtransTransaction(array $row): array
    {
        $settings = $this->gatewaySettings((int) ($row['company_id'] ?? 1), (int) $row['outlet_id']);
        $secret = $this->credential('MIDTRANS_SERVER_KEY', $settings['midtransServerKey'] ?? '');
        if ($secret === '') {
            throw new \InvalidArgumentException('MIDTRANS_SERVER_KEY belum diisi.');
        }
        $base = $this->isSandbox($settings) ? 'https://api.sandbox.midtrans.com' : 'https://api.midtrans.com';
        $reference = (string) $row['provider_reference'];
        $target = $base . '/v2/' . rawurlencode($reference) . '/status';
        $gatewayResponse = $this->getJson($target, 'Basic ' . base64_encode($secret . ':'), (int) ($settings['timeout'] ?? 15));
        $body = $gatewayResponse['body'];
        $status = $gatewayResponse['ok'] ? $this->midtransLocalStatus((string) ($body['transaction_status'] ?? '')) : 'pending';
        $responsePayload = json_decode($row['response_payload'] ?? '{}', true) ?: [];
        $responsePayload['rawSync'] = $body;
        $responsePayload['syncHttpStatus'] = $gatewayResponse['status'];
        $responsePayload['syncError'] = $gatewayResponse['error'];
        $responsePayload['status'] = $status;
        $update = ['status' => $status, 'response_payload' => json_encode($responsePayload)];
        if ($status === 'paid') $update['paid_at'] = date('Y-m-d H:i:s');
        $this->transactions->update((int) $row['id'], $update);
        $this->writeGatewayLog((int) $row['id'], (int) ($row['company_id'] ?? 1), (int) $row['outlet_id'], $this->httpLog('sync_midtrans_payment_status', $target, ['reference' => $reference], $gatewayResponse, 'GET'));
        return $this->transactions->find((int) $row['id']);
    }

    private function midtransLocalStatus(string $status): string
    {
        return match (strtolower($status)) {
            'capture', 'settlement' => 'paid',
            'deny', 'failure' => 'failed',
            'cancel' => 'cancelled',
            'expire' => 'expired',
            default => 'pending',
        };
    }

    private function offlineGatewayResponse(string $provider, string $type, array $method, array $settings, string $reference, float $amount, string $orderNo, array $extra = []): array
    {
        $channel = trim((string) ($method['channel_code'] ?? ''));
        $terminal = trim((string) ($method['terminal_id'] ?? ''));
        $edcMode = trim((string) ($method['edc_mode'] ?? 'manual')) ?: 'manual';
        $merchantId = trim((string) ($method['merchant_id'] ?? ''));
        $terminalSerial = trim((string) ($method['terminal_serial'] ?? ''));
        $connectorStatus = trim((string) ($method['connector_status'] ?? 'not_configured')) ?: 'not_configured';
        $isStaticQris = $type === 'qris' && ($method['qris_mode'] ?? 'online') === 'offline';
        $offlineQrPayload = $type === 'qris' && ! $isStaticQris ? $this->qrisPayload($reference, $amount, $orderNo) : null;
        $edcInstruction = null;
        if ($type === 'card') {
            $edcName = 'mesin EDC' . ($channel !== '' ? ' ' . strtoupper($channel) : '');
            $prefix = $edcMode === 'integrated' && ! empty($extra['fallbackReason'])
                ? $extra['fallbackReason'] . ' Gunakan mode manual: '
                : '';
            $edcInstruction = $prefix . 'Kirim nominal ' . number_format($amount, 0, ',', '.') . ' ke ' . $edcName
                . ($terminal ? ' terminal ' . $terminal : '')
                . ', lalu konfirmasi setelah approved.';
        }
        return [
            'reference' => $reference,
            'qrPayload' => $offlineQrPayload,
            'edcInstruction' => $edcInstruction,
            'requestPayload' => [
                'provider' => $provider,
                'channel' => $channel,
                'terminal' => $terminal,
                'edcMode' => $type === 'card' ? $edcMode : null,
                'merchantId' => $type === 'card' ? $merchantId : null,
                'terminalSerial' => $type === 'card' ? $terminalSerial : null,
                'connectorStatus' => $type === 'card' ? $connectorStatus : null,
                'amount' => $amount,
                'orderNo' => $orderNo,
                'mode' => $settings['mode'] ?? 'sandbox',
            ],
            'responsePayload' => [
                'provider' => $provider,
                'channel' => $channel,
                'terminal' => $terminal,
                'edcMode' => $type === 'card' ? $edcMode : null,
                'merchantId' => $type === 'card' ? $merchantId : null,
                'terminalSerial' => $type === 'card' ? $terminalSerial : null,
                'connectorStatus' => $type === 'card' ? $connectorStatus : null,
                'reference' => $reference,
                'status' => 'pending',
                'mode' => $settings['mode'] ?? 'sandbox',
            ] + $extra,
            'logs' => [[
                'direction' => 'internal',
                'action' => $type === 'card' ? 'manual_edc_instruction' : 'manual_qris_instruction',
                'target' => 'manual://' . $provider,
                'httpMethod' => 'MANUAL',
                'httpStatus' => null,
                'status' => 'pending',
                'requestPayload' => [
                    'provider' => $provider,
                    'channel' => $channel,
                    'terminal' => $terminal,
                    'edcMode' => $type === 'card' ? $edcMode : null,
                    'merchantId' => $type === 'card' ? $merchantId : null,
                    'terminalSerial' => $type === 'card' ? $terminalSerial : null,
                    'connectorStatus' => $type === 'card' ? $connectorStatus : null,
                    'amount' => $amount,
                    'orderNo' => $orderNo,
                    'mode' => $settings['mode'] ?? 'sandbox',
                ],
                'responsePayload' => ['instruction' => $edcInstruction, 'qrPayload' => $offlineQrPayload, 'staticImage' => $isStaticQris] + $extra,
            ]],
        ];
    }

    private function edcAdapter(string $channel): ?EdcTerminalAdapter
    {
        return match (strtoupper(trim($channel))) {
            'BCA' => new BcaEdcAdapter(),
            'BRI' => new BriEdcAdapter(),
            'BNI' => new BniEdcAdapter(),
            'MANDIRI' => new MandiriEdcAdapter(),
            default => null,
        };
    }

    private function edcTerminalLog(array $result): array
    {
        return [
            'direction' => 'outbound',
            'action' => 'authorize_integrated_edc_terminal',
            'target' => $result['target'] ?? 'edc://unassigned',
            'httpMethod' => $result['httpMethod'] ?? 'TERMINAL',
            'httpStatus' => $result['httpStatus'] ?? null,
            'status' => $result['status'] ?? (($result['ok'] ?? false) ? 'success' : 'failed'),
            'requestPayload' => $result['requestPayload'] ?? [],
            'responsePayload' => $result['responsePayload'] ?? [],
            'errorMessage' => ($result['ok'] ?? false) ? null : ($result['message'] ?? null),
        ];
    }

    private function postJson(string $url, array $payload, string $authorization, int $timeout = 15, array $extraHeaders = []): array
    {
        $body = json_encode($payload);
        $headers = array_merge([
            'Content-Type: application/json',
            'Accept: application/json',
            'Authorization: ' . $authorization,
        ], $extraHeaders);
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'ignore_errors' => true,
                'timeout' => (float) ($this->credential('PAYMENT_GATEWAY_TIMEOUT') ?: max(3, $timeout)),
                'header' => $headers,
                'content' => $body,
            ],
        ]);
        $raw = @file_get_contents($url, false, $context);
        $status = 0;
        foreach (($http_response_header ?? []) as $header) {
            if (preg_match('#^HTTP/\S+\s+(\d+)#', $header, $match)) {
                $status = (int) $match[1];
                break;
            }
        }
        $decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
        return [
            'ok' => $status >= 200 && $status < 300,
            'status' => $status,
            'body' => is_array($decoded) ? $decoded : ['raw' => $raw],
            'error' => $status >= 200 && $status < 300 ? null : ($decoded['message'] ?? $decoded['error'] ?? 'Gateway request gagal.'),
        ];
    }

    private function getJson(string $url, string $authorization, int $timeout = 15, array $extraHeaders = []): array
    {
        $headers = array_merge([
            'Accept: application/json',
            'Authorization: ' . $authorization,
        ], $extraHeaders);
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'ignore_errors' => true,
                'timeout' => (float) ($this->credential('PAYMENT_GATEWAY_TIMEOUT') ?: max(3, $timeout)),
                'header' => $headers,
            ],
        ]);
        $raw = @file_get_contents($url, false, $context);
        $status = 0;
        foreach (($http_response_header ?? []) as $header) {
            if (preg_match('#^HTTP/\S+\s+(\d+)#', $header, $match)) {
                $status = (int) $match[1];
                break;
            }
        }
        $decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
        return [
            'ok' => $status >= 200 && $status < 300,
            'status' => $status,
            'body' => is_array($decoded) ? $decoded : ['raw' => $raw],
            'error' => $status >= 200 && $status < 300 ? null : ($decoded['message'] ?? $decoded['error'] ?? 'Gateway request gagal.'),
        ];
    }

    private function httpLog(string $action, string $target, array $payload, array $response, string $method = 'POST'): array
    {
        return [
            'direction' => 'outbound',
            'action' => $action,
            'target' => $target,
            'httpMethod' => $method,
            'httpStatus' => $response['status'] ?? null,
            'status' => ($response['ok'] ?? false) ? 'success' : 'failed',
            'requestPayload' => $payload,
            'responsePayload' => $response['body'] ?? [],
            'errorMessage' => $response['error'] ?? null,
        ];
    }

    private function initialTransactionStatus(string $gatewayStatus): string
    {
        return match ($gatewayStatus) {
            'paid' => 'paid',
            'failed' => 'failed',
            'cancelled' => 'cancelled',
            'expired' => 'expired',
            default => 'pending',
        };
    }

    private function writeGatewayLogs(int $paymentTransactionId, int $companyId, int $outletId, array $logs): void
    {
        foreach ($logs as $log) {
            $this->writeGatewayLog($paymentTransactionId, $companyId, $outletId, $log);
        }
    }

    private function writeGatewayLog(int $paymentTransactionId, int $companyId, int $outletId, array $log): void
    {
        if (! Database::connect()->tableExists('payment_transaction_logs')) {
            return;
        }
        $this->transactionLogs->insert($this->withCompanyData('payment_transaction_logs', [
            'payment_transaction_id' => $paymentTransactionId,
            'company_id' => $companyId,
            'outlet_id' => $outletId,
            'direction' => $log['direction'] ?? 'internal',
            'action' => $log['action'] ?? 'payment_gateway_action',
            'target' => $log['target'] ?? '',
            'http_method' => $log['httpMethod'] ?? 'POST',
            'http_status' => $log['httpStatus'] ?? null,
            'status' => $log['status'] ?? null,
            'request_payload' => json_encode($log['requestPayload'] ?? []),
            'response_payload' => json_encode($log['responsePayload'] ?? []),
            'error_message' => $log['errorMessage'] ?? null,
        ], $companyId));
    }

    private function gatewayProvider(array $settings, string $type, array $method = []): string
    {
        $methodProvider = strtolower(trim((string) ($method['gateway_provider'] ?? '')));
        $offline = ($type === 'qris' && ($method['qris_mode'] ?? 'online') === 'offline')
            || ($type === 'card' && $methodProvider === 'manual');
        $provider = $offline ? 'manual' : strtolower(trim((string) ($settings['provider'] ?? 'manual')));
        if (! in_array($provider, ['manual', 'xendit', 'midtrans'], true)) {
            return 'manual';
        }
        if ($provider === 'manual' && $type === 'qris') {
            return 'manual_qris';
        }
        if ($provider === 'manual' && $type === 'card') {
            return 'manual_edc';
        }
        return $provider;
    }

    private function isSandbox(array $method): bool
    {
        return ($method['mode'] ?? 'sandbox') !== 'live';
    }

    private function credential(string $name, string $databaseValue = ''): string
    {
        return trim((string) ($databaseValue ?: env($name) ?: getenv($name) ?: ''));
    }

    private function gatewaySettings(int $companyId, int $outletId): array
    {
        $builder = Database::connect()
            ->table('app_settings');
        if ($this->hasCompanyColumn('app_settings')) {
            $builder->where('company_id', $companyId);
        }
        $rows = $builder
            ->groupStart()
            ->where('outlet_id', $outletId)
            ->orWhere('outlet_id', null)
            ->groupEnd()
            ->whereIn('setting_key', [
                'payment_gateway_provider',
                'payment_gateway_mode',
                'payment_gateway_timeout',
                'xendit_secret_key',
                'midtrans_server_key',
            ])
            ->get()
            ->getResultArray();
        $map = [];
        foreach ($rows as $row) {
            $map[$row['setting_key']] = $row['setting_value'];
        }
        return [
            'provider' => $map['payment_gateway_provider'] ?? 'manual',
            'mode' => $map['payment_gateway_mode'] ?? 'sandbox',
            'timeout' => (int) ($map['payment_gateway_timeout'] ?? 15),
            'xenditSecretKey' => trim((string) ($map['xendit_secret_key'] ?? '')),
            'midtransServerKey' => trim((string) ($map['midtrans_server_key'] ?? '')),
        ];
    }

    private function hasCompanyColumn(string $table): bool
    {
        $db = Database::connect();
        return $db->tableExists($table) && $db->fieldExists('company_id', $table);
    }

    private function withCompanyData(string $table, array $data, int $companyId): array
    {
        if ($this->hasCompanyColumn($table)) {
            $data['company_id'] = $companyId;
        } else {
            unset($data['company_id']);
        }

        return $data;
    }

    private function rowBelongsToCompany(array $row, int $companyId): bool
    {
        return ! array_key_exists('company_id', $row) || (int) $row['company_id'] === $companyId;
    }

    private function midtransQrActionUrl(array $body): ?string
    {
        foreach (($body['actions'] ?? []) as $action) {
            if (($action['name'] ?? '') === 'generate-qr-code-v2' && ! empty($action['url'])) {
                return $action['url'];
            }
        }
        foreach (($body['actions'] ?? []) as $action) {
            if (! empty($action['url'])) {
                return $action['url'];
            }
        }
        return null;
    }

    private function xenditPresentedQr(array $body): ?string
    {
        foreach (($body['actions'] ?? []) as $action) {
            $type = strtoupper((string) ($action['type'] ?? ''));
            $descriptor = strtoupper((string) ($action['descriptor'] ?? ''));
            if ($type === 'PRESENT_TO_CUSTOMER' && in_array($descriptor, ['QR_STRING', 'QR_CODE'], true) && ! empty($action['value'])) {
                return (string) $action['value'];
            }
        }
        foreach (($body['actions'] ?? []) as $action) {
            if (! empty($action['value'])) {
                return (string) $action['value'];
            }
        }
        return null;
    }

    private function xenditActionUrl(array $body): string
    {
        foreach (($body['actions'] ?? []) as $action) {
            $descriptor = strtoupper((string) ($action['descriptor'] ?? ''));
            $type = strtoupper((string) ($action['type'] ?? ''));
            if (($descriptor === 'WEB_URL' || $type === 'REDIRECT_CUSTOMER') && ! empty($action['value'])) {
                return (string) $action['value'];
            }
        }
        return (string) ($body['actionUrl'] ?? '');
    }

    private function returnUrl(string $result, string $orderNo): string
    {
        $baseUrl = rtrim((string) (config('App')->baseURL ?? ''), '/');
        if ($baseUrl === '') {
            $baseUrl = 'http://localhost:8081';
        }
        return $baseUrl . '/pages/pos.html?payment=' . rawurlencode($result) . '&order=' . rawurlencode($orderNo);
    }

    private function customerCardUrl(string $reference): string
    {
        $baseUrl = rtrim((string) (config('App')->baseURL ?? ''), '/');
        if ($baseUrl === '') {
            $baseUrl = 'http://localhost:8081';
        }
        return $baseUrl . '/payment/card/' . rawurlencode($reference);
    }

    private function isValidQrisPayload(string $payload): bool
    {
        $payload = trim($payload);
        if ($payload === '') {
            return false;
        }
        return str_starts_with($payload, '000201')
            && str_contains($payload, '5802ID')
            && strlen($payload) >= 80;
    }

    private function xenditLocalStatus(string $status): string
    {
        return match (strtoupper($status)) {
            'SUCCEEDED' => 'paid',
            'FAILED' => 'failed',
            'CANCELED', 'CANCELLED' => 'cancelled',
            'EXPIRED' => 'expired',
            default => 'pending',
        };
    }

    private function xenditInvoiceStatus(string $status): string
    {
        return match (strtoupper($status)) {
            'PAID', 'SETTLED' => 'paid',
            'EXPIRED' => 'expired',
            default => 'pending',
        };
    }

    private function xenditWebhookStatus(string $event, string $status): string
    {
        $event = strtolower($event);
        if ($event === 'payment.capture') {
            return 'paid';
        }
        if ($event === 'payment.failure') {
            return 'failed';
        }
        if (in_array($event, ['invoice.paid', 'invoice.settled'], true)) {
            return 'paid';
        }
        if (in_array($event, ['invoice.expired', 'invoice.failed'], true)) {
            return $event === 'invoice.expired' ? 'expired' : 'failed';
        }
        return $this->xenditLocalStatus($status);
    }

    private function responseValue(array $row, string $key): mixed
    {
        $response = json_decode($row['response_payload'] ?? '{}', true) ?: [];
        return $response[$key] ?? null;
    }

    private function numericId(string|int|null $value): ?int
    {
        if (! $value) return null;
        if (is_numeric($value)) return (int) $value;
        if (preg_match('/(\d+)$/', (string) $value, $match)) return (int) $match[1];
        return null;
    }
}
