<?php

namespace App\Jobs;

interface JobInterface
{
    /**
     * Execute the job with given payload.
     *
     * @param array $payload
     * @return bool True if successful, false if failed and needs retry.
     */
    public function handle(array $payload): bool;
}
