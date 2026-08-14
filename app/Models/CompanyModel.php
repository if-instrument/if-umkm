<?php

namespace App\Models;

class CompanyModel extends BaseAppModel
{
    protected $table = 'companies';
    protected $primaryKey = 'id';
    protected $allowedFields = [
        'name', 'brand_name', 'route_slug', 'tagline', 'logo_path', 'theme_color',
        'db_mode', 'db_host', 'db_name', 'db_username', 'db_password', 'db_port',
        'status', 'payment_proof_path', 'payment_status', 'payment_notes',
        'tenant_status', 'subscription_plan', 'expires_at', 'max_outlets',
        'ai_enable_face_login', 'ai_enable_fingerprint', 'registration_type',
    ];
}
