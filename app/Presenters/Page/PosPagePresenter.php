<?php

namespace App\Presenters\Page;

use App\Services\StatusCodeService;

class PosPagePresenter
{
    public function bootstrap(array $settingsData, array $productData, array $orders, array $meta = []): array
    {
        return [
            'settings' => $this->posSettings($settingsData['settings'] ?? []),
            'categories' => array_values(array_map(fn ($row) => $this->posCategory($row), $this->activeRows($productData['categories'] ?? []))),
            'products' => array_values(array_map(fn ($row) => $this->posProduct($row), $this->activeRows($productData['products'] ?? []))),
            'modifiers' => array_values(array_map(fn ($row) => $this->posModifier($row), $this->activeRows($productData['modifiers'] ?? []))),
            'ingredients' => array_values(array_map(fn ($row) => $this->posIngredient($row), $this->activeRows($productData['ingredients'] ?? ($settingsData['ingredients'] ?? [])))),
            'transactions' => array_values(array_map(fn ($row) => $this->posOrder($row), $orders['items'] ?? [])),
            'meta' => [
                'date' => $meta['date'] ?? date('Y-m-d'),
                'orders' => $orders['meta'] ?? [],
                'scope' => 'pos_today_plus_open',
                'payload' => 'lean_pos',
            ],
        ];
    }

    private function posSettings(array $settings): array
    {
        return [
            'costingMethod' => $settings['costingMethod'] ?? 'average',
            'companyName' => $settings['companyName'] ?? '',
            'companyLogoUrl' => $settings['companyLogoUrl'] ?? '',
            'themeColor' => $settings['themeColor'] ?? '#6e3a16',
            'outletName' => $settings['outletName'] ?? '',
            'outletCode' => $settings['outletCode'] ?? '',
            'outletAddress' => $settings['outletAddress'] ?? '',
            'taxRate' => (float) ($settings['taxRate'] ?? 0),
            'dineInServiceRate' => (float) ($settings['dineInServiceRate'] ?? 0),
            'printerName' => $settings['printerName'] ?? '',
            'tableServiceMode' => $settings['tableServiceMode'] ?? 'free_seating_pay_first',
            'orderChannels' => $settings['orderChannels'] ?? ['dineIn' => false, 'takeAway' => true, 'delivery' => false],
            'diningTables' => array_values(array_map(fn ($row) => $this->only($row, [
                'id', 'name', 'area', 'capacity', 'status',
            ]), $this->activeRows($settings['diningTables'] ?? []))),
            'paymentMethods' => array_values(array_map(fn ($row) => $this->only($row, [
                'id', 'name', 'type', 'status', 'isDefault', 'sortOrder',
                'gatewayProvider', 'qrisMode', 'qrisImageUrl', 'cardMode',
                'edcMode', 'bank', 'terminalId', 'channelCode',
                'feeRate', 'feeFixed', 'feePayer',
            ]), $this->activeRows($settings['paymentMethods'] ?? []))),
            'packagingRules' => array_values(array_map(fn ($row) => $this->posPackagingRule($row), $this->activeRows($settings['packagingRules'] ?? []))),
        ];
    }

    private function posCategory(array $row): array
    {
        return $this->only($row, [
            'id', 'companyId', 'outletId', 'name', 'scope', 'status', 'sortOrder',
        ]);
    }

    private function posProduct(array $row): array
    {
        return [
            'id' => $row['id'] ?? '',
            'companyId' => $row['companyId'] ?? '',
            'outletId' => $row['outletId'] ?? '',
            'sku' => $row['sku'] ?? '',
            'name' => $row['name'] ?? '',
            'price' => (float) ($row['price'] ?? 0),
            'category' => $row['category'] ?? 'Belum dikategorikan',
            'categoryId' => $row['categoryId'] ?? '',
            'status' => $row['status'] ?? '',
            'imageUrl' => $row['imageUrl'] ?? '',
            'description' => $row['description'] ?? '',
            'scope' => $row['scope'] ?? 'company',
            'inventoryType' => $row['inventoryType'] ?? 'made_to_order',
            'isPreorder' => ! empty($row['isPreorder']),
            'preorderNote' => $row['preorderNote'] ?? '',
            'finishedStock' => (float) ($row['finishedStock'] ?? 0),
            'finishedUnitCost' => (float) ($row['finishedUnitCost'] ?? 0),
            'modifierIds' => array_values($row['modifierIds'] ?? []),
            'recipe' => array_values(array_map(fn ($line) => $this->posRecipeLine($line), $row['recipe'] ?? [])),
        ];
    }

    private function posRecipeLine(array $line): array
    {
        return [
            'ingredientId' => $line['ingredientId'] ?? '',
            'ingredientName' => $line['ingredientName'] ?? '',
            'templateId' => $line['templateId'] ?? '',
            'templateName' => $line['templateName'] ?? '',
            'missingIngredient' => (bool) ($line['missingIngredient'] ?? false),
            'qty' => (float) ($line['qty'] ?? 0),
            'unit' => $line['unit'] ?? '',
        ];
    }

    private function posModifier(array $row): array
    {
        return [
            'id' => $row['id'] ?? '',
            'companyId' => $row['companyId'] ?? '',
            'outletId' => $row['outletId'] ?? '',
            'name' => $row['name'] ?? '',
            'requiredSelection' => (bool) ($row['requiredSelection'] ?? false),
            'choiceType' => $row['choiceType'] ?? 'multiple',
            'scope' => $row['scope'] ?? 'company',
            'status' => $row['status'] ?? '',
            'options' => array_values(array_map(fn ($option) => $this->posModifierOption($option), $row['options'] ?? [])),
        ];
    }

    private function posModifierOption(array $row): array
    {
        return [
            'id' => $row['id'] ?? '',
            'name' => $row['name'] ?? '',
            'priceDelta' => (float) ($row['priceDelta'] ?? 0),
            'action' => $row['action'] ?? 'set',
            'ingredientId' => $row['ingredientId'] ?? '',
            'ingredientName' => $row['ingredientName'] ?? '',
            'templateId' => $row['templateId'] ?? '',
            'templateName' => $row['templateName'] ?? '',
            'missingIngredient' => (bool) ($row['missingIngredient'] ?? false),
            'replacementIngredientId' => $row['replacementIngredientId'] ?? '',
            'replacementIngredientName' => $row['replacementIngredientName'] ?? '',
            'replacementTemplateId' => $row['replacementTemplateId'] ?? '',
            'replacementTemplateName' => $row['replacementTemplateName'] ?? '',
            'missingReplacementIngredient' => (bool) ($row['missingReplacementIngredient'] ?? false),
            'qty' => (float) ($row['qty'] ?? 0),
        ];
    }

    private function posIngredient(array $row): array
    {
        return [
            'id' => $row['id'] ?? '',
            'templateId' => $row['templateId'] ?? '',
            'templateName' => $row['templateName'] ?? '',
            'templateCategory' => $row['templateCategory'] ?? '',
            'companyId' => $row['companyId'] ?? '',
            'outletId' => $row['outletId'] ?? '',
            'sku' => $row['sku'] ?? '',
            'name' => $row['name'] ?? '',
            'category' => $row['category'] ?? '',
            'unit' => $row['unit'] ?? '',
            'stock' => (float) ($row['stock'] ?? 0),
            'avgCost' => (float) ($row['avgCost'] ?? 0),
            'standardCost' => (float) ($row['standardCost'] ?? 0),
            'status' => $row['status'] ?? '',
        ];
    }

    private function posOrder(array $row): array
    {
        return [
            'id' => $row['id'] ?? '',
            'companyId' => $row['companyId'] ?? '',
            'outletId' => $row['outletId'] ?? '',
            'orderNumber' => $row['orderNumber'] ?? '',
            'createdAt' => $row['createdAt'] ?? '',
            'statusUpdatedAt' => $row['statusUpdatedAt'] ?? '',
            'status' => $row['status'] ?? '',
            'readyItemKeys' => array_values($row['readyItemKeys'] ?? []),
            'serviceType' => $row['serviceType'] ?? '',
            'tableFlow' => $row['tableFlow'] ?? '',
            'tableName' => $row['tableName'] ?? '-',
            'customerName' => $row['customerName'] ?? '',
            'customerEmail' => $row['customerEmail'] ?? '',
            'customerPhone' => $row['customerPhone'] ?? '',
            'items' => array_values(array_map(fn ($item) => $this->posOrderItem($item), $row['items'] ?? [])),
            'lastOrderItems' => array_values(array_map(fn ($item) => $this->posOrderItem($item), $row['lastOrderItems'] ?? ($row['items'] ?? []))),
            'productRevenue' => (float) ($row['productRevenue'] ?? 0),
            'serviceCharge' => (float) ($row['serviceCharge'] ?? 0),
            'packagingFee' => (float) ($row['packagingFee'] ?? 0),
            'paymentFee' => (float) ($row['paymentFee'] ?? 0),
            'paymentFeePayer' => $row['paymentFeePayer'] ?? 'merchant',
            'packagingSource' => $row['packagingSource'] ?? '',
            'packagingNote' => $row['packagingNote'] ?? '',
            'revenue' => (float) ($row['revenue'] ?? 0),
            'cogs' => (float) ($row['cogs'] ?? 0),
            'profit' => (float) ($row['profit'] ?? 0),
            'tax' => (float) ($row['tax'] ?? 0),
            'total' => (float) ($row['total'] ?? 0),
            'paymentStatus' => $row['paymentStatus'] ?? '',
            'paidAt' => $row['paidAt'] ?? '',
            'paymentMethod' => $row['paymentMethod'] ?? '',
            'cashTendered' => (float) ($row['cashTendered'] ?? 0),
            'changeDue' => (float) ($row['changeDue'] ?? 0),
            'paymentProvider' => $row['paymentProvider'] ?? '',
            'paymentReference' => $row['paymentReference'] ?? '',
            'paymentProofUrl' => $row['paymentProofUrl'] ?? '',
            'paymentProofNote' => $row['paymentProofNote'] ?? '',
        ];
    }

    private function posOrderItem(array $row): array
    {
        return [
            'productId' => $row['productId'] ?? '',
            'name' => $row['name'] ?? '',
            'qty' => (float) ($row['qty'] ?? 0),
            'price' => (float) ($row['price'] ?? 0),
            'cogs' => (float) ($row['cogs'] ?? 0),
            'modifierIds' => array_values($row['modifierIds'] ?? []),
            'modifiers' => array_values($row['modifiers'] ?? []),
            'isPreorder' => (bool) ($row['isPreorder'] ?? false),
            'isPackaging' => (bool) ($row['isPackaging'] ?? false),
            'ingredientId' => $row['ingredientId'] ?? '',
            'treatment' => $row['treatment'] ?? '',
            'reason' => $row['reason'] ?? '',
            'lossCost' => (float) ($row['lossCost'] ?? 0),
            'recipeUsage' => array_values(array_map(fn ($line) => [
                'ingredientId' => $line['ingredientId'] ?? '',
                'qty' => (float) ($line['qty'] ?? 0),
                'unit' => $line['unit'] ?? '',
            ], $row['recipeUsage'] ?? [])),
        ];
    }

    private function posPackagingRule(array $row): array
    {
        return [
            'id' => $row['id'] ?? '',
            'name' => $row['name'] ?? '',
            'minQty' => (float) ($row['minQty'] ?? 0),
            'maxQty' => (float) ($row['maxQty'] ?? 0),
            'status' => $row['status'] ?? '',
            'items' => array_values(array_map(fn ($item) => $this->posPackagingItem($item), $row['items'] ?? [])),
            'fallbackItems' => array_values(array_map(fn ($item) => $this->posPackagingItem($item), $row['fallbackItems'] ?? [])),
        ];
    }

    private function posPackagingItem(array $row): array
    {
        return [
            'ingredientId' => $row['ingredientId'] ?? '',
            'name' => $row['name'] ?? '',
            'qty' => (float) ($row['qty'] ?? 0),
            'price' => (float) ($row['price'] ?? 0),
            'type' => $row['type'] ?? '',
        ];
    }

    private function only(array $row, array $keys): array
    {
        $result = [];
        foreach ($keys as $key) {
            if (array_key_exists($key, $row)) {
                $result[$key] = $row[$key];
            }
        }
        return $result;
    }

    private function activeRows(array $rows): array
    {
        return array_values(array_filter($rows, fn ($row) => ! StatusCodeService::isInactive($row['status'] ?? StatusCodeService::ACTIVE)));
    }
}
