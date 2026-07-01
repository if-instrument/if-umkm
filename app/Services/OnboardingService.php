<?php

namespace App\Services;

use Config\Database;

class OnboardingService
{
    public function status(int $companyId): array
    {
        $db = Database::connect();
        $builder = $db->table('companies');
        if ($db->fieldExists('id', 'companies')) {
            $builder->where('id', $companyId);
        }
        $company = $builder->get()->getRowArray() ?: $db->table('companies')->orderBy('id')->get()->getRowArray();
        if (! $company) {
            throw new \InvalidArgumentException('Perusahaan tidak ditemukan.');
        }

        $counts = [
            'outlets' => $this->count($db, 'outlets', $companyId),
            'roles' => $this->count($db, 'roles', $companyId),
            'users' => $this->count($db, 'users', $companyId, ['type' => 'company_user']),
            'categories' => $this->count($db, 'categories', $companyId),
            'products' => $this->count($db, 'products', $companyId),
            'modifiers' => $this->count($db, 'modifiers', $companyId),
            'ingredientTemplates' => $this->count($db, 'ingredient_templates', $companyId),
            'ingredients' => $this->count($db, 'outlet_ingredients', $companyId),
            'ingredientMappings' => $this->count($db, 'outlet_ingredient_mappings', $companyId),
            'recipes' => $this->count($db, 'product_recipe_items', $companyId),
            'diningTables' => $this->count($db, 'dining_tables', $companyId),
            'paymentMethods' => $this->count($db, 'payment_methods', $companyId),
            'packagingRules' => $this->count($db, 'packaging_rules', $companyId),
            'outletSettings' => $this->countSettings($db, $companyId, ['tax_rate', 'dine_in_service_rate', 'printer_name']),
            'costingSettings' => $this->countSettings($db, $companyId, ['costing_method']),
        ];

        $hasOutlet = $counts['outlets'] > 0;
        $hasRole = $counts['roles'] > 0;
        $hasCategory = $counts['categories'] > 0;
        $hasProduct = $counts['products'] > 0;
        $hasTemplate = $counts['ingredientTemplates'] > 0;
        $hasRecipe = $counts['recipes'] > 0;
        $hasIngredient = $counts['ingredients'] > 0;

        $requiredSteps = [
            $this->step('company', 'Profil Perusahaan', 'Periksa nama, logo, warna tema, dan route login perusahaan.', true, '/pages/settings.html?tab=company&onboarding=1'),
            $this->step('outlet', 'Buat Outlet Pertama', 'Outlet menjadi batas data POS, inventory, setting, dan laporan.', $hasOutlet, '/pages/users.html?tab=outlets&create=outlet&onboarding=1', $counts['outlets']),
            $this->step('product', 'Buat Produk', 'Lengkapi produk, deskripsi, foto, scope, dan harga. Kategori dapat disusun setelahnya.', $hasProduct, '/pages/products.html?onboarding=1', $counts['products'], false, $hasOutlet, 'Buat outlet terlebih dahulu.'),
            $this->step('ingredient-template', 'Master Template Bahan', 'Buat template bahan yang digunakan oleh recipe produk.', $hasTemplate, '/pages/recipes.html?onboarding=1', $counts['ingredientTemplates'], false, $hasProduct, 'Buat produk terlebih dahulu.'),
            $this->step('recipe', 'Susun Recipe / HPP', 'Hubungkan produk dengan template bahan dan takaran per porsi.', $hasRecipe, '/pages/recipes.html?onboarding=1', $counts['recipes'], false, $hasProduct && $hasTemplate, ! $hasProduct ? 'Buat produk terlebih dahulu.' : 'Buat template bahan terlebih dahulu.'),
        ];
        $optionalSteps = [
            $this->step('role', 'Susun Role & Permission', 'Jika operasional dijalankan lebih dari satu user, buat pembagian akses sesuai tugas.', $hasRole, '/pages/users.html?tab=roles&create=role&onboarding=1', $counts['roles'], true, $hasOutlet, 'Buat outlet terlebih dahulu.'),
            $this->step('user', 'Undang User Perusahaan', 'Tambahkan user setelah role tersedia dan tentukan outlet tugasnya.', $counts['users'] > 0, '/pages/users.html?tab=users&create=user&onboarding=1', $counts['users'], true, $hasOutlet && $hasRole, ! $hasOutlet ? 'Buat outlet terlebih dahulu.' : 'Buat role terlebih dahulu.'),
            $this->step('outlet-settings', 'Pengaturan Outlet & Pajak', 'Atur pajak, service charge, printer, dan identitas transaksi outlet aktif.', $counts['outletSettings'] > 0, '/pages/settings.html?tab=outlet&onboarding=1', $counts['outletSettings'], true, $hasOutlet, 'Buat outlet terlebih dahulu.'),
            $this->step('costing', 'Metode Costing Inventory', 'Tentukan Average Cost, FIFO, atau Standard Cost untuk outlet aktif.', $counts['costingSettings'] > 0, '/pages/settings.html?tab=costing&onboarding=1', $counts['costingSettings'], true, $hasOutlet, 'Buat outlet terlebih dahulu.'),
            $this->step('tables', 'Table Layout & Flow Dine In', 'Untuk bisnis dengan layanan meja, atur layout dan alur pembayaran Dine In.', $counts['diningTables'] > 0, '/pages/settings.html?tab=tables&onboarding=1', $counts['diningTables'], true, $hasOutlet, 'Buat outlet terlebih dahulu.'),
            $this->step('category', 'Susun Kategori Produk', 'Kelompokkan produk dan petakan kategori sesuai kebutuhan setiap outlet.', $hasCategory, '/pages/categories.html?onboarding=1', $counts['categories'], true, $hasOutlet, 'Buat outlet terlebih dahulu.'),
            $this->step('modifier', 'Siapkan Modifier', 'Buat pilihan tambahan atau pengganti bahan untuk produk.', $counts['modifiers'] > 0, '/pages/modifiers.html?onboarding=1', $counts['modifiers'], true, $hasProduct, 'Buat produk terlebih dahulu.'),
            $this->step('ingredient', 'Tambahkan Bahan Outlet', 'Dibutuhkan saat mulai mengelola stok dan penjualan berbasis recipe.', $hasIngredient, '/pages/inventory-list.html?create=ingredient&onboarding=1', $counts['ingredients'], true, $hasOutlet && $hasTemplate, ! $hasOutlet ? 'Buat outlet terlebih dahulu.' : 'Buat template bahan terlebih dahulu.'),
            $this->step('mapping', 'Mapping Bahan Outlet', 'Hubungkan template recipe ke bahan milik outlet ketika stok mulai digunakan.', $counts['ingredientMappings'] > 0, '/pages/ingredient-mapping.html?onboarding=1', $counts['ingredientMappings'], true, $hasRecipe && $hasIngredient, ! $hasRecipe ? 'Susun recipe terlebih dahulu.' : 'Tambahkan bahan outlet terlebih dahulu.'),
            $this->step('payment', 'Atur Metode Bayar', 'Aktifkan cash, QRIS, EDC, fee, gateway, dan settlement per outlet.', $counts['paymentMethods'] > 0, '/pages/settings.html?tab=payment&onboarding=1', $counts['paymentMethods'], true, $hasOutlet, 'Buat outlet terlebih dahulu.'),
            $this->step('packaging', 'Atur Packaging Rule', 'Untuk pesanan yang membutuhkan kemasan, atur pemotongan stok item kemasan.', $counts['packagingRules'] > 0, '/pages/settings.html?tab=packaging&onboarding=1', $counts['packagingRules'], true, $hasOutlet && $hasIngredient, ! $hasOutlet ? 'Buat outlet terlebih dahulu.' : 'Tambahkan bahan kemasan di stok outlet terlebih dahulu.'),
        ];

        $steps = array_merge($requiredSteps, $optionalSteps);
        $completed = count(array_filter($requiredSteps, fn ($step) => $step['completed']));
        $nextRequired = current(array_filter($requiredSteps, fn ($step) => ! $step['completed'])) ?: null;
        return [
            'companyName' => $company['name'],
            'requiresOnboarding' => $counts['outlets'] === 0,
            'completed' => $completed,
            'total' => count($requiredSteps),
            'progress' => count($requiredSteps) ? (int) round(($completed / count($requiredSteps)) * 100) : 100,
            'requiredComplete' => $completed === count($requiredSteps),
            'nextRequiredStepId' => $nextRequired['id'] ?? '',
            'counts' => $counts,
            'steps' => $steps,
            'requiredSteps' => $requiredSteps,
            'optionalSteps' => $optionalSteps,
        ];
    }

    private function count($db, string $table, int $companyId, array $where = []): int
    {
        if (! $db->tableExists($table)) return 0;
        $builder = $db->table($table);
        if ($db->fieldExists('company_id', $table)) {
            $builder->where('company_id', $companyId);
        }
        foreach ($where as $field => $value) $builder->where($field, $value);
        if ($db->fieldExists('status', $table)) $builder->whereNotIn('status', [StatusCodeService::INACTIVE, 'inactive']);
        return $builder->countAllResults();
    }

    private function countSettings($db, int $companyId, array $keys): int
    {
        if (! $db->tableExists('app_settings')) return 0;
        $builder = $db->table('app_settings')
            ->whereIn('setting_key', $keys)
            ->where('deleted_at', null)
        ;
        if ($db->fieldExists('company_id', 'app_settings')) {
            $builder->where('company_id', $companyId);
        }
        return $builder->countAllResults();
    }

    private function step(string $id, string $title, string $description, bool $completed, string $actionUrl, int $count = 1, bool $optional = false, bool $available = true, string $lockedReason = ''): array
    {
        return compact('id', 'title', 'description', 'completed', 'actionUrl', 'count', 'optional', 'available', 'lockedReason');
    }
}
