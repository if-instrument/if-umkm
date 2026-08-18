<?php

namespace App\Commands;

use App\Jobs\JobInterface;
use App\Services\QueueService;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;

class QueueWorker extends BaseCommand
{
    protected $group = 'Queue';
    protected $name = 'queue:work';
    protected $description = 'Process background queued jobs from MySQL.';
    protected $usage = 'queue:work [options]';
    protected $options = [
        '--queue' => 'The name of the queue to work (default: "default")',
        '--once'  => 'Only process the next job and exit',
        '--sleep' => 'Number of seconds to sleep when no job is available (default: 3)',
        '--tries' => 'Maximum number of attempts for a job before failing (default: 3)',
    ];

    public function run(array $params)
    {
        $queueName = $params['queue'] ?? CLI::getOption('queue') ?: 'default';
        $runOnce = array_key_exists('once', $params) || CLI::getOption('once');
        $sleepSeconds = (int) ($params['sleep'] ?? CLI::getOption('sleep') ?: 3);
        $maxTries = (int) ($params['tries'] ?? CLI::getOption('tries') ?: 3);

        $queueService = new QueueService();

        CLI::write("Starting queue worker on queue [{$queueName}]...", 'green');

        while (true) {
            $job = $queueService->pop($queueName);

            if (! $job) {
                if ($runOnce) {
                    CLI::write("No pending jobs on queue [{$queueName}]. Exiting.", 'yellow');
                    break;
                }
                sleep(max(1, $sleepSeconds));
                continue;
            }

            $jobId = (int) $job['id'];
            $handlerClass = $job['handler'];
            $attempts = (int) $job['attempts'];

            CLI::write("[#{$jobId}] Processing: {$handlerClass} (Attempt {$attempts}/{$job['max_attempts']})", 'cyan');

            try {
                if (! class_exists($handlerClass)) {
                    throw new \RuntimeException("Job handler class [{$handlerClass}] not found.");
                }

                $handler = new $handlerClass();
                if (! $handler instanceof JobInterface) {
                    throw new \RuntimeException("Job handler [{$handlerClass}] must implement " . JobInterface::class);
                }

                $success = $handler->handle($job['payload']);

                if ($success) {
                    $queueService->complete($jobId);
                    CLI::write("[#{$jobId}] Completed: {$handlerClass}", 'green');
                } else {
                    $queueService->retry($jobId, 60 * $attempts, "Handler returned false.");
                    CLI::write("[#{$jobId}] Failed & Scheduled for retry: {$handlerClass}", 'yellow');
                }
            } catch (\Throwable $e) {
                $errorMsg = $e->getMessage();
                $queueService->retry($jobId, 60 * $attempts, $errorMsg);
                CLI::error("[#{$jobId}] Exception: {$errorMsg}");
            }

            if ($runOnce) {
                break;
            }
        }
    }
}
