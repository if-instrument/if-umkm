<?php

namespace App\Services;

use CodeIgniter\Database\BaseConnection;
use Config\Database;

class QueueService
{
    private BaseConnection $db;

    public function __construct(?BaseConnection $db = null)
    {
        $this->db = $db ?? Database::connect();
    }

    /**
     * Push a new job onto the queue.
     */
    public function push(string $handlerClass, array $payload = [], int $delaySeconds = 0, string $queue = 'default', int $maxAttempts = 3): int
    {
        $now = time();
        $availableAt = date('Y-m-d H:i:s', $now + max(0, $delaySeconds));
        $createdAt = date('Y-m-d H:i:s', $now);

        $this->db->table('queued_jobs')->insert([
            'queue' => $queue,
            'handler' => $handlerClass,
            'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
            'attempts' => 0,
            'max_attempts' => $maxAttempts,
            'available_at' => $availableAt,
            'reserved_at' => null,
            'status' => 'pending',
            'error_message' => null,
            'created_at' => $createdAt,
            'updated_at' => $createdAt,
        ]);

        return (int) $this->db->insertID();
    }

    /**
     * Pop the next available job from the queue and lock it.
     */
    public function pop(string $queue = 'default'): ?array
    {
        $now = date('Y-m-d H:i:s');

        // Look for pending job ready to be processed
        $builder = $this->db->table('queued_jobs')
            ->where('queue', $queue)
            ->where('status', 'pending')
            ->where('available_at <=', $now)
            ->orderBy('id', 'ASC')
            ->limit(1);

        $job = $builder->get()->getRowArray();
        if (! $job) {
            // Also check for stale processing jobs (> 10 minutes timeout)
            $staleTimeout = date('Y-m-d H:i:s', time() - 600);
            $staleJob = $this->db->table('queued_jobs')
                ->where('queue', $queue)
                ->where('status', 'processing')
                ->where('reserved_at <=', $staleTimeout)
                ->orderBy('id', 'ASC')
                ->limit(1)
                ->get()
                ->getRowArray();

            if (! $staleJob) {
                return null;
            }
            $job = $staleJob;
        }

        $id = (int) $job['id'];
        $nextAttempts = (int) $job['attempts'] + 1;

        // Reserve/lock the job
        $this->db->table('queued_jobs')->where('id', $id)->update([
            'status' => 'processing',
            'attempts' => $nextAttempts,
            'reserved_at' => $now,
            'updated_at' => $now,
        ]);

        $job['attempts'] = $nextAttempts;
        $job['status'] = 'processing';
        $job['payload'] = json_decode((string) $job['payload'], true) ?: [];

        return $job;
    }

    /**
     * Mark a job as successfully completed.
     */
    public function complete(int $jobId): void
    {
        $now = date('Y-m-d H:i:s');
        $this->db->table('queued_jobs')->where('id', $jobId)->update([
            'status' => 'completed',
            'reserved_at' => null,
            'updated_at' => $now,
        ]);
    }

    /**
     * Mark a job as permanently failed.
     */
    public function fail(int $jobId, string $error): void
    {
        $now = date('Y-m-d H:i:s');
        $this->db->table('queued_jobs')->where('id', $jobId)->update([
            'status' => 'failed',
            'error_message' => $error,
            'reserved_at' => null,
            'updated_at' => $now,
        ]);
    }

    /**
     * Retry a job with backoff or fail if max attempts reached.
     */
    public function retry(int $jobId, int $backoffSeconds = 60, ?string $errorMessage = null): void
    {
        $job = $this->db->table('queued_jobs')->where('id', $jobId)->get()->getRowArray();
        if (! $job) return;

        $attempts = (int) $job['attempts'];
        $maxAttempts = (int) $job['max_attempts'];

        if ($attempts >= $maxAttempts) {
            $this->fail($jobId, $errorMessage ?: "Max attempts ({$maxAttempts}) reached.");
            return;
        }

        $now = time();
        $availableAt = date('Y-m-d H:i:s', $now + max(0, $backoffSeconds));
        $updatedAt = date('Y-m-d H:i:s', $now);

        $this->db->table('queued_jobs')->where('id', $jobId)->update([
            'status' => 'pending',
            'available_at' => $availableAt,
            'reserved_at' => null,
            'error_message' => $errorMessage,
            'updated_at' => $updatedAt,
        ]);
    }

    /**
     * Purge old completed/failed jobs older than specified days.
     */
    public function purgeOldJobs(int $days = 7): int
    {
        $cutoff = date('Y-m-d H:i:s', time() - ($days * 86400));
        $this->db->table('queued_jobs')
            ->whereIn('status', ['completed', 'failed'])
            ->where('updated_at <', $cutoff)
            ->delete();

        return $this->db->affectedRows();
    }
}
