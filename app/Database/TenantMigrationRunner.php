<?php

namespace App\Database;

use CodeIgniter\Database\MigrationRunner;
use Config\Migrations as MigrationsConfig;

class TenantMigrationRunner extends MigrationRunner
{
    public function __construct(MigrationsConfig $config, $db = null, string $path = '')
    {
        parent::__construct($config, $db);
        $this->path = $path;
    }
}
