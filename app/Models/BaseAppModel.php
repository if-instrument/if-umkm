<?php

namespace App\Models;

use CodeIgniter\Model;
use Config\Database;

abstract class BaseAppModel extends Model
{
    protected $useTimestamps = true;
    protected $createdField = 'created_at';
    protected $updatedField = 'updated_at';
    protected $returnType = 'array';
    protected $skipValidation = false;

    protected function initialize(): void
    {
        if (! $this->table || ! $this->allowedFields) {
            return;
        }

        try {
            $fields = Database::connect()->getFieldNames($this->table);
            $this->allowedFields = array_values(array_intersect($this->allowedFields, $fields));
        } catch (\Throwable) {
        }
    }
}
