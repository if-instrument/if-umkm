<?php

namespace App\Models;

class RoleModel extends BaseAppModel
{
    protected $table = 'roles';
    protected $primaryKey = 'id';
    protected $allowedFields = ['company_id', 'name', 'scope', 'responsibility', 'permissions', 'permission_matrix', 'status'];
}
