<?php

namespace App\Models;

class AppSettingModel extends BaseAppModel
{
    protected $table = 'app_settings';
    protected $primaryKey = 'id';
    protected $allowedFields = ['company_id', 'outlet_id', 'setting_key', 'setting_value'];
}
