<?php

namespace Tests\Unit;

use App\Jobs\JobInterface;
use App\Services\QueueService;
use CodeIgniter\Test\CIUnitTestCase;

class MockTestJob implements JobInterface
{
    public static bool $executed = false;

    public function handle(array $payload): bool
    {
        self::$executed = true;
        return ($payload['should_pass'] ?? true) === true;
    }
}

class QueueServiceTest extends CIUnitTestCase
{
    private QueueService $queue;

    protected function setUp(): void
    {
        parent::setUp();
        $this->queue = new QueueService();
    }

    public function testPushAndPopJobLifecycle(): void
    {
        $queueName = 'test_queue_' . bin2hex(random_bytes(4));
        $payload = ['user_id' => 42, 'action' => 'send_welcome'];

        // 1. Push job
        $jobId = $this->queue->push(MockTestJob::class, $payload, 0, $queueName);
        $this->assertGreaterThan(0, $jobId);

        // 2. Pop job
        $popped = $this->queue->pop($queueName);
        $this->assertNotNull($popped);
        $this->assertSame($jobId, (int) $popped['id']);
        $this->assertSame(MockTestJob::class, $popped['handler']);
        $this->assertSame(1, (int) $popped['attempts']);
        $this->assertSame('processing', $popped['status']);
        $this->assertSame($payload, $popped['payload']);

        // 3. Mark Complete
        $this->queue->complete($jobId);

        // 4. Verify no more jobs in queue
        $nextPopped = $this->queue->pop($queueName);
        $this->assertNull($nextPopped);
    }

    public function testJobRetryAndFailure(): void
    {
        $queueName = 'retry_queue_' . bin2hex(random_bytes(4));
        $payload = ['attempt' => 1];

        // Push with max 2 attempts
        $jobId = $this->queue->push(MockTestJob::class, $payload, 0, $queueName, 2);

        // First pop
        $popped = $this->queue->pop($queueName);
        $this->assertNotNull($popped);
        $this->assertSame(1, (int) $popped['attempts']);

        // First retry (delay 0s for immediate testing)
        $this->queue->retry($jobId, 0, 'Temporary timeout');

        // Second pop
        $secondPopped = $this->queue->pop($queueName);
        $this->assertNotNull($secondPopped);
        $this->assertSame(2, (int) $secondPopped['attempts']);

        // Second retry (exceeds max attempts 2 -> should fail)
        $this->queue->retry($jobId, 0, 'Permanent timeout');

        // Third pop should return null
        $thirdPopped = $this->queue->pop($queueName);
        $this->assertNull($thirdPopped);
    }

    public function testMockJobExecution(): void
    {
        MockTestJob::$executed = false;
        $job = new MockTestJob();
        $result = $job->handle(['should_pass' => true]);

        $this->assertTrue($result);
        $this->assertTrue(MockTestJob::$executed);

        $failResult = $job->handle(['should_pass' => false]);
        $this->assertFalse($failResult);
    }
}
