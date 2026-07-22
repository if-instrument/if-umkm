<?php

namespace Config;

use CodeIgniter\Config\BaseService;

/**
 * Services Configuration file.
 *
 * Services are simply other classes/libraries that the system uses
 * to do its job. This is used by CodeIgniter to allow the core of the
 * framework to be swapped out easily without affecting the usage within
 * the rest of your application.
 *
 * This file holds any application-specific services, or service overrides
 * that you might need. An example has been included with the general
 * method format you should use for your service methods. For more examples,
 * see the core Services file at system/Config/Services.php.
 */
class Services extends BaseService
{
    public static function salesService(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('salesService');
        }
        return new \App\Services\SalesService();
    }

    public static function paymentGatewayService(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('paymentGatewayService');
        }
        return new \App\Services\PaymentGatewayService();
    }

    public static function crmService(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('crmService');
        }
        return new \App\Services\CrmService();
    }

    public static function inventoryService(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('inventoryService');
        }
        return new \App\Services\InventoryService();
    }

    public static function productSuiteService(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('productSuiteService');
        }
        return new \App\Services\ProductSuiteService();
    }

    public static function settingsService(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('settingsService');
        }
        return new \App\Services\SettingsService();
    }

    public static function accessManagementService(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('accessManagementService');
        }
        return new \App\Services\AccessManagementService();
    }

    public static function onboardingService(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('onboardingService');
        }
        return new \App\Services\OnboardingService();
    }

    public static function profitLossService(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('profitLossService');
        }
        return new \App\Services\ProfitLossService();
    }

    public static function tenantDatabaseService(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('tenantDatabaseService');
        }
        return new \App\Services\TenantDatabaseService();
    }

    public static function authService(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('authService');
        }
        return new \App\Services\AuthService();
    }

    public static function posPagePresenter(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('posPagePresenter');
        }
        return new \App\Presenters\Page\PosPagePresenter();
    }

    public static function loginPagePresenter(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('loginPagePresenter');
        }
        return new \App\Presenters\Page\LoginPagePresenter();
    }

    public static function onlineOrderPagePresenter(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('onlineOrderPagePresenter');
        }
        return new \App\Presenters\Page\OnlineOrderPagePresenter();
    }

    public static function productPagePresenter(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('productPagePresenter');
        }
        return new \App\Presenters\Page\ProductPagePresenter();
    }

    public static function settingsPagePresenter(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('settingsPagePresenter');
        }
        return new \App\Presenters\Page\SettingsPagePresenter();
    }

    public static function userRolePagePresenter(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('userRolePagePresenter');
        }
        return new \App\Presenters\Page\UserRolePagePresenter();
    }

    public static function inventoryPagePresenter(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('inventoryPagePresenter');
        }
        return new \App\Presenters\Page\InventoryPagePresenter();
    }

    public static function financePagePresenter(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('financePagePresenter');
        }
        return new \App\Presenters\Page\FinancePagePresenter();
    }

    public static function settingsApiService(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('settingsApiService');
        }
        return new \App\Services\Api\SettingsApiService();
    }

    public static function productApiService(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('productApiService');
        }
        return new \App\Services\Api\ProductApiService();
    }

    public static function posApiService(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('posApiService');
        }
        return new \App\Services\Api\PosApiService();
    }

    public static function financeApiService(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('financeApiService');
        }
        return new \App\Services\Api\FinanceApiService();
    }

    public static function inventoryApiService(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('inventoryApiService');
        }
        return new \App\Services\Api\InventoryApiService();
    }

    public static function accessApiService(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('accessApiService');
        }
        return new \App\Services\Api\AccessApiService();
    }

    public static function authApiService(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('authApiService');
        }
        return new \App\Services\Api\AuthApiService();
    }

    public static function onlineOrderApiService(bool $getShared = true)
    {
        if ($getShared) {
            return static::getSharedInstance('onlineOrderApiService');
        }
        return new \App\Services\Api\OnlineOrderApiService();
    }
}
