<?php

namespace App\Jobs;

use Config\Services;

class SendEmailJob implements JobInterface
{
    public function handle(array $payload): bool
    {
        $to = $payload['to'] ?? '';
        $subject = $payload['subject'] ?? 'Pemberitahuan Sistem';
        $message = $payload['message'] ?? '';
        $fromEmail = $payload['fromEmail'] ?? env('email.fromEmail') ?: env('email.SMTPUser');
        $fromName = $payload['fromName'] ?? env('email.fromName') ?: 'IF Instrument';

        if (empty($to) || empty($message)) {
            log_message('error', 'SendEmailJob failed: Recipient email or message is empty.');
            return false;
        }

        try {
            $email = Services::email();
            $email->setFrom((string) $fromEmail, (string) $fromName);
            $email->setTo($to);
            $email->setSubject($subject);
            $email->setMessage($message);
            $email->setMailType('html');

            $sent = $email->send();
            if (! $sent) {
                log_message('error', 'SendEmailJob error: ' . $email->printDebugger(['headers']));
            }
            return (bool) $sent;
        } catch (\Throwable $e) {
            log_message('error', 'SendEmailJob exception: ' . $e->getMessage());
            return false;
        }
    }
}
