<?php

namespace App\Services;

use App\Models\CategoryModel;
use App\Models\IngredientModel;
use App\Models\ModifierModel;
use App\Models\ModifierOptionModel;
use App\Models\ModifierOptionOutletPriceModel;
use App\Models\ProductModel;
use App\Models\ProductOutletCategoryModel;
use App\Models\ProductOutletPriceModel;
use App\Models\ProductSuiteModel;
use App\Models\RecipeIngredientModel;
use Config\Database;

class ProductSuiteService
{
    private $db;
    private ProductSuiteModel $suite;
    private CategoryModel $categories;
    private ProductModel $products;
    private ProductOutletCategoryModel $productCategories;
    private ProductOutletPriceModel $productPrices;
    private ModifierModel $modifiers;
    private ModifierOptionModel $modifierOptions;
    private ModifierOptionOutletPriceModel $modifierOptionPrices;
    private RecipeIngredientModel $recipes;

    public function __construct()
    {
        $this->db = Database::connect();
        $this->suite = new ProductSuiteModel();
        $this->categories = new CategoryModel();
        $this->products = new ProductModel();
        $this->productCategories = new ProductOutletCategoryModel();
        $this->productPrices = new ProductOutletPriceModel();
        $this->modifiers = new ModifierModel();
        $this->modifierOptions = new ModifierOptionModel();
        $this->modifierOptionPrices = new ModifierOptionOutletPriceModel();
        $this->recipes = new RecipeIngredientModel();
    }

    public function data(int $companyId, int $outletId): array
    {
        $categories = $this->suite->categories($companyId, $outletId);
        $products = $this->suite->products($companyId, $outletId);
        $modifiers = $this->suite->modifiers($companyId, $outletId);
        $ingredients = $this->ingredientsWithMappings($companyId, $outletId);
        $templates = $this->suite->ingredientTemplates($companyId);
        $recipeRows = $this->suite->recipeRows($companyId);
        $modifierOptions = $this->suite->modifierOptions(array_column($modifiers, 'id'), $companyId, $outletId);
        $productModifiers = $this->suite->productModifiers(array_column($products, 'id'));

        return [
            'categories' => array_map(fn ($row) => $this->categoryPayload($row), $categories),
            'products' => array_map(fn ($row) => $this->productPayload($row, $categories, $recipeRows, $productModifiers, $ingredients, $templates, $outletId), $products),
            'modifiers' => array_map(fn ($row) => $this->modifierPayload($row, $modifierOptions, $ingredients), $modifiers),
            'ingredients' => array_map(fn ($row) => $this->ingredientPayload($row), $ingredients),
        ];
    }

    public function saveCategory(array $payload, int $companyId, int $outletId, array $auth = []): array
    {
        $id = $this->categoryId($payload['id'] ?? '');
        $existing = $id ? $this->categories->find($id) : null;
        if ($existing && ! $this->rowBelongsToCompany($existing, $companyId)) {
            throw new \InvalidArgumentException('Kategori tidak ditemukan.');
        }
        $canManageGlobal = $this->canManageGlobalMasters($auth, $companyId);
        $access = $this->masterAccess($auth, $companyId);
        if (! $this->canAccessOutlet($access, $outletId)) {
            throw new \InvalidArgumentException('Outlet aktif tidak termasuk akses user.');
        }
        if ($existing && ! $canManageGlobal && (($existing['scope'] ?? '') !== 'outlet' || (int) $existing['outlet_id'] !== $outletId)) {
            throw new \InvalidArgumentException('User Selected Outlet hanya dapat mengelola kategori outlet aktif.');
        }
        $scope = ($payload['scope'] ?? $existing['scope'] ?? 'outlet') === 'company' ? 'company' : 'outlet';
        if (! $canManageGlobal) $scope = 'outlet';
        if ($existing && ($existing['scope'] ?? '') === 'company' && $scope === 'outlet') {
            $usedByOtherOutlets = $this->productCategories
                ->where('category_id', $id)
                ->where('outlet_id !=', $outletId);
            if ($this->hasCompanyColumn('product_outlet_categories')) {
                $usedByOtherOutlets->where('company_id', $companyId);
            }
            $usedByOtherOutlets = $usedByOtherOutlets->countAllResults();
            if ($usedByOtherOutlets > 0) {
                throw new \InvalidArgumentException('Kategori masih dipakai outlet lain. Pindahkan mapping produk outlet tersebut sebelum mengubah scope.');
            }
        }
        $data = $this->withCompanyData('categories', [
            'company_id' => $companyId,
            'outlet_id' => $scope === 'outlet' ? $outletId : null,
            'name' => trim((string) ($payload['name'] ?? 'Kategori Baru')),
            'description' => $payload['description'] ?? '',
            'scope' => $scope === 'outlet' ? 'outlet' : 'company',
            'status' => StatusCodeService::common($payload['status'] ?? 'active'),
        ], $companyId);

        if ($id) {
            $this->categories->update($id, $data);
        } else {
            $this->categories->insert($data);
            $id = (int) $this->categories->getInsertID();
        }

        return $this->categoryDetail((string) $id, $companyId, $outletId);
    }

    public function categoryPage(int $companyId, int $outletId, array $filters = []): array
    {
        $rows = $this->suite->categories($companyId, $outletId);
        if (($filters['search'] ?? '') !== '') {
            $search = strtolower((string) $filters['search']);
            $rows = array_values(array_filter($rows, fn ($row) => str_contains(strtolower($row['name'] ?? ''), $search)));
        }
        if (($filters['status'] ?? '') !== '') {
            $rows = array_values(array_filter($rows, fn ($row) => ($row['status'] ?? '') === $filters['status']));
        }
        return $this->arrayPage(array_map(fn ($row) => $this->categoryPayload($row), $rows), $filters);
    }

    public function categoryDetail(string $legacyId, int $companyId, int $outletId): array
    {
        $id = $this->categoryId($legacyId);
        $row = null;
        foreach ($this->suite->categories($companyId, $outletId) as $category) {
            if ((int) $category['id'] === (int) $id) {
                $row = $category;
                break;
            }
        }
        if (! $row) throw new \InvalidArgumentException('Kategori tidak ditemukan.');
        return $this->categoryPayload($row);
    }

    public function deactivateCategory(string $legacyId, int $companyId, int $outletId, array $auth = []): array
    {
        $id = $this->categoryId($legacyId);
        $row = $id ? $this->categories->find($id) : null;
        if (! $row || ! $this->rowBelongsToCompany($row, $companyId)) throw new \InvalidArgumentException('Kategori tidak ditemukan.');
        if (! $this->canAccessOutlet($this->masterAccess($auth, $companyId), $outletId)) {
            throw new \InvalidArgumentException('Outlet aktif tidak termasuk akses user.');
        }
        if (! $this->canManageGlobalMasters($auth, $companyId) && (($row['scope'] ?? '') !== 'outlet' || (int) $row['outlet_id'] !== $outletId)) {
            throw new \InvalidArgumentException('User Selected Outlet hanya dapat mengelola kategori outlet aktif.');
        }
        $this->categories->update($id, ['status' => StatusCodeService::INACTIVE]);
        return $this->categoryDetail((string) $id, $companyId, $outletId);
    }

    public function saveProduct(array $payload, int $companyId, int $outletId, array $auth = []): array
    {
        $id = $this->productId($payload['id'] ?? '');
        $existing = $id ? $this->products->find($id) : null;
        $scope = $this->writableMasterScope('produk', $existing, $payload, $companyId, $outletId, $auth);
        $categoryId = $this->categoryId($payload['categoryId'] ?? $payload['category_id'] ?? '');
        if ($categoryId) {
            $category = $this->categories->find($categoryId);
            if (! $category || ! $this->rowBelongsToCompany($category, $companyId) || ($category['outlet_id'] && (int) $category['outlet_id'] !== $outletId)) {
                throw new \InvalidArgumentException('Kategori tidak tersedia untuk outlet aktif.');
            }
            if (($category['scope'] ?? '') === 'company' && ! $this->canManageGlobalMasters($auth, $companyId)) {
                throw new \InvalidArgumentException('Kategori global hanya dapat dipilih user All Outlet.');
            }
        }
        $data = $this->withCompanyData('products', [
            'company_id' => $companyId,
            'outlet_id' => $scope === 'outlet' ? $outletId : null,
            'sku' => trim((string) ($payload['sku'] ?? $this->nextProductSku($companyId))),
            'name' => trim((string) ($payload['name'] ?? 'Produk Baru')),
            'description' => trim((string) ($payload['description'] ?? '')),
            'image_path' => trim((string) ($payload['imageUrl'] ?? $payload['image_path'] ?? '')),
            'selling_price' => (float) ($payload['price'] ?? $payload['selling_price'] ?? 0),
            'scope' => $scope === 'outlet' ? 'outlet' : 'company',
            'recipe_status' => StatusCodeService::RECIPE_DRAFT,
            'inventory_type' => in_array($payload['inventoryType'] ?? $payload['inventory_type'] ?? '', ['finished_good', 'made_to_stock', 'retail'], true)
                ? (($payload['inventoryType'] ?? $payload['inventory_type']) === 'retail' ? 'retail' : 'finished_good')
                : 'made_to_order',
            'shelf_life_days' => max(0, (int) ($payload['shelfLifeDays'] ?? $payload['shelf_life_days'] ?? 0)),
            'status' => StatusCodeService::common($payload['status'] ?? 'active'),
            'is_preorder' => ! empty($payload['isPreorder']) ? 1 : 0,
            'preorder_note' => trim((string) ($payload['preorderNote'] ?? '')),
        ], $companyId);

        if ($id) {
            $this->products->update($id, $data);
        } else {
            $this->products->insert($data);
            $id = (int) $this->products->getInsertID();
        }

        if ($categoryId) $this->saveProductOutletCategory($id, $categoryId, $companyId, $outletId);

        return $this->productDetail((string) $id, $companyId, $outletId);
    }

    public function saveProductOutletPrice(string $legacyId, array $payload, int $companyId, int $outletId, array $auth = []): array
    {
        $productId = $this->productId($legacyId);
        if (! $this->canAccessOutlet($this->masterAccess($auth, $companyId), $outletId)) {
            throw new \InvalidArgumentException('Outlet aktif tidak termasuk akses user.');
        }
        $product = $productId ? $this->suite->productRow($companyId, $outletId, $productId) : null;
        if (! $product) {
            throw new \InvalidArgumentException('Produk tidak ditemukan.');
        }

        $price = (float) ($payload['price'] ?? $payload['selling_price'] ?? 0);
        if ($price <= 0) {
            throw new \InvalidArgumentException('Harga outlet wajib lebih dari 0.');
        }

        $existing = $this->productPrices
            ->where('outlet_id', $outletId)
            ->where('product_id', $productId)
;
        if ($this->hasCompanyColumn('product_outlet_prices')) {
            $existing->where('company_id', $companyId);
        }
        $existing = $existing->first();

        $data = $this->withCompanyData('product_outlet_prices', [
            'company_id' => $companyId,
            'outlet_id' => $outletId,
            'product_id' => $productId,
            'selling_price' => $price,
            'note' => trim((string) ($payload['note'] ?? '')),
            'status' => StatusCodeService::common($payload['status'] ?? 'active'),
        ], $companyId);

        if ($existing) {
            $this->productPrices->update($existing['id'], $data);
        } else {
            $this->productPrices->insert($data);
        }

        return $this->productDetail((string) $productId, $companyId, $outletId);
    }

    public function saveProductOutletCategoryMapping(string $legacyId, array $payload, int $companyId, int $outletId, array $auth = []): array
    {
        if (! $this->canAccessOutlet($this->masterAccess($auth, $companyId), $outletId)) {
            throw new \InvalidArgumentException('Outlet aktif tidak termasuk akses user.');
        }
        $productId = $this->productId($legacyId);
        $product = $productId ? $this->suite->productRow($companyId, $outletId, $productId) : null;
        if (! $product) throw new \InvalidArgumentException('Produk tidak tersedia di outlet aktif.');

        $categoryId = $this->categoryId($payload['categoryId'] ?? $payload['category_id'] ?? '');
        $category = $categoryId ? $this->categories->find($categoryId) : null;
        if (! $category || ! $this->rowBelongsToCompany($category, $companyId) || ($category['outlet_id'] && (int) $category['outlet_id'] !== $outletId)) {
            throw new \InvalidArgumentException('Kategori tidak tersedia di outlet aktif.');
        }
        if (($category['scope'] ?? '') === 'company' && ! $this->canManageGlobalMasters($auth, $companyId)) {
            throw new \InvalidArgumentException('Kategori global hanya dapat dipilih user All Outlet.');
        }

        $this->saveProductOutletCategory($productId, $categoryId, $companyId, $outletId);
        return $this->productDetail((string) $productId, $companyId, $outletId);
    }

    public function deleteProductOutletCategoryMapping(string $legacyId, int $companyId, int $outletId, array $auth = []): array
    {
        if (! $this->canAccessOutlet($this->masterAccess($auth, $companyId), $outletId)) {
            throw new \InvalidArgumentException('Outlet aktif tidak termasuk akses user.');
        }
        $productId = $this->productId($legacyId);
        $product = $productId ? $this->suite->productRow($companyId, $outletId, $productId) : null;
        if (! $product) throw new \InvalidArgumentException('Produk tidak tersedia di outlet aktif.');

        $builder = $this->productCategories
            ->where('outlet_id', $outletId)
            ->where('product_id', $productId);
        if ($this->hasCompanyColumn('product_outlet_categories')) {
            $builder->where('company_id', $companyId);
        }
        $builder->delete();
        return $this->productDetail((string) $productId, $companyId, $outletId);
    }

    public function productPage(int $companyId, int $outletId, array $filters = []): array
    {
        $page = $this->suite->productPage($companyId, $outletId, $filters);
        $categories = $this->suite->categories($companyId, $outletId);
        $recipeRows = $this->suite->recipeRows($companyId);
        $ingredients = $this->ingredientsWithMappings($companyId, $outletId);
        $templates = $this->suite->ingredientTemplates($companyId);
        $productModifiers = $this->suite->productModifiers(array_column($page['rows'], 'id'));

        return [
            'items' => array_map(fn ($row) => $this->productPayload($row, $categories, $recipeRows, $productModifiers, $ingredients, $templates, $outletId), $page['rows']),
            'meta' => $this->paginationMeta($page['page'], $page['perPage'], $page['total']),
        ];
    }

    public function productDetail(string $legacyId, int $companyId, int $outletId): array
    {
        $id = $this->productId($legacyId);
        $row = $id ? $this->suite->productRow($companyId, $outletId, $id) : null;
        if (! $row) {
            throw new \InvalidArgumentException('Produk tidak ditemukan.');
        }

        return $this->productPayload(
            $row,
            $this->suite->categories($companyId, $outletId),
            $this->suite->recipeRows($companyId),
            $this->suite->productModifiers([$id]),
            $this->ingredientsWithMappings($companyId, $outletId),
            $this->suite->ingredientTemplates($companyId),
            $outletId
        );
    }

    public function deactivateProduct(string $legacyId, int $companyId, int $outletId, array $auth = []): array
    {
        $id = $this->productId($legacyId);
        $row = $id ? $this->products->find($id) : null;
        if (! $row || ! $this->rowBelongsToCompany($row, $companyId)) throw new \InvalidArgumentException('Produk tidak ditemukan.');
        $this->writableMasterScope('produk', $row, ['scope' => $row['scope']], $companyId, $outletId, $auth);

        $this->products->update($id, ['status' => StatusCodeService::INACTIVE]);
        return $this->productDetail((string) $id, $companyId, $outletId);
    }

    public function saveModifier(array $payload, int $companyId, int $outletId, array $auth = []): array
    {
        $id = $this->modifierId($payload['id'] ?? '');
        $existing = $id ? $this->modifiers->find($id) : null;
        $scope = $this->writableMasterScope('modifier', $existing, $payload, $companyId, $outletId, $auth);
        $data = $this->withCompanyData('modifiers', [
            'company_id' => $companyId,
            'outlet_id' => $scope === 'outlet' ? $outletId : null,
            'name' => trim((string) ($payload['name'] ?? 'Modifier Baru')),
            'selection_type' => $this->modifierSelectionType($payload),
            'scope' => $scope === 'outlet' ? 'outlet' : 'company',
            'status' => StatusCodeService::common($payload['status'] ?? 'active'),
        ], $companyId);

        $this->db->transStart();
        if ($id) {
            $this->modifiers->update($id, $data);
        } else {
            $this->modifiers->insert($data);
            $id = (int) $this->modifiers->getInsertID();
        }

        $this->modifierOptions->where('modifier_id', $id)->delete();
        foreach (($payload['options'] ?? []) as $option) {
            $this->modifierOptions->insert([
                'modifier_id' => $id,
                'name' => trim((string) ($option['name'] ?? 'Opsi')),
                'price_delta' => (float) ($option['priceDelta'] ?? 0),
                'ingredient_rules' => json_encode([$this->optionRule($option)]),
                'status' => StatusCodeService::common($option['status'] ?? 'active'),
            ]);
        }
        $this->db->transComplete();

        return $this->modifierDetail((string) $id, $companyId, $outletId);
    }

    public function modifierPage(int $companyId, int $outletId, array $filters = []): array
    {
        $modifiers = $this->suite->modifiers($companyId, $outletId);
        if (($filters['search'] ?? '') !== '') {
            $search = strtolower((string) $filters['search']);
            $modifiers = array_values(array_filter($modifiers, fn ($row) => str_contains(strtolower($row['name'] ?? ''), $search)));
        }
        if (($filters['status'] ?? '') !== '') {
            $modifiers = array_values(array_filter($modifiers, fn ($row) => ($row['status'] ?? '') === $filters['status']));
        }

        return $this->arrayPage(
            array_map(
                fn ($row) => $this->modifierPayload($row, $this->suite->modifierOptions(array_column($modifiers, 'id'), $companyId, $outletId), $this->ingredientsWithMappings($companyId, $outletId)),
                $modifiers
            ),
            $filters
        );
    }

    public function modifierDetail(string $legacyId, int $companyId, int $outletId): array
    {
        $id = $this->modifierId($legacyId);
        $row = null;
        $modifiers = $this->suite->modifiers($companyId, $outletId);
        foreach ($modifiers as $modifier) {
            if ((int) $modifier['id'] === (int) $id) {
                $row = $modifier;
                break;
            }
        }
        if (! $row) throw new \InvalidArgumentException('Modifier tidak ditemukan.');
        return $this->modifierPayload($row, $this->suite->modifierOptions([$id], $companyId, $outletId), $this->ingredientsWithMappings($companyId, $outletId));
    }

    public function saveModifierOptionOutletPrice(array $payload, int $companyId, int $outletId): array
    {
        $modifierId = $this->modifierId($payload['modifierId'] ?? $payload['modifier_id'] ?? '');
        $optionId = $this->modifierOptionId($payload['optionId'] ?? $payload['option_id'] ?? '');
        $modifier = $modifierId ? $this->modifiers->find($modifierId) : null;
        $option = $optionId ? $this->modifierOptions->find($optionId) : null;
        if (! $modifier || ! $this->rowBelongsToCompany($modifier, $companyId) || ! $option || (int) $option['modifier_id'] !== $modifierId) {
            throw new \InvalidArgumentException('Opsi modifier tidak ditemukan.');
        }

        $price = (float) ($payload['priceDelta'] ?? $payload['price_delta'] ?? 0);
        if ($price < 0) {
            throw new \InvalidArgumentException('Harga tambahan modifier tidak boleh minus.');
        }

        $existing = $this->modifierOptionPrices
            ->where('outlet_id', $outletId)
            ->where('modifier_option_id', $optionId)
;
        if ($this->hasCompanyColumn('modifier_option_outlet_prices')) {
            $existing->where('company_id', $companyId);
        }
        $existing = $existing->first();

        $data = $this->withCompanyData('modifier_option_outlet_prices', [
            'company_id' => $companyId,
            'outlet_id' => $outletId,
            'modifier_option_id' => $optionId,
            'price_delta' => $price,
            'note' => trim((string) ($payload['note'] ?? '')),
            'status' => StatusCodeService::common($payload['status'] ?? 'active'),
        ], $companyId);

        if ($existing) {
            $this->modifierOptionPrices->update($existing['id'], $data);
        } else {
            $this->modifierOptionPrices->insert($data);
        }

        return $this->modifierDetail((string) $modifierId, $companyId, $outletId);
    }

    public function deactivateModifier(string $legacyId, int $companyId, int $outletId, array $auth = []): array
    {
        $id = $this->modifierId($legacyId);
        $row = $id ? $this->modifiers->find($id) : null;
        if (! $row || ! $this->rowBelongsToCompany($row, $companyId)) throw new \InvalidArgumentException('Modifier tidak ditemukan.');
        $this->writableMasterScope('modifier', $row, ['scope' => $row['scope']], $companyId, $outletId, $auth);
        $this->modifiers->update($id, ['status' => StatusCodeService::INACTIVE]);
        return $this->modifierDetail((string) $id, $companyId, $outletId);
    }

    public function saveRecipeLine(array $payload, int $companyId, int $outletId, array $auth = []): array
    {
        $productId = $this->productId($payload['productId'] ?? $payload['product_id'] ?? '');
        $product = $productId ? $this->products->find($productId) : null;
        if (! $product || ! $this->rowBelongsToCompany($product, $companyId)) throw new \InvalidArgumentException('Produk tidak ditemukan.');
        $this->writableMasterScope('recipe', $product, ['scope' => $product['scope']], $companyId, $outletId, $auth);
        $templateId = $this->templateId($payload['templateId'] ?? $payload['template_id'] ?? null, $companyId);
        $originalTemplateId = $this->templateId($payload['originalTemplateId'] ?? null, $companyId);
        if (! $productId || ! $templateId) throw new \InvalidArgumentException('Produk atau master bahan tidak ditemukan.');

        $this->db->transStart();
        if ($originalTemplateId && $originalTemplateId !== $templateId) {
            $delete = $this->recipes->where('product_id', $productId)->where('template_id', $originalTemplateId);
            if ($this->hasCompanyColumn('product_recipe_items')) {
                $delete->where('company_id', $companyId);
            }
            $delete->delete();
        }
        $existing = $this->recipes->where('product_id', $productId)->where('template_id', $templateId);
        if ($this->hasCompanyColumn('product_recipe_items')) {
            $existing->where('company_id', $companyId);
        }
        $existing = $existing->first();
        $data = $this->withCompanyData('product_recipe_items', [
            'company_id' => $companyId,
            'product_id' => $productId,
            'template_id' => $templateId,
            'qty' => (float) ($payload['qty'] ?? 0),
            'unit' => $payload['unit'] ?? $this->templateUnit($templateId),
        ], $companyId);
        if ($existing) $this->recipes->update($existing['id'], $data);
        else $this->recipes->insert($data);

        $this->products->update($productId, ['recipe_status' => StatusCodeService::RECIPE_READY]);
        $this->db->transComplete();
        $template = $this->findById($this->suite->ingredientTemplates($companyId), $templateId) ?: ['id' => $templateId];
        return [
            'productId' => $this->productCode(['id' => $productId]),
            'templateId' => $this->templateCode($template),
            'qty' => (float) ($payload['qty'] ?? 0),
            'unit' => $data['unit'],
        ];
    }

    public function assignProductModifiers(array $payload, int $companyId, int $outletId): array
    {
        $productId = $this->productId($payload['productId'] ?? '');
        if (! $productId) throw new \InvalidArgumentException('Produk tidak ditemukan.');

        $modifierIds = array_values(array_filter(array_map(fn ($id) => $this->modifierId($id), $payload['modifierIds'] ?? [])));
        $this->db->table('product_modifiers')->where('product_id', $productId)->delete();
        foreach ($modifierIds as $modifierId) {
            $this->db->table('product_modifiers')->insert(['product_id' => $productId, 'modifier_id' => $modifierId]);
        }

        return [
            'productId' => $this->productCode(['id' => $productId]),
            'modifierIds' => array_map(fn ($id) => $this->modifierCode(['id' => $id]), $modifierIds),
        ];
    }

    public function recipePage(int $companyId, int $outletId, array $filters = []): array
    {
        $productId = $this->productId($filters['product_id'] ?? $filters['productId'] ?? '');
        $rows = $this->suite->recipeRows($companyId);
        $ingredients = $this->ingredientsWithMappings($companyId, $outletId);
        $templates = $this->suite->ingredientTemplates($companyId);
        if ($productId) {
            $rows = array_values(array_filter($rows, fn ($row) => (int) $row['product_id'] === $productId));
        }
        $items = array_map(fn ($row) => $this->recipePayload($row, $ingredients, $templates), $rows);
        return $this->arrayPage($items, $filters);
    }

    public function produceProductBatch(string $legacyProductId, array $payload, int $companyId, int $outletId): array
    {
        $productId = $this->productId($legacyProductId ?: ($payload['productId'] ?? ''));
        $product = $productId ? $this->suite->productRow($companyId, $outletId, $productId) : null;
        if (! $product) throw new \InvalidArgumentException('Produk tidak ditemukan.');
        $inventoryType = $product['inventory_type'] ?? 'made_to_order';
        if ($inventoryType === 'made_to_order') {
            throw new \InvalidArgumentException('Produk made to order tidak perlu produksi batch.');
        }

        $qty = max(0, (float) ($payload['qty'] ?? 0));
        if ($qty <= 0) throw new \InvalidArgumentException($inventoryType === 'retail' ? 'Qty stok masuk wajib lebih dari 0.' : 'Qty produksi wajib lebih dari 0.');

        $manufacturedAt = $this->dateOrNull($payload['manufacturedAt'] ?? $payload['manufactured_at'] ?? null) ?: date('Y-m-d');
        $expiredAt = $this->dateOrNull($payload['expiredAt'] ?? $payload['expired_at'] ?? null);
        if (! $expiredAt && (int) ($product['shelf_life_days'] ?? 0) > 0) {
            $expiredAt = date('Y-m-d', strtotime($manufacturedAt . ' +' . (int) $product['shelf_life_days'] . ' days'));
        }

        if ($inventoryType === 'retail') {
            $totalCost = max(0, (float) ($payload['totalCost'] ?? $payload['total_cost'] ?? 0));
            if ($totalCost <= 0) throw new \InvalidArgumentException('Total harga beli wajib lebih dari 0 untuk barang dagang.');
            $this->db->transStart();
            return $this->createProductBatch($product, $qty, $totalCost, $companyId, $outletId, $manufacturedAt, $expiredAt, $payload, 'purchase', 'Stok masuk barang dagang ');
        }

        $recipe = array_values(array_filter($this->suite->recipeRows($companyId), fn ($line) => (int) $line['product_id'] === $productId));
        if (! $recipe) throw new \InvalidArgumentException('Recipe produk belum tersedia.');
        $ingredients = $this->ingredientsWithMappings($companyId, $outletId);
        $capacity = null;
        foreach ($recipe as $line) {
            $qtyPerUnit = (float) ($line['qty'] ?? 0);
            if ($qtyPerUnit <= 0) continue;
            $ingredient = $this->ingredientForTemplate($ingredients, (int) $line['template_id']);
            if (! $ingredient || StatusCodeService::isInactive($ingredient['status'] ?? '')) {
                throw new \InvalidArgumentException('Mapping bahan outlet belum lengkap untuk produksi batch.');
            }
            $lineCapacity = (int) floor(((float) ($ingredient['stock_qty'] ?? 0)) / $qtyPerUnit);
            $capacity = $capacity === null ? $lineCapacity : min($capacity, $lineCapacity);
            if ($lineCapacity < 1) {
                throw new \InvalidArgumentException('Stok bahan ' . $ingredient['name'] . ' tidak ready untuk produksi batch.');
            }
        }
        if ($capacity === null) throw new \InvalidArgumentException('Qty recipe produk belum lengkap.');
        if ($qty > $capacity) {
            throw new \InvalidArgumentException('Qty produksi melebihi kapasitas bahan. Maksimal produksi ' . $capacity . ' unit.');
        }
        $inventory = new InventoryService();
        $totalCost = 0;

        $this->db->transStart();
        foreach ($recipe as $line) {
            if ((float) ($line['qty'] ?? 0) <= 0) continue;
            $ingredient = $this->ingredientForTemplate($ingredients, (int) $line['template_id']);
            if (! $ingredient) throw new \InvalidArgumentException('Mapping bahan outlet belum lengkap untuk produksi batch.');
            $ingredientId = $this->ingredientId($this->ingredientCode($ingredient));
            $requiredQty = (float) $line['qty'] * $qty;
            if ((float) $ingredient['stock_qty'] < $requiredQty) {
                throw new \InvalidArgumentException('Stok bahan ' . $ingredient['name'] . ' tidak cukup untuk produksi batch.');
            }
            $unitCost = (float) ($ingredient['average_cost'] ?? 0);
            $totalCost += $requiredQty * $unitCost;
            $inventory->reduceStock([
                'company_id' => $companyId,
                'outlet_id' => $outletId,
                'outlet_ingredient_id' => $ingredientId,
                'qty' => $requiredQty,
                'movement_type' => 'production_usage',
                'reference_type' => 'product_batch',
                'notes' => 'Produksi batch produk ' . ($product['name'] ?? ''),
            ]);
        }

        return $this->createProductBatch($product, $qty, $totalCost, $companyId, $outletId, $manufacturedAt, $expiredAt, $payload, 'production', 'Produksi batch produk ');
    }

    private function createProductBatch(array $product, float $qty, float $totalCost, int $companyId, int $outletId, string $manufacturedAt, ?string $expiredAt, array $payload, string $movementType, string $notePrefix): array
    {
        $productId = (int) $product['id'];
        $unitCost = $qty > 0 ? $totalCost / $qty : 0;
        $now = date('Y-m-d H:i:s');
        $this->db->table('product_batches')->insert($this->withCompanyData('product_batches', [
            'company_id' => $companyId,
            'outlet_id' => $outletId,
            'product_id' => $productId,
            'batch_no' => $payload['batchNo'] ?? (($movementType === 'purchase' ? 'RETAIL-' : 'PDBATCH-') . date('YmdHis') . '-' . $productId),
            'qty_initial' => $qty,
            'qty_remaining' => $qty,
            'unit_cost' => $unitCost,
            'manufactured_at' => $manufacturedAt,
            'expired_at' => $expiredAt,
            'status' => StatusCodeService::ACTIVE,
            'notes' => trim((string) ($payload['note'] ?? '')),
            'created_at' => $now,
            'updated_at' => $now,
        ], $companyId));
        $batchId = (int) $this->db->insertID();
        if ($this->db->tableExists('product_batch_movements')) {
            $this->db->table('product_batch_movements')->insert($this->withCompanyData('product_batch_movements', [
                'company_id' => $companyId,
                'outlet_id' => $outletId,
                'product_id' => $productId,
                'product_batch_id' => $batchId,
                'movement_type' => $movementType,
                'stock_before' => 0,
                'qty_in' => $qty,
                'qty_out' => 0,
                'stock_after' => $qty,
                'unit_cost' => $unitCost,
                'total_cost' => $totalCost,
                'notes' => $notePrefix . ($product['name'] ?? ''),
                'created_at' => $now,
                'updated_at' => $now,
            ], $companyId));
        }
        $this->db->transComplete();

        return $this->productDetail((string) $productId, $companyId, $outletId);
    }

    public function recordProductBatchLoss(string $legacyBatchId, array $payload, int $companyId, int $outletId): array
    {
        $batchId = $this->productBatchId($legacyBatchId ?: ($payload['batchId'] ?? $payload['batch_id'] ?? ''));
        $batch = $batchId ? $this->db->table('product_batches')->where('id', $batchId)->get()->getRowArray() : null;
        if (! $batch || ! $this->rowBelongsToCompany($batch, $companyId) || (int) $batch['outlet_id'] !== $outletId) {
            throw new \InvalidArgumentException('Batch produk jadi tidak ditemukan.');
        }

        $rawQty = $payload['qty'] ?? 0;
        $qty = max(0, (float) $rawQty);
        if ($qty <= 0) throw new \InvalidArgumentException('Qty loss wajib lebih dari 0.');
        if (floor($qty) !== $qty) throw new \InvalidArgumentException('Qty loss produk jadi wajib bilangan utuh.');
        if ($qty > floor((float) $batch['qty_remaining'])) throw new \InvalidArgumentException('Qty loss tidak boleh melebihi stok batch utuh yang tersedia.');
        $qtyOut = $qty;
        if ($qtyOut <= 0) throw new \InvalidArgumentException('Stok batch produk jadi sudah habis.');

        $type = in_array($payload['type'] ?? '', ['expired', 'waste', 'lost', 'sample', 'adjustment'], true)
            ? $payload['type']
            : 'waste';
        $before = (float) $batch['qty_remaining'];
        $after = max(0, $before - $qtyOut);
        $unitCost = (float) $batch['unit_cost'];
        $now = date('Y-m-d H:i:s');

        $this->db->transStart();
        $this->db->table('product_batches')->where('id', $batchId)->update([
            'qty_remaining' => $after,
            'status' => $after <= 0.0001 ? StatusCodeService::INACTIVE : StatusCodeService::ACTIVE,
            'updated_at' => $now,
            'notes' => trim((string) ($batch['notes'] ?? '') . "\nLoss {$type}: -{$qtyOut}"),
        ]);
        $this->db->table('product_batch_movements')->insert($this->withCompanyData('product_batch_movements', [
            'company_id' => $companyId,
            'outlet_id' => $outletId,
            'product_id' => (int) $batch['product_id'],
            'product_batch_id' => $batchId,
            'movement_type' => $type,
            'stock_before' => $before,
            'qty_in' => 0,
            'qty_out' => $qtyOut,
            'stock_after' => $after,
            'unit_cost' => $unitCost,
            'total_cost' => $qtyOut * $unitCost,
            'notes' => trim((string) ($payload['note'] ?? 'Loss produk jadi')),
            'created_at' => $now,
            'updated_at' => $now,
        ], $companyId));
        $this->db->transComplete();

        return $this->productDetail((string) $batch['product_id'], $companyId, $outletId);
    }

    private function ingredientsWithMappings(int $companyId, int $outletId): array
    {
        $ingredients = $this->suite->ingredients($companyId, $outletId);
        $mappings = $this->suite->ingredientMappings($companyId, $outletId);
        if (! $mappings) return $ingredients;

        $templates = [];
        foreach ($this->suite->ingredientTemplates($companyId) as $template) {
            $templates[(int) $template['id']] = $template;
        }

        $byId = [];
        foreach ($ingredients as $ingredient) {
            $byId[(int) $ingredient['id']] = $ingredient;
        }

        $mapped = [];
        foreach ($mappings as $mapping) {
            $ingredient = $byId[(int) $mapping['outlet_ingredient_id']] ?? null;
            $template = $templates[(int) $mapping['template_id']] ?? null;
            if (! $ingredient || ! $template || StatusCodeService::isInactive($ingredient['status'] ?? '')) continue;

            $copy = $ingredient;
            $copy['template_id'] = (int) $mapping['template_id'];
            $copy['template_code'] = $template['code'] ?? null;
            $copy['template_name'] = $template['name'] ?? null;
            $copy['template_category'] = $template['category'] ?? null;
            $copy['template_unit'] = $template['unit'] ?? null;
            $mapped[$mapping['template_id']] = $copy;
        }

        return array_values(array_merge($mapped, $ingredients));
    }

    private function categoryPayload(array $row): array
    {
        return [
            'id' => $this->categoryCode($row),
            'companyId' => $this->companyCode((int) ($row['company_id'] ?? 1)),
            'outletId' => $row['outlet_id'] ? $this->outletCode((int) $row['outlet_id']) : '',
            'name' => $row['name'],
            'description' => $row['description'] ?? '',
            'scope' => $row['scope'],
            'status' => StatusCodeService::common($row['status'] ?? ''),
        ];
    }

    private function productPayload(array $row, array $categories, array $recipeRows, array $productModifiers, array $ingredients, array $templates, int $activeOutletId): array
    {
        $category = $this->findById($categories, $row['outlet_category_id'] ?? null);
        $basePrice = (float) $row['selling_price'];
        $outletPrice = isset($row['outlet_selling_price']) && $row['outlet_selling_price'] !== null
            ? (float) $row['outlet_selling_price']
            : null;
        $effectivePrice = $outletPrice ?? $basePrice;
        return [
            'id' => $this->productCode($row),
            'companyId' => $this->companyCode((int) ($row['company_id'] ?? 1)),
            'outletId' => $row['outlet_id'] ? $this->outletCode((int) $row['outlet_id']) : '',
            'sku' => $row['sku'],
            'name' => $row['name'],
            'price' => $effectivePrice,
            'basePrice' => $basePrice,
            'outletPrice' => $outletPrice,
            'priceSource' => $outletPrice !== null ? 'outlet' : 'default',
            'outletPriceNote' => $row['outlet_price_note'] ?? '',
            'category' => $category['name'] ?? 'Belum dikategorikan',
            'categoryId' => $category ? $this->categoryCode($category) : '',
            'status' => StatusCodeService::common($row['status'] ?? ''),
            'imageUrl' => $row['image_path'] ?? '',
            'description' => $row['description'] ?? '',
            'scope' => $row['scope'],
            'recipe' => array_values(array_map(
                fn ($line) => $this->recipePayload($line, $ingredients, $templates),
                array_filter($recipeRows, fn ($line) => (int) $line['product_id'] === (int) $row['id'])
            )),
            'inventoryType' => $row['inventory_type'] ?? 'made_to_order',
            'shelfLifeDays' => (int) ($row['shelf_life_days'] ?? 0),
            'isPreorder' => ! empty($row['is_preorder']) ? true : false,
            'preorderNote' => $row['preorder_note'] ?? '',
            'finishedStock' => $this->productBatchStock((int) $row['id'], (int) ($row['company_id'] ?? 1), $activeOutletId),
            'finishedUnitCost' => $this->productBatchUnitCost((int) $row['id'], (int) ($row['company_id'] ?? 1), $activeOutletId),
            'batches' => $this->productBatchPayload((int) $row['id'], (int) ($row['company_id'] ?? 1), $activeOutletId),
            'modifiers' => [],
            'modifierIds' => array_values(array_map(fn ($line) => $this->modifierCode(['id' => $line['modifier_id']]), array_filter($productModifiers, fn ($line) => (int) $line['product_id'] === (int) $row['id']))),
        ];
    }

    private function modifierPayload(array $row, array $options, array $ingredients): array
    {
        return [
            'id' => $this->modifierCode($row),
            'companyId' => $this->companyCode((int) ($row['company_id'] ?? 1)),
            'outletId' => $row['outlet_id'] ? $this->outletCode((int) $row['outlet_id']) : '',
            'name' => $row['name'],
            'requiredSelection' => str_contains((string) $row['selection_type'], 'required') || $row['selection_type'] === 'required',
            'choiceType' => str_contains((string) $row['selection_type'], 'single') || $row['selection_type'] === 'required' ? 'single' : 'multiple',
            'scope' => $row['scope'],
            'status' => StatusCodeService::common($row['status'] ?? ''),
            'options' => array_values(array_map(function ($option) use ($ingredients) {
                $rule = (json_decode($option['ingredient_rules'] ?: '[]', true) ?: [[]])[0] ?? [];
                $ingredient = $this->ruleIngredient($rule, $ingredients, 'ingredientId', 'templateId', 'ingredient_code');
                $replacement = $this->ruleIngredient($rule, $ingredients, 'replacementIngredientId', 'replacementTemplateId', 'replacement_ingredient_code');
                $templateInfo = $this->ruleTemplateInfo($rule, $ingredients, 'templateId', 'ingredient_code');
                $replacementTemplateInfo = $this->ruleTemplateInfo($rule, $ingredients, 'replacementTemplateId', 'replacement_ingredient_code', 'replacement_name');
                $basePriceDelta = (float) $option['price_delta'];
                $outletPriceDelta = isset($option['outlet_price_delta']) && $option['outlet_price_delta'] !== null
                    ? (float) $option['outlet_price_delta']
                    : null;
                return [
                    'id' => 'opt-' . $option['id'],
                    'name' => $option['name'],
                    'priceDelta' => $outletPriceDelta ?? $basePriceDelta,
                    'basePriceDelta' => $basePriceDelta,
                    'outletPriceDelta' => $outletPriceDelta,
                    'priceSource' => $outletPriceDelta !== null ? 'outlet' : 'default',
                    'outletPriceNote' => $option['outlet_price_note'] ?? '',
                    'action' => ($rule['action'] ?? 'set') === 'replace' ? 'replace' : 'set',
                    'ingredientId' => $ingredient ? $this->ingredientCode($ingredient) : '',
                    'ingredientName' => $ingredient['name'] ?? ($templateInfo['name'] ?? ''),
                    'templateId' => $templateInfo['code'] ?? ($ingredient && ! empty($ingredient['template_id']) ? $this->templateCode(['id' => $ingredient['template_id'], 'code' => $ingredient['template_code'] ?? null]) : ''),
                    'templateName' => $templateInfo['name'] ?? '',
                    'missingIngredient' => ! $ingredient,
                    'replacementIngredientId' => $replacement ? $this->ingredientCode($replacement) : '',
                    'replacementIngredientName' => $replacement['name'] ?? ($replacementTemplateInfo['name'] ?? ($rule['replacement_name'] ?? '')),
                    'replacementTemplateId' => $replacementTemplateInfo['code'] ?? ($replacement && ! empty($replacement['template_id']) ? $this->templateCode(['id' => $replacement['template_id'], 'code' => $replacement['template_code'] ?? null]) : ''),
                    'replacementTemplateName' => $replacementTemplateInfo['name'] ?? ($rule['replacement_name'] ?? ''),
                    'missingReplacementIngredient' => ($rule['action'] ?? 'set') === 'replace' && ! $replacement,
                    'qty' => (float) ($rule['qty'] ?? 0),
                ];
            }, array_filter($options, fn ($option) => (int) $option['modifier_id'] === (int) $row['id']))),
        ];
    }

    private function ingredientPayload(array $row): array
    {
        return [
            'id' => $this->ingredientCode($row),
            'templateId' => ! empty($row['template_id']) ? $this->templateCode(['id' => $row['template_id'], 'code' => $row['template_code'] ?? null]) : '',
            'templateCode' => $row['template_code'] ?? '',
            'templateName' => $row['template_name'] ?? '',
            'templateCategory' => $row['template_category'] ?? '',
            'templateUnit' => $row['template_unit'] ?? '',
            'companyId' => $this->companyCode((int) ($row['company_id'] ?? 1)),
            'outletId' => $this->outletCode((int) $row['outlet_id']),
            'sku' => $row['sku'],
            'name' => $row['name'],
            'category' => $row['category'],
            'unit' => $row['unit'],
            'stock' => (float) $row['stock_qty'],
            'avgCost' => (float) $row['average_cost'],
            'standardCost' => (float) $row['standard_cost'],
            'minStock' => (float) $row['minimum_stock'],
            'status' => StatusCodeService::common($row['status'] ?? ''),
        ];
    }

    private function optionRule(array $option): array
    {
        $ingredientId = $this->ingredientId($option['ingredientId'] ?? '');
        $replacementIngredientId = $this->ingredientId($option['replacementIngredientId'] ?? '');
        $ingredient = $ingredientId ? (new IngredientModel())->find($ingredientId) : null;
        $replacement = $replacementIngredientId ? (new IngredientModel())->find($replacementIngredientId) : null;
        $templateId = $option['templateId'] ?? '';
        $replacementTemplateId = $option['replacementTemplateId'] ?? '';

        return [
            'action' => ($option['action'] ?? 'set') === 'replace' ? 'replace' : 'set',
            'ingredientId' => $option['ingredientId'] ?? '',
            'templateId' => $templateId ?: ($ingredient && ! empty($ingredient['template_id']) ? $this->templateCode(['id' => $ingredient['template_id']]) : ''),
            'replacementIngredientId' => $option['replacementIngredientId'] ?? '',
            'replacementTemplateId' => $replacementTemplateId ?: ($replacement && ! empty($replacement['template_id']) ? $this->templateCode(['id' => $replacement['template_id']]) : ''),
            'qty' => (float) ($option['qty'] ?? 0),
        ];
    }

    private function modifierSelectionType(array $payload): string
    {
        $choiceType = ($payload['choiceType'] ?? 'multiple') === 'single' ? 'single' : 'multiple';
        return (! empty($payload['requiredSelection']) ? 'required' : 'optional') . '_' . $choiceType;
    }

    private function paginationMeta(int $page, int $perPage, int $total): array
    {
        return [
            'page' => $page,
            'perPage' => $perPage,
            'total' => $total,
            'totalPages' => (int) max(1, ceil($total / max(1, $perPage))),
        ];
    }

    private function arrayPage(array $items, array $filters = []): array
    {
        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = min(100, max(1, (int) ($filters['per_page'] ?? $filters['perPage'] ?? 25)));
        $total = count($items);
        return [
            'items' => array_slice($items, ($page - 1) * $perPage, $perPage),
            'meta' => $this->paginationMeta($page, $perPage, $total),
        ];
    }

    private function nextProductSku(int $companyId): string
    {
        if ($this->hasCompanyColumn('products')) {
            $this->products->where('company_id', $companyId);
        }
        $count = $this->products->countAllResults();
        return 'PRD-' . str_pad((string) ($count + 1), 4, '0', STR_PAD_LEFT);
    }

    private function categoryId(string|int|null $value): ?int
    {
        if (! $value) return null;
        if (is_numeric($value)) return (int) $value;
        if (preg_match('/^cat-(\d+)$/', (string) $value, $m)) return (int) $m[1];
        $name = str_replace('cat-', '', (string) $value);
        $name = str_replace('-', ' ', $name);
        $row = $this->categories->like('LOWER(name)', strtolower($name))->first();
        return $row ? (int) $row['id'] : null;
    }

    private function saveProductOutletCategory(int $productId, int $categoryId, int $companyId, int $outletId): void
    {
        $existing = $this->productCategories
            ->where('outlet_id', $outletId)
            ->where('product_id', $productId);
        if ($this->hasCompanyColumn('product_outlet_categories')) {
            $existing->where('company_id', $companyId);
        }
        $existing = $existing->first();
        $row = $this->withCompanyData('product_outlet_categories', [
            'company_id' => $companyId,
            'outlet_id' => $outletId,
            'product_id' => $productId,
            'category_id' => $categoryId,
        ], $companyId);
        $existing
            ? $this->productCategories->update($existing['id'], $row)
            : $this->productCategories->insert($row);
    }

    private function productId(string|int|null $value): ?int
    {
        if (! $value) return null;
        if (is_numeric($value)) return (int) $value;
        if (preg_match('/^prd-(\d+)$/', (string) $value, $m)) return (int) $m[1];
        $known = ['prd-iced-latte' => 1, 'prd-vanilla-latte' => 2, 'prd-mocha' => 3];
        return $known[$value] ?? null;
    }

    private function productBatchId(string|int|null $value): ?int
    {
        if (! $value) return null;
        if (is_numeric($value)) return (int) $value;
        if (preg_match('/^pbatch-(\d+)$/', (string) $value, $m)) return (int) $m[1];
        return null;
    }

    private function modifierId(string|int|null $value): ?int
    {
        if (! $value) return null;
        if (is_numeric($value)) return (int) $value;
        if (preg_match('/^mod-(\d+)$/', (string) $value, $m)) return (int) $m[1];
        $known = ['mod-level-ice' => 1, 'mod-milk-option' => 2];
        return $known[$value] ?? null;
    }

    private function modifierOptionId(string|int|null $value): ?int
    {
        if (! $value) return null;
        if (is_numeric($value)) return (int) $value;
        if (preg_match('/^opt-(\d+)$/', (string) $value, $m)) return (int) $m[1];
        return null;
    }

    private function ingredientId(string|int|null $value): ?int
    {
        if (! $value) return null;
        if (is_numeric($value)) return (int) $value;
        if (preg_match('/^ing-(\d+)$/', (string) $value, $m)) return (int) $m[1];
        return null;
    }

    private function ingredientUnit(int $id): string
    {
        return (new IngredientModel())->find($id)['unit'] ?? '';
    }

    private function templateUnit(int $id): string
    {
        $row = $this->db->table('ingredient_templates')->where('id', $id)->get()->getRowArray();
        return $row['unit'] ?? '';
    }

    private function categoryCode(array $row): string { return 'cat-' . $row['id']; }
    private function productCode(array $row): string { return 'prd-' . $row['id']; }
    private function modifierCode(array $row): string { return 'mod-' . $row['id']; }
    private function ingredientCode(array $row): string { return 'ing-' . ($row['id'] ?? uniqid()); }
    private function templateCode(array $row): string { return $row['code'] ?? ('tpl-' . ($row['id'] ?? uniqid())); }
    private function companyCode(int $id): string { return $id === 1 ? 'company-main' : 'company-' . $id; }
    private function outletCode(int $id): string { return match ($id) { 1 => 'outlet-main', 2 => 'outlet-north', 3 => 'outlet-south', default => 'outlet-' . $id }; }

    private function templateId(string|int|null $value, int $companyId): ?int
    {
        if (! $value) return null;
        if (is_numeric($value)) return (int) $value;
        if (preg_match('/^tpl-(\d+)$/', (string) $value, $m)) return (int) $m[1];
        foreach ($this->suite->ingredientTemplates($companyId) as $template) {
            if (($template['code'] ?? '') === $value) return (int) $template['id'];
        }
        return null;
    }

    private function recipePayload(array $row, array $ingredients, array $templates): array
    {
        $templateId = (int) ($row['template_id'] ?? 0);
        $ingredient = $templateId ? $this->ingredientForTemplate($ingredients, $templateId) : null;
        $template = $templateId ? $this->findById($templates, $templateId) : null;

        return [
            'id' => 'recipe-' . $row['id'],
            'productId' => $this->productCode(['id' => $row['product_id']]),
            'ingredientId' => $ingredient ? $this->ingredientCode($ingredient) : '',
            'ingredientName' => $ingredient['name'] ?? ($template['name'] ?? 'Bahan belum tersedia di outlet'),
            'templateId' => $templateId ? $this->templateCode($template ?: ['id' => $templateId]) : '',
            'templateName' => $template['name'] ?? '',
            'missingIngredient' => ! $ingredient,
            'stock' => (float) ($ingredient['stock_qty'] ?? $ingredient['stock'] ?? 0),
            'qty' => (float) $row['qty'],
            'unit' => $row['unit'] ?? ($ingredient['unit'] ?? ($template['unit'] ?? '')),
        ];
    }

    private function ingredientForTemplate(array $ingredients, int $templateId): ?array
    {
        foreach ($ingredients as $ingredient) {
            if ((int) ($ingredient['template_id'] ?? 0) === $templateId) return $ingredient;
        }
        return null;
    }

    private function writableMasterScope(string $label, ?array $existing, array $payload, int $companyId, int $outletId, array $auth): string
    {
        if ($existing && ! $this->rowBelongsToCompany($existing, $companyId)) {
            throw new \InvalidArgumentException(ucfirst($label) . ' tidak ditemukan.');
        }

        $access = $this->masterAccess($auth, $companyId);
        $requestedScope = ($payload['scope'] ?? 'outlet') === 'company' ? 'company' : 'outlet';
        if ($existing) {
            $existingScope = ($existing['scope'] ?? 'company') === 'outlet' ? 'outlet' : 'company';
            if (! $access['canGlobal'] && $existingScope === 'company') {
                throw new \InvalidArgumentException('User Selected Outlet hanya bisa mengubah ' . $label . ' milik outlet yang dipilih.');
            }
            if ($existingScope === 'outlet' && (int) ($existing['outlet_id'] ?? 0) !== $outletId) {
                throw new \InvalidArgumentException('User hanya bisa mengubah ' . $label . ' pada outlet aktif yang dimiliki.');
            }
            return $existingScope;
        }

        if ($requestedScope === 'company') {
            if (! $access['canGlobal']) {
                throw new \InvalidArgumentException('User Selected Outlet tidak bisa membuat ' . $label . ' global perusahaan.');
            }
            return 'company';
        }

        if (! $this->canAccessOutlet($access, $outletId)) {
            throw new \InvalidArgumentException('Outlet aktif tidak termasuk akses user.');
        }

        return 'outlet';
    }

    private function masterAccess(array $auth, int $companyId): array
    {
        if (($auth['authType'] ?? '') === 'company_admin') {
            return ['canGlobal' => true, 'outletIds' => [], 'allOutlets' => true];
        }

        $userId = (int) ($auth['sub'] ?? 0);
        if (! $userId) {
            return ['canGlobal' => false, 'outletIds' => [], 'allOutlets' => false];
        }

        $role = $this->db->table('user_roles ur')
            ->select('r.scope')
            ->join('roles r', 'r.id = ur.role_id', 'left')
            ->where('ur.user_id', $userId)
            ->get()
            ->getRowArray();
        $outletRows = $this->db->table('user_outlets uo')
            ->select('uo.outlet_id')
            ->join('outlets o', 'o.id = uo.outlet_id', 'left')
            ->where('uo.user_id', $userId);
        if ($this->hasCompanyColumn('outlets')) {
            $outletRows->where('o.company_id', $companyId);
        }
        $outletRows = $outletRows->get()
            ->getResultArray();
        $outletIds = array_values(array_map(fn ($row) => (int) $row['outlet_id'], $outletRows));
        $allOutlets = ($role['scope'] ?? '') === 'all';

        return [
            'canGlobal' => $allOutlets || count($outletIds) > 1,
            'outletIds' => $outletIds,
            'allOutlets' => $allOutlets,
        ];
    }

    private function canManageGlobalMasters(array $auth, int $companyId): bool
    {
        return $this->masterAccess($auth, $companyId)['canGlobal'];
    }

    private function canAccessOutlet(array $access, int $outletId): bool
    {
        return $access['allOutlets'] || in_array($outletId, $access['outletIds'], true);
    }

    private function ruleIngredient(array $rule, array $ingredients, string $ingredientKey, string $templateKey, string $legacyCodeKey): ?array
    {
        $ingredientId = $this->ingredientId($rule[$ingredientKey] ?? null);
        if ($ingredientId) {
            $ingredient = $this->findById($ingredients, $ingredientId);
            if ($ingredient) return $ingredient;
        }

        $templateId = $this->templateIdFromRule($rule[$templateKey] ?? $rule[$legacyCodeKey] ?? null, $ingredients);
        return $templateId ? $this->ingredientForTemplate($ingredients, $templateId) : null;
    }

    private function templateIdFromRule(string|int|null $value, array $ingredients): ?int
    {
        if (! $value) return null;
        if (is_numeric($value)) return (int) $value;
        if (preg_match('/^tpl-(\d+)$/', (string) $value, $m)) return (int) $m[1];

        $legacyMap = [
            'ing-arabica' => 'tpl-arabica',
            'ing-milk' => 'tpl-milk',
            'ing-syrup' => 'tpl-syrup',
            'ing-cup12' => 'tpl-cup12',
            'ing-ice' => 'tpl-ice',
            'ing-choco' => 'tpl-choco',
            'ing-pack-bag-1' => 'tpl-pack-bag-1',
            'ing-pack-carrier-2' => 'tpl-pack-carrier-2',
            'ing-pack-carrier-4' => 'tpl-pack-carrier-4',
        ];
        $code = $legacyMap[(string) $value] ?? (string) $value;
        foreach ($ingredients as $ingredient) {
            if (($ingredient['template_code'] ?? '') === $code) return (int) ($ingredient['template_id'] ?? 0);
        }
        $template = $this->db->table('ingredient_templates')->where('code', $code)->get()->getRowArray();
        if ($template) return (int) $template['id'];
        return null;
    }

    private function ruleTemplateInfo(array $rule, array $ingredients, string $templateKey, string $legacyCodeKey, ?string $nameKey = null): array
    {
        $templateId = $this->templateIdFromRule($rule[$templateKey] ?? $rule[$legacyCodeKey] ?? null, $ingredients);
        if (! $templateId && $nameKey) {
            $ingredient = $this->ingredientByRuleName($ingredients, $rule[$nameKey] ?? null);
            if ($ingredient) {
                return [
                    'code' => $ingredient['template_code'] ?? $this->templateCode(['id' => $ingredient['template_id'] ?? null]),
                    'name' => $ingredient['template_name'] ?? $ingredient['name'] ?? '',
                ];
            }
        }
        if (! $templateId) {
            return [];
        }
        foreach ($ingredients as $ingredient) {
            if ((int) ($ingredient['template_id'] ?? 0) === $templateId) {
                return [
                    'code' => $ingredient['template_code'] ?? $this->templateCode(['id' => $templateId]),
                    'name' => $ingredient['template_name'] ?? '',
                ];
            }
        }
        $template = $this->db->table('ingredient_templates')->where('id', $templateId)->get()->getRowArray();
        return $template ? ['code' => $template['code'], 'name' => $template['name']] : [];
    }

    private function ingredientByRuleName(array $ingredients, string|null $name): ?array
    {
        $needle = strtolower(trim((string) $name));
        if ($needle === '') return null;
        foreach ($ingredients as $ingredient) {
            $names = [
                strtolower((string) ($ingredient['name'] ?? '')),
                strtolower((string) ($ingredient['template_name'] ?? '')),
                strtolower((string) ($ingredient['template_code'] ?? '')),
            ];
            if (in_array($needle, $names, true)) return $ingredient;
        }
        return null;
    }

    private function productBatchStock(int $productId, int $companyId, int $outletId): float
    {
        if (! $this->db->tableExists('product_batches')) return 0;
        $builder = $this->db->table('product_batches')
            ->selectSum('qty_remaining', 'qty')
            ->where('outlet_id', $outletId)
            ->where('product_id', $productId)
            ->whereIn('status', [StatusCodeService::ACTIVE, 'active'])
            ->where('qty_remaining >', 0);
        if ($this->hasCompanyColumn('product_batches')) {
            $builder->where('company_id', $companyId);
        }
        $row = $builder->get()
            ->getRowArray();
        return (float) ($row['qty'] ?? 0);
    }

    private function productBatchUnitCost(int $productId, int $companyId, int $outletId): float
    {
        if (! $this->db->tableExists('product_batches')) return 0;
        $builder = $this->db->table('product_batches')
            ->select('qty_remaining, unit_cost')
            ->where('outlet_id', $outletId)
            ->where('product_id', $productId)
            ->whereIn('status', [StatusCodeService::ACTIVE, 'active'])
            ->where('qty_remaining >', 0);
        if ($this->hasCompanyColumn('product_batches')) {
            $builder->where('company_id', $companyId);
        }
        $rows = $builder->get()
            ->getResultArray();
        $qty = array_sum(array_map(fn ($row) => (float) $row['qty_remaining'], $rows));
        if ($qty <= 0) return 0;
        $cost = array_sum(array_map(fn ($row) => (float) $row['qty_remaining'] * (float) $row['unit_cost'], $rows));
        return $cost / $qty;
    }

    private function productBatchPayload(int $productId, int $companyId, int $outletId): array
    {
        if (! $this->db->tableExists('product_batches')) return [];
        $builder = $this->db->table('product_batches')
            ->where('outlet_id', $outletId)
            ->where('product_id', $productId)
            ->where('qty_remaining >', 0)
            ->orderBy('expired_at IS NULL', 'ASC', false)
            ->orderBy('expired_at', 'ASC');
        if ($this->hasCompanyColumn('product_batches')) {
            $builder->where('company_id', $companyId);
        }
        $rows = $builder->get()
            ->getResultArray();

        return array_map(fn ($row) => [
            'id' => 'pbatch-' . $row['id'],
            'batchNo' => $row['batch_no'],
            'qty' => (float) $row['qty_remaining'],
            'unitCost' => (float) $row['unit_cost'],
            'manufacturedAt' => $row['manufactured_at'] ?: '',
            'expiredAt' => $row['expired_at'] ?: '',
            'status' => StatusCodeService::common($row['status'] ?? ''),
            'movements' => $this->productBatchMovementsPayload((int) $row['id']),
        ], $rows);
    }

    private function productBatchMovementsPayload(int $batchId): array
    {
        if (! $this->db->tableExists('product_batch_movements')) return [];
        $rows = $this->db->table('product_batch_movements')
            ->where('product_batch_id', $batchId)
            ->where('deleted_at', null)
            ->orderBy('created_at', 'DESC')
            ->orderBy('id', 'DESC')
            ->get()
            ->getResultArray();

        return array_map(fn ($row) => [
            'id' => 'pbmov-' . $row['id'],
            'createdAt' => $row['created_at'] ?: '',
            'type' => $row['movement_type'],
            'beforeQty' => (float) $row['stock_before'],
            'qtyIn' => (float) $row['qty_in'],
            'qtyOut' => (float) $row['qty_out'],
            'afterQty' => (float) $row['stock_after'],
            'unitCost' => (float) $row['unit_cost'],
            'totalCost' => (float) $row['total_cost'],
            'note' => $row['notes'] ?: '',
        ], $rows);
    }

    private function dateOrNull(?string $value): ?string
    {
        if (! $value) return null;
        $time = strtotime($value);
        return $time ? date('Y-m-d', $time) : null;
    }

    private function findById(array $rows, mixed $id): ?array
    {
        foreach ($rows as $row) {
            if ((int) ($row['id'] ?? 0) === (int) $id) return $row;
        }
        return null;
    }

    private function hasCompanyColumn(string $table): bool
    {
        return $this->db->tableExists($table) && $this->db->fieldExists('company_id', $table);
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
}
