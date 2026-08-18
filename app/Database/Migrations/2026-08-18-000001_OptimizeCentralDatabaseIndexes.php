<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class OptimizeCentralDatabaseIndexes extends Migration
{
    public function up()
    {
        $db = $this->db;

        // Helper to check and add index safely
        $addIndexIfNotExists = function (string $table, string $indexName, array $columns) use ($db) {
            if (! $db->tableExists($table)) return;

            // Check if all columns exist
            foreach ($columns as $col) {
                if (! $db->fieldExists($col, $table)) return;
            }

            $indexes = $db->query("SHOW INDEX FROM `{$table}` WHERE Key_name = '{$indexName}'")->getResultArray();
            if (empty($indexes)) {
                $colsList = implode('`, `', $columns);
                $db->query("ALTER TABLE `{$table}` ADD INDEX `{$indexName}` (`{$colsList}`)");
            }
        };

        // Users Table Indexes
        $addIndexIfNotExists('users', 'idx_users_email_status', ['email', 'status']);
        $addIndexIfNotExists('users', 'idx_users_company', ['company_id', 'status']);

        // Companies Table Indexes
        $addIndexIfNotExists('companies', 'idx_companies_route_status', ['route_slug', 'status']);
        $addIndexIfNotExists('companies', 'idx_companies_expiry', ['status', 'expires_at']);

        // Audit Logs Table Indexes
        $addIndexIfNotExists('audit_logs', 'idx_audit_logs_company_created', ['company_id', 'created_at']);

        // SaaS Subscription Logs Table Indexes
        $addIndexIfNotExists('saas_subscription_logs', 'idx_saas_sub_company_created', ['company_id', 'created_at']);

        // User Invitations Table Indexes
        $addIndexIfNotExists('user_invitations', 'idx_user_invitations_token_status', ['token', 'status']);
    }

    public function down()
    {
        $db = $this->db;

        $dropIndexIfExists = function (string $table, string $indexName) use ($db) {
            if (! $db->tableExists($table)) return;
            $indexes = $db->query("SHOW INDEX FROM `{$table}` WHERE Key_name = '{$indexName}'")->getResultArray();
            if (! empty($indexes)) {
                $db->query("ALTER TABLE `{$table}` DROP INDEX `{$indexName}`");
            }
        };

        $dropIndexIfExists('users', 'idx_users_email_status');
        $dropIndexIfExists('users', 'idx_users_company');
        $dropIndexIfExists('companies', 'idx_companies_route_status');
        $dropIndexIfExists('companies', 'idx_companies_expiry');
        $dropIndexIfExists('audit_logs', 'idx_audit_logs_company_created');
        $dropIndexIfExists('saas_subscription_logs', 'idx_saas_sub_company_created');
        $dropIndexIfExists('user_invitations', 'idx_user_invitations_token_status');
    }
}
