<?php

namespace App\Services;

use App\Models\AppSettingModel;
use App\Models\DiningTableModel;
use App\Models\PackagingRuleItemModel;
use App\Models\PackagingRuleModel;
use App\Models\PaymentMethodModel;
use Config\Database;

class SettingsService
{
    use \App\Services\Shared\MappingHelperTrait;
    public function data(int $companyId = 1, int $outletId = 1): array
    {
        $db = Database::connect();
        $company = $db->table('companies')->where('id', $companyId)->get()->getRowArray() ?: [];
        $outlet = $db->table('outlets')->where('id', $outletId)->get()->getRowArray() ?: [];
        $settings = $this->settingsMap($companyId, $outletId);
        $ingredientBuilder = $db->table('outlet_ingredients')->where('outlet_id', $outletId);
        if ($db->fieldExists('company_id', 'outlet_ingredients')) {
            $ingredientBuilder->where('company_id', $companyId);
        }
        $ingredients = $ingredientBuilder->get()->getResultArray();

        return [
            'settings' => [
                'costingMethod' => $settings['costing_method'] ?? 'average',
                'companyName' => $company['name'] ?? 'IF Instrument',
                'companyLogoUrl' => $company['logo_path'] ?? '/assets/if-instrument-logo.jpg',
                'themeColor' => $company['theme_color'] ?? '#6e3a16',
                'outletName' => $outlet['name'] ?? 'Outlet Utama',
                'outletCode' => $outlet['code'] ?? '',
                'outletAddress' => $outlet['address'] ?? '',
                'taxRate' => (float) ($settings['tax_rate'] ?? 0),
                'dineInServiceRate' => (float) ($settings['dine_in_service_rate'] ?? 0),
                'printerName' => $settings['printer_name'] ?? '',
                'tableServiceMode' => $settings['table_service_mode'] ?? 'free_seating_pay_first',
                'orderChannels' => $this->orderChannels($settings),
                'publicOrderContent' => $this->publicOrderContent($settings),
                'paymentGateway' => $this->paymentGatewaySettings($settings),
                'diningTables' => $this->diningTables($companyId, $outletId),
                'paymentMethods' => $this->paymentMethods($companyId, $outletId),
                'packagingRules' => $this->packagingRules($companyId, $outletId),
            ],
            'ingredients' => array_map(fn ($row) => [
                'id' => $this->ingredientCode($row),
                'name' => $row['name'],
                'unit' => $row['unit'],
                'stock' => (float) $row['stock_qty'],
                'status' => StatusCodeService::common($row['status'] ?? ''),
            ], $ingredients),
        ];
    }

    public function saveGeneral(array $payload, int $companyId = 1, int $outletId = 1): array
    {
        $this->setSetting($companyId, $outletId, 'costing_method', $payload['costingMethod'] ?? 'average');
        $this->setSetting($companyId, $outletId, 'tax_rate', (string) ($payload['taxRate'] ?? 0));
        $this->setSetting($companyId, $outletId, 'dine_in_service_rate', (string) ($payload['dineInServiceRate'] ?? 0));
        $this->setSetting($companyId, $outletId, 'printer_name', trim((string) ($payload['printerName'] ?? '')));
        $this->setSetting($companyId, $outletId, 'table_service_mode', $payload['tableServiceMode'] ?? 'free_seating_pay_first');
        if (isset($payload['publicOrderContent']) && is_array($payload['publicOrderContent'])) {
            $this->setSetting($companyId, $outletId, 'public_order_content', json_encode($payload['publicOrderContent'], JSON_UNESCAPED_UNICODE));
        }
        $channels = is_array($payload['orderChannels'] ?? null) ? $payload['orderChannels'] : [];
        $this->setSetting($companyId, $outletId, 'order_channel_dine_in', ! empty($channels['dineIn']) ? '1' : '0');
        $this->setSetting($companyId, $outletId, 'order_channel_take_away', ! array_key_exists('takeAway', $channels) || ! empty($channels['takeAway']) ? '1' : '0');
        $this->setSetting($companyId, $outletId, 'order_channel_delivery', ! empty($channels['delivery']) ? '1' : '0');
        if (isset($payload['paymentGateway']) && is_array($payload['paymentGateway'])) {
            $this->savePaymentGatewaySettings($payload['paymentGateway'], $companyId, $outletId);
        }

        if (!empty($payload['outletName'])) {
            Database::connect()->table('outlets')->where('id', $outletId)->update([
                'name' => trim((string) $payload['outletName']),
                'updated_at' => date('Y-m-d H:i:s'),
            ]);
        }

        return $this->generalSettings($companyId, $outletId);
    }

    public function generalSettings(int $companyId = 1, int $outletId = 1): array
    {
        $settings = $this->data($companyId, $outletId)['settings'];
        unset($settings['diningTables'], $settings['paymentMethods'], $settings['packagingRules']);
        return $settings;
    }

    public function printerPage(): array
    {
        $printers = [];
        foreach ($this->commandLines('lpstat -e') as $line) {
            $name = trim($line);
            if ($name !== '') {
                $printers[$name] = ['name' => $name, 'source' => 'Komputer'];
            }
        }

        foreach ($this->commandLines('lpstat -v') as $line) {
            if (! preg_match('/^device for\s+([^:]+):\s+(.+)$/i', trim($line), $matches)) {
                continue;
            }
            $name = trim($matches[1]);
            $target = trim($matches[2]);
            $printers[$name] = [
                'name' => $name,
                'target' => $target,
                'source' => str_contains($target, '._tcp') || str_starts_with($target, 'ipp') || str_starts_with($target, 'dnssd') ? 'Jaringan' : 'Komputer',
            ];
        }

        return [
            'items' => array_values($printers),
            'meta' => [
                'page' => 1,
                'perPage' => max(1, count($printers)),
                'total' => count($printers),
                'totalPages' => 1,
            ],
        ];
    }

    public function diningTablePage(int $companyId = 1, int $outletId = 1, array $filters = []): array
    {
        return $this->arrayPage($this->diningTables($companyId, $outletId), $filters);
    }

    public function diningTableDetail(string $id, int $companyId = 1, int $outletId = 1): array
    {
        return $this->findResource($this->diningTables($companyId, $outletId), $id);
    }

    public function paymentMethodPage(int $companyId = 1, int $outletId = 1, array $filters = []): array
    {
        return $this->arrayPage($this->paymentMethods($companyId, $outletId), $filters);
    }

    public function paymentMethodDetail(string $id, int $companyId = 1, int $outletId = 1): array
    {
        return $this->findResource($this->paymentMethods($companyId, $outletId), $id);
    }

    public function packagingRulePage(int $companyId = 1, int $outletId = 1, array $filters = []): array
    {
        return $this->arrayPage($this->packagingRules($companyId, $outletId), $filters);
    }

    public function packagingRuleDetail(string $id, int $companyId = 1, int $outletId = 1): array
    {
        return $this->findResource($this->packagingRules($companyId, $outletId), $id);
    }

    public function saveDiningTable(array $payload, int $companyId = 1, int $outletId = 1): array
    {
        $model = new DiningTableModel();
        $id = $this->numericId($payload['id'] ?? '');
        $row = [
            'company_id' => $companyId,
            'outlet_id' => $outletId,
            'name' => trim((string) ($payload['name'] ?? '')),
            'area' => trim((string) ($payload['area'] ?? '')),
            'capacity' => (int) ($payload['capacity'] ?? 1),
            'sort_order' => (int) ($payload['sort'] ?? 0),
            'status' => StatusCodeService::common($payload['status'] ?? 'active'),
        ];
        if ($id) {
            $model->update($id, $row);
        } else {
            $model->insert($row);
            $id = (int) $model->getInsertID();
        }

        return $this->findResource($this->diningTables($companyId, $outletId), 'tbl-' . str_pad((string) $id, 2, '0', STR_PAD_LEFT));
    }

    public function deactivateDiningTable(string $legacyId, int $companyId = 1, int $outletId = 1): array
    {
        $id = $this->numericId($legacyId);
        $model = new DiningTableModel();
        $row = $id ? $model->find($id) : null;
        if ($row && $this->rowBelongsToCompany($row, $companyId) && (!$row['outlet_id'] || (int) $row['outlet_id'] === $outletId)) {
            $model->update($id, ['status' => StatusCodeService::INACTIVE]);
        }
        return $this->findResource($this->diningTables($companyId, $outletId), 'tbl-' . str_pad((string) $id, 2, '0', STR_PAD_LEFT));
    }

    public function savePaymentMethod(array $payload, int $companyId = 1, int $outletId = 1): array
    {
        $model = new PaymentMethodModel();
        $id = $this->numericId($payload['id'] ?? '');
        $edcMode = $payload['edcMode'] ?? $payload['edc_mode'] ?? 'manual';
        $edcMode = in_array($edcMode, ['manual', 'integrated'], true) ? $edcMode : 'manual';
        $connectorStatus = StatusCodeService::connector($payload['connectorStatus'] ?? $payload['connector_status'] ?? 'not_configured');
        $type = $payload['type'] ?? 'cash';
        $qrisMode = $payload['qrisMode'] ?? $payload['qris_mode'] ?? 'online';
        $qrisMode = in_array($qrisMode, ['online', 'offline'], true) ? $qrisMode : 'online';
        $requestedProvider = strtolower(trim((string) ($payload['gatewayProvider'] ?? $payload['gateway_provider'] ?? 'manual')));
        $isOnlinePayment = ($type === 'qris' && $qrisMode === 'online') || ($type === 'card' && $requestedProvider !== 'manual');
        $activeGateway = strtolower((string) ($this->settingsMap($companyId, $outletId)['payment_gateway_provider'] ?? 'manual'));
        if ($isOnlinePayment && ! in_array($activeGateway, ['xendit', 'midtrans'], true)) {
            throw new \InvalidArgumentException('Pilih Xendit atau Midtrans pada Pengaturan Gateway sebelum mengaktifkan pembayaran online.');
        }
        $qrisImagePath = trim((string) ($payload['qrisImageUrl'] ?? $payload['qris_image_path'] ?? ''));
        if ($type === 'qris' && $qrisMode === 'offline' && $qrisImagePath === '') {
            throw new \InvalidArgumentException('Gambar QRIS Static wajib diupload untuk mode offline.');
        }
        $row = [
            'company_id' => $companyId,
            'outlet_id' => $outletId,
            'name' => trim((string) ($payload['name'] ?? '')),
            'type' => $type,
            'gateway_provider' => $isOnlinePayment ? 'online' : 'manual',
            'qris_mode' => $type === 'qris' ? $qrisMode : 'online',
            'qris_image_path' => $type === 'qris' && $qrisMode === 'offline' ? $qrisImagePath : null,
            'channel_code' => trim((string) ($payload['channelCode'] ?? $payload['channel_code'] ?? '')),
            'terminal_id' => trim((string) ($payload['terminalId'] ?? $payload['terminal_id'] ?? '')),
            'edc_mode' => $edcMode,
            'merchant_id' => trim((string) ($payload['merchantId'] ?? $payload['merchant_id'] ?? '')),
            'terminal_serial' => trim((string) ($payload['terminalSerial'] ?? $payload['terminal_serial'] ?? '')),
            'connector_status' => $connectorStatus,
            'fee_rate' => (float) ($payload['feeRate'] ?? 0),
            'fee_payer' => in_array(($payload['feePayer'] ?? $payload['fee_payer'] ?? 'merchant'), ['customer', 'merchant'], true) ? ($payload['feePayer'] ?? $payload['fee_payer'] ?? 'merchant') : 'merchant',
            'account' => trim((string) ($payload['account'] ?? '')),
            'sort_order' => (int) ($payload['sort'] ?? 0),
            'status' => StatusCodeService::common($payload['status'] ?? 'active'),
            'is_available_pos' => isset($payload['isAvailablePos']) ? ($payload['isAvailablePos'] ? 1 : 0) : (isset($payload['is_available_pos']) ? ((int)$payload['is_available_pos'] ? 1 : 0) : 1),
            'is_available_online' => isset($payload['isAvailableOnline']) ? ($payload['isAvailableOnline'] ? 1 : 0) : (isset($payload['is_available_online']) ? ((int)$payload['is_available_online'] ? 1 : 0) : 1),
            'target_channel' => trim((string) ($payload['targetChannel'] ?? $payload['target_channel'] ?? 'all')),
        ];
        if ($id) {
            $model->update($id, $row);
        } else {
            $model->insert($row);
            $id = (int) $model->getInsertID();
        }

        return $this->findResource($this->paymentMethods($companyId, $outletId), 'pay-' . $id);
    }

    public function deactivatePaymentMethod(string $legacyId, int $companyId = 1, int $outletId = 1): array
    {
        $id = $this->numericId($legacyId);
        $model = new PaymentMethodModel();
        $row = $id ? $model->find($id) : null;
        if ($row && $this->rowBelongsToCompany($row, $companyId) && (int) $row['outlet_id'] === $outletId) {
            $model->update($id, ['status' => StatusCodeService::INACTIVE]);
        }
        return $this->findResource($this->paymentMethods($companyId, $outletId), 'pay-' . $id);
    }

    public function savePackagingRule(array $payload, int $companyId = 1, int $outletId = 1): array
    {
        $db = Database::connect();
        $rules = new PackagingRuleModel();
        $items = new PackagingRuleItemModel();
        $id = $this->numericId($payload['id'] ?? '');

        $db->transStart();
        $row = [
            'company_id' => $companyId,
            'outlet_id' => $outletId,
            'name' => 'Rule ' . (int) ($payload['minQty'] ?? 1) . '-' . (int) ($payload['maxQty'] ?? 1),
            'min_qty' => (int) ($payload['minQty'] ?? 1),
            'max_qty' => (int) ($payload['maxQty'] ?? 1),
            'status' => StatusCodeService::common($payload['status'] ?? 'active'),
        ];
        if ($id) {
            $rules->update($id, $row);
            $db->table('packaging_rule_items')->where('packaging_rule_id', $id)->delete();
            $ruleId = $id;
        } else {
            $ruleId = (int) $rules->insert($row);
        }
        foreach (($payload['items'] ?? []) as $line) {
            $this->insertPackagingLine($items, $ruleId, $line, false);
        }
        foreach (($payload['fallbackItems'] ?? []) as $line) {
            $this->insertPackagingLine($items, $ruleId, $line, true);
        }
        $db->transComplete();

        return $this->findResource($this->packagingRules($companyId, $outletId), 'pack-rule-' . $ruleId);
    }

    public function deactivatePackagingRule(string $legacyId, int $companyId = 1, int $outletId = 1): array
    {
        $id = $this->numericId($legacyId);
        $model = new PackagingRuleModel();
        $row = $id ? $model->find($id) : null;
        if ($row && $this->rowBelongsToCompany($row, $companyId) && (int) $row['outlet_id'] === $outletId) {
            $model->update($id, ['status' => StatusCodeService::INACTIVE]);
        }
        return $this->findResource($this->packagingRules($companyId, $outletId), 'pack-rule-' . $id);
    }

    private function settingsMap(int $companyId, int $outletId): array
    {
        $model = new AppSettingModel();
        if ($this->hasCompanyColumn('app_settings')) {
            $model->where('company_id', $companyId);
        }
        $rows = $model
            ->groupStart()
            ->where('outlet_id', $outletId)
            ->orWhere('outlet_id', null)
            ->groupEnd()
            ->findAll();
        $map = [];
        foreach ($rows as $row) {
            $map[$row['setting_key']] = $row['setting_value'];
        }
        return $map;
    }

    private function setSetting(int $companyId, int $outletId, string $key, string $value): void
    {
        $model = new AppSettingModel();
        if ($this->hasCompanyColumn('app_settings')) {
            $model->where('company_id', $companyId);
        }
        $existing = $model->where('outlet_id', $outletId)->where('setting_key', $key)->first();
        $payload = ['company_id' => $companyId, 'outlet_id' => $outletId, 'setting_key' => $key, 'setting_value' => $value];
        if (! $this->hasCompanyColumn('app_settings')) {
            unset($payload['company_id']);
        }
        $existing ? $model->update($existing['id'], $payload) : $model->insert($payload);
    }

    private function diningTables(int $companyId, int $outletId): array
    {
        $model = new DiningTableModel();
        if ($this->hasCompanyColumn('dining_tables')) {
            $model->where('company_id', $companyId);
        }
        $rows = $model->where('outlet_id', $outletId)->orderBy('sort_order')->findAll();
        return array_map(fn ($row) => [
            'id' => 'tbl-' . str_pad((string) $row['id'], 2, '0', STR_PAD_LEFT),
            'name' => $row['name'],
            'area' => $row['area'],
            'capacity' => (int) $row['capacity'],
            'status' => StatusCodeService::common($row['status'] ?? ''),
            'sort' => (int) $row['sort_order'],
        ], $rows);
    }

    private function paymentMethods(int $companyId, int $outletId): array
    {
        $model = new PaymentMethodModel();
        if ($this->hasCompanyColumn('payment_methods')) {
            $model->where('company_id', $companyId);
        }
        $rows = $model->where('outlet_id', $outletId)->orderBy('sort_order')->findAll();
        return array_map(fn ($row) => [
            'id' => 'pay-' . $row['id'],
            'name' => $row['name'],
            'type' => $row['type'],
            'gatewayProvider' => $row['gateway_provider'] ?? 'manual',
            'isDefault' => $row['type'] === 'cash' && strtolower((string) $row['name']) === 'cash',
            'cardMode' => $row['type'] === 'card' ? 'online' : ($row['type'] === 'edc' ? 'offline' : (($row['gateway_provider'] ?? 'manual') !== 'manual' ? 'online' : 'offline')),
            'qrisMode' => $row['qris_mode'] ?? (($row['gateway_provider'] ?? 'manual') === 'manual' ? 'offline' : 'online'),
            'qrisImageUrl' => $row['qris_image_path'] ?? '',
            'channelCode' => $row['channel_code'] ?? '',
            'terminalId' => $row['terminal_id'] ?? '',
            'edcMode' => $row['edc_mode'] ?? 'manual',
            'merchantId' => $row['merchant_id'] ?? '',
            'terminalSerial' => $row['terminal_serial'] ?? '',
            'connectorStatus' => StatusCodeService::connector($row['connector_status'] ?? ''),
            'feeRate' => (float) $row['fee_rate'],
            'feePayer' => $row['fee_payer'] ?? 'merchant',
            'status' => StatusCodeService::common($row['status'] ?? ''),
            'account' => $row['account'],
            'sort' => (int) $row['sort_order'],
            'isAvailablePos' => isset($row['is_available_pos']) ? (int) $row['is_available_pos'] === 1 : true,
            'isAvailableOnline' => isset($row['is_available_online']) ? (int) $row['is_available_online'] === 1 : true,
            'targetChannel' => $row['target_channel'] ?? ($row['type'] === 'card' && ($row['gateway_provider'] ?? 'manual') === 'manual' ? 'pos' : 'all'),
        ], $rows);
    }

    private function paymentGatewaySettings(array $settings): array
    {
        $rawProvider = strtolower((string) ($settings['payment_gateway_provider'] ?? 'manual'));
        $validProviders = ['manual', 'central_xendit', 'central_midtrans', 'direct_xendit', 'direct_midtrans', 'xendit', 'midtrans'];
        if (! in_array($rawProvider, $validProviders, true)) {
            $rawProvider = 'manual';
        }

        if ($rawProvider === 'xendit') {
            $rawProvider = trim((string) ($settings['xendit_secret_key'] ?? '')) !== '' ? 'direct_xendit' : 'central_xendit';
        } elseif ($rawProvider === 'midtrans') {
            $rawProvider = trim((string) ($settings['midtrans_server_key'] ?? '')) !== '' ? 'direct_midtrans' : 'central_midtrans';
        }

        $db = Database::connect();
        $this->ensureCentralPaymentGatewaysTable($db);

        $centralGateways = [];
        if ($db->tableExists('payment_gateways')) {
            $rows = $db->table('payment_gateways')->get()->getResultArray();
            foreach ($rows as $row) {
                $centralGateways[$row['provider']] = [
                    'status' => ($row['status'] ?? 'active') === 'active' ? 'active' : 'inactive',
                    'apiKey' => (string) ($row['api_key'] ?? ''),
                    'apiKeySet' => trim((string) ($row['api_key'] ?? '')) !== '',
                    'qrisRate' => (float) ($row['qris_rate'] ?? 0.7),
                    'cardRate' => (float) ($row['card_rate'] ?? 2.0),
                    'vaFee' => (float) ($row['va_fee'] ?? 4000),
                    'ewalletRate' => (float) ($row['ewallet_rate'] ?? 1.5),
                ];
            }
        }

        $xenditMaster = $centralGateways['xendit'] ?? [
            'status' => 'active', 'apiKey' => '', 'apiKeySet' => false, 'qrisRate' => 0.7, 'cardRate' => 2.0, 'vaFee' => 4500, 'ewalletRate' => 1.5,
        ];
        $midtransMaster = $centralGateways['midtrans'] ?? [
            'status' => 'active', 'apiKey' => '', 'apiKeySet' => false, 'qrisRate' => 0.7, 'cardRate' => 1.9, 'vaFee' => 4000, 'ewalletRate' => 1.7,
        ];

        $centralActiveProviders = ['manual'];
        if ($xenditMaster['status'] === 'active') {
            $centralActiveProviders[] = 'central_xendit';
        }
        if ($midtransMaster['status'] === 'active') {
            $centralActiveProviders[] = 'central_midtrans';
        }
        $centralActiveProviders[] = 'direct_xendit';
        $centralActiveProviders[] = 'direct_midtrans';

        if (! in_array($rawProvider, $centralActiveProviders, true)) {
            $rawProvider = 'manual';
        }

        $xenditSet = $xenditMaster['apiKeySet'] || trim((string) ($settings['xendit_secret_key'] ?? '')) !== '';
        $midtransSet = $midtransMaster['apiKeySet'] || trim((string) ($settings['midtrans_server_key'] ?? '')) !== '';

        return [
            'provider' => $rawProvider,
            'mode' => ($settings['payment_gateway_mode'] ?? 'sandbox') === 'live' ? 'live' : 'sandbox',
            'timeout' => (int) ($settings['payment_gateway_timeout'] ?? 15),
            'xenditSecretSet' => $xenditSet,
            'midtransServerKeySet' => $midtransSet,
            'centralActiveProviders' => $centralActiveProviders,
            'centralMasterGateway' => [
                'xendit' => $xenditMaster,
                'midtrans' => $midtransMaster,
            ],
        ];
    }

    public function getCentralPaymentGatewayMaster(): array
    {
        $db = Database::connect();
        $this->ensureCentralPaymentGatewaysTable($db);

        $rows = $db->table('payment_gateways')->get()->getResultArray();
        $result = [];
        foreach ($rows as $row) {
            $prov = $row['provider'];
            $result[$prov] = [
                'status'      => $row['status'] ?? 'active',
                'qrisRate'    => (float) ($row['qris_rate'] ?? 0.7),
                'cardRate'    => (float) ($row['card_rate'] ?? 2.0),
                'vaFee'       => (float) ($row['va_fee'] ?? 4000),
                'ewalletRate' => (float) ($row['ewallet_rate'] ?? 1.5),
                'hasApiKey'   => !empty($row['api_key']),
            ];
        }
        return $result;
    }

    public function saveCentralPaymentGatewayMaster(array $payload, int $companyId = 1, int $outletId = 1): array
    {
        $db = Database::connect();
        $this->ensureCentralPaymentGatewaysTable($db);

        foreach (['xendit', 'midtrans'] as $prov) {
            if (isset($payload[$prov])) {
                $item = $payload[$prov];
                $keyVal = trim((string) ($item['secretKey'] ?? $item['serverKey'] ?? ''));
                $data = [
                    'status' => ($item['status'] ?? 'active') === 'active' ? 'active' : 'inactive',
                    'qris_rate' => (float) ($item['qrisRate'] ?? 0.7),
                    'card_rate' => (float) ($item['cardRate'] ?? 2.0),
                    'va_fee' => (float) ($item['vaFee'] ?? 4000),
                    'ewallet_rate' => (float) ($item['ewalletRate'] ?? 1.5),
                    'updated_at' => date('Y-m-d H:i:s'),
                ];
                if ($keyVal !== '') {
                    $data['api_key'] = $keyVal;
                }
                $existing = $db->table('payment_gateways')->where('provider', $prov)->get()->getRowArray();
                if ($existing) {
                    $db->table('payment_gateways')->where('provider', $prov)->update($data);
                } else {
                    $data['provider'] = $prov;
                    $data['created_at'] = date('Y-m-d H:i:s');
                    $db->table('payment_gateways')->insert($data);
                }
            }
        }
        return $this->getCentralPaymentGatewayMaster();
    }

    private function ensureCentralPaymentGatewaysTable($db): void
    {
        if (! $db->tableExists('payment_gateways')) {
            $forge = \Config\Database::forge($db);
            $forge->addField([
                'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
                'provider' => ['type' => 'VARCHAR', 'constraint' => 32],
                'api_key' => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
                'status' => ['type' => 'VARCHAR', 'constraint' => 24, 'default' => 'active'],
                'qris_rate' => ['type' => 'DECIMAL', 'constraint' => '5,2', 'default' => '0.70'],
                'card_rate' => ['type' => 'DECIMAL', 'constraint' => '5,2', 'default' => '2.00'],
                'va_fee' => ['type' => 'DECIMAL', 'constraint' => '10,2', 'default' => '4000.00'],
                'ewallet_rate' => ['type' => 'DECIMAL', 'constraint' => '5,2', 'default' => '1.50'],
                'created_at' => ['type' => 'DATETIME', 'null' => true],
                'updated_at' => ['type' => 'DATETIME', 'null' => true],
            ]);
            $forge->addKey('id', true);
            $forge->addUniqueKey('provider');
            $forge->createTable('payment_gateways', true);
        }

        if (! $db->fieldExists('api_key', 'payment_gateways')) {
            $forge = \Config\Database::forge($db);
            $forge->addColumn('payment_gateways', [
                'api_key' => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true, 'after' => 'provider'],
            ]);
        }

        $defaults = [
            [
                'provider' => 'xendit',
                'status' => 'active',
                'qris_rate' => 0.70,
                'card_rate' => 2.00,
                'va_fee' => 4500.00,
                'ewallet_rate' => 1.50,
                'created_at' => date('Y-m-d H:i:s'),
                'updated_at' => date('Y-m-d H:i:s'),
            ],
            [
                'provider' => 'midtrans',
                'status' => 'active',
                'qris_rate' => 0.70,
                'card_rate' => 1.90,
                'va_fee' => 4000.00,
                'ewallet_rate' => 1.70,
                'created_at' => date('Y-m-d H:i:s'),
                'updated_at' => date('Y-m-d H:i:s'),
            ],
        ];

        foreach ($defaults as $row) {
            $existing = $db->table('payment_gateways')->where('provider', $row['provider'])->get()->getRowArray();
            if (! $existing) {
                $db->table('payment_gateways')->insert($row);
            }
        }
    }

    private function publicOrderContent(array $settings): array
    {
        $defaults = [
            'coverSubtitle' => 'UMKM Solution',
            'coverDescription' => 'Pilih outlet dan mulai pemesanan dari buku menu digital.',
            'outletTitle' => 'Pilih Outlet',
            'serviceTitle' => 'Pilih Mode',
            'serviceDescription' => 'Pilih tipe pembelian yang aktif di outlet ini.',
            'tableTitle' => 'Table Layout',
            'tableDescription' => 'Pilih meja untuk dine in.',
            'menuTitle' => 'Pilih Menu',
            'menuDescription' => 'Pilih kategori, cari menu, lalu tambahkan produk ke cart.',
            'cartTitle' => 'Cart',
            'cartDescription' => 'Cek detail pesanan sebelum isi data customer.',
            'customerTitle' => 'Customer & Payment',
            'customerDescription' => 'Data receipt dan metode pembayaran.',
            'receiptTitle' => 'Receipt Detail',
            'receiptDescription' => 'Ringkasan akhir dan status pesanan.',
            'backSubtitle' => 'Terima kasih',
            'backDescription' => 'Pesanan Anda sudah diterima outlet. Simpan nomor order untuk konfirmasi.',
            'backButton' => 'Kembali ke Cover Depan',
        ];
        $decoded = json_decode((string) ($settings['public_order_content'] ?? ''), true);
        return array_merge($defaults, is_array($decoded) ? $decoded : []);
    }

    private function orderChannels(array $settings): array
    {
        return [
            'dineIn' => ($settings['order_channel_dine_in'] ?? '0') === '1',
            'takeAway' => ($settings['order_channel_take_away'] ?? '1') === '1',
            'delivery' => ($settings['order_channel_delivery'] ?? '0') === '1',
        ];
    }

    private function savePaymentGatewaySettings(array $gateway, int $companyId, int $outletId): void
    {
        $provider = strtolower(trim((string) ($gateway['provider'] ?? 'manual')));
        if (! in_array($provider, ['manual', 'xendit', 'midtrans'], true)) {
            $provider = 'manual';
        }
        $this->setSetting($companyId, $outletId, 'payment_gateway_provider', $provider);
        $this->setSetting($companyId, $outletId, 'payment_gateway_mode', ($gateway['mode'] ?? 'sandbox') === 'live' ? 'live' : 'sandbox');
        $this->setSetting($companyId, $outletId, 'payment_gateway_timeout', (string) max(3, (int) ($gateway['timeout'] ?? 15)));
        if (trim((string) ($gateway['xenditSecretKey'] ?? '')) !== '') {
            $this->setSetting($companyId, $outletId, 'xendit_secret_key', trim((string) $gateway['xenditSecretKey']));
        }
        if (trim((string) ($gateway['midtransServerKey'] ?? '')) !== '') {
            $this->setSetting($companyId, $outletId, 'midtrans_server_key', trim((string) $gateway['midtransServerKey']));
        }
    }

    private function commandLines(string $command): array
    {
        if (! function_exists('exec')) {
            return [];
        }
        $output = [];
        $code = 1;
        @exec($command . ' 2>/dev/null', $output, $code);
        return $code === 0 ? $output : [];
    }

    private function packagingRules(int $companyId, int $outletId): array
    {
        $model = new PackagingRuleModel();
        if ($this->hasCompanyColumn('packaging_rules')) {
            $model->where('company_id', $companyId);
        }
        $rules = $model
            ->where('outlet_id', $outletId)
            ->orderBy('min_qty')
            ->findAll();
        $db = Database::connect();
        return array_map(function ($rule) use ($db) {
            $lines = $db->table('packaging_rule_items')->where('packaging_rule_id', $rule['id'])->get()->getResultArray();
            return [
                'id' => 'pack-rule-' . $rule['id'],
                'minQty' => (int) $rule['min_qty'],
                'maxQty' => (int) $rule['max_qty'],
                'status' => StatusCodeService::common($rule['status'] ?? ''),
                'items' => $this->packagingLines($lines, false),
                'fallbackItems' => $this->packagingLines($lines, true),
            ];
        }, $rules);
    }

    private function packagingLines(array $lines, bool $fallback): array
    {
        return array_values(array_map(fn ($line) => [
            'ingredientId' => $this->ingredientCode(['id' => $line['outlet_ingredient_id']]),
            'qty' => (float) $line['qty'],
            'price' => (float) $line['price'],
        ], array_filter($lines, fn ($line) => (int) $line['is_fallback'] === ($fallback ? 1 : 0))));
    }

    private function insertPackagingLine(PackagingRuleItemModel $model, int $ruleId, array $line, bool $fallback): void
    {
        $ingredientId = $this->ingredientId($line['ingredientId'] ?? '');
        if (!$ingredientId) {
            return;
        }
        $ingredient = Database::connect()->table('outlet_ingredients')->where('id', $ingredientId)->get()->getRowArray();
        if (! $ingredient || strtolower((string) ($ingredient['category'] ?? '')) !== 'packaging') {
            throw new \InvalidArgumentException('Packaging rule hanya boleh memakai bahan dengan kategori Packaging.');
        }
        $model->insert([
            'packaging_rule_id' => $ruleId,
            'outlet_ingredient_id' => $ingredientId,
            'qty' => (float) ($line['qty'] ?? 1),
            'price' => (float) ($line['price'] ?? 0),
            'is_fallback' => $fallback ? 1 : 0,
        ]);
    }

    private function numericId(string $legacyId): int
    {
        if (!$legacyId) {
            return 0;
        }
        if (ctype_digit($legacyId)) {
            return (int) $legacyId;
        }
        if (preg_match('/(\d+)$/', $legacyId, $matches)) {
            return (int) $matches[1];
        }
        return 0;
    }

    private function findResource(array $items, string $id): array
    {
        foreach ($items as $item) {
            if (($item['id'] ?? '') === $id) {
                return $item;
            }
        }
        return ['id' => $id, 'status' => StatusCodeService::INACTIVE];
    }

    private function arrayPage(array $items, array $filters = []): array
    {
        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = min(100, max(1, (int) ($filters['per_page'] ?? $filters['perPage'] ?? 25)));
        $total = count($items);
        return [
            'items' => array_slice($items, ($page - 1) * $perPage, $perPage),
            'meta' => [
                'page' => $page,
                'perPage' => $perPage,
                'total' => $total,
                'totalPages' => (int) max(1, ceil($total / max(1, $perPage))),
            ],
        ];
    }

    private function ingredientId(string $legacyId): int
    {
        return $this->numericId($legacyId);
    }

    private function ingredientCode(array $row): string
    {
        return 'ing-' . ($row['id'] ?? uniqid());
    }

    private function hasCompanyColumn(string $table): bool
    {
        $db = Database::connect();
        return $db->tableExists($table) && $db->fieldExists('company_id', $table);
    }


}
