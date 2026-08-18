<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateQueuedJobsSchema extends Migration
{
    public function up()
    {
        if (! $this->db->tableExists('queued_jobs')) {
            $this->forge->addField([
                'id' => [
                    'type' => 'BIGINT',
                    'unsigned' => true,
                    'auto_increment' => true,
                ],
                'queue' => [
                    'type' => 'VARCHAR',
                    'constraint' => 64,
                    'default' => 'default',
                ],
                'handler' => [
                    'type' => 'VARCHAR',
                    'constraint' => 255,
                ],
                'payload' => [
                    'type' => 'LONGTEXT',
                ],
                'attempts' => [
                    'type' => 'INT',
                    'unsigned' => true,
                    'default' => 0,
                ],
                'max_attempts' => [
                    'type' => 'INT',
                    'unsigned' => true,
                    'default' => 3,
                ],
                'available_at' => [
                    'type' => 'DATETIME',
                ],
                'reserved_at' => [
                    'type' => 'DATETIME',
                    'null' => true,
                ],
                'status' => [
                    'type' => 'VARCHAR',
                    'constraint' => 32,
                    'default' => 'pending',
                ],
                'error_message' => [
                    'type' => 'TEXT',
                    'null' => true,
                ],
                'created_at' => [
                    'type' => 'DATETIME',
                ],
                'updated_at' => [
                    'type' => 'DATETIME',
                ],
            ]);

            $this->forge->addKey('id', true);
            $this->forge->addKey(['queue', 'status', 'available_at'], false, false, 'idx_jobs_queue_status_available');
            $this->forge->addKey(['status', 'reserved_at'], false, false, 'idx_jobs_status_reserved');
            $this->forge->createTable('queued_jobs', true);
        }
    }

    public function down()
    {
        if ($this->db->tableExists('queued_jobs')) {
            $this->forge->dropTable('queued_jobs', true);
        }
    }
}
