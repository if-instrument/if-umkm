<?php

namespace App\Commands;

use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;
use Config\Database;

class PruneCentralDatabase extends BaseCommand
{
    protected $group = 'Tenant';
    protected $name = 'tenant:prune-central';
    protected $description = 'Drop operational tenant tables from central SaaS database and keep only control-plane tables.';

    private array $keepTables = [
        'companies',
        'users',
        'user_invitations',
        'migrations',
    ];

    public function run(array $params): void
    {
        $db = Database::connect(config(Database::class)->default, false);
        $database = $db->getDatabase();
        if ($database !== 'if_instrument_umkm') {
            CLI::error('Command ini hanya boleh dijalankan di database pusat if_instrument_umkm.');
            return;
        }

        $tables = array_column($db->query(
            'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
            [$database]
        )->getResultArray(), 'TABLE_NAME');
        $dropTables = array_values(array_diff($tables, $this->keepTables));

        if ($dropTables === []) {
            CLI::write('Database pusat sudah ramping. Tidak ada table operasional untuk dihapus.', 'green');
            return;
        }

        $db->query('SET FOREIGN_KEY_CHECKS=0');
        foreach ($dropTables as $table) {
            $db->query('DROP TABLE IF EXISTS `' . str_replace('`', '``', $table) . '`');
            CLI::write('Dropped central table: ' . $table, 'yellow');
        }
        $db->query('SET FOREIGN_KEY_CHECKS=1');

        CLI::write('Database pusat sekarang hanya menyimpan: ' . implode(', ', $this->keepTables), 'green');
    }
}
