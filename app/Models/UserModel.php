<?php

namespace App\Models;

class UserModel extends BaseAppModel
{
    protected $table = 'users';
    protected $primaryKey = 'id';
    protected $allowedFields = ['company_id', 'name', 'email', 'password_hash', 'type', 'status'];
    protected $hidden = ['password_hash'];
}
