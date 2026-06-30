<?php

namespace App\Services;

class JwtService
{
    private const ALG = 'HS256';

    public function issue(array $claims, int $ttlSeconds = 28800): string
    {
        $now = time();
        $payload = array_merge($claims, [
            'iat' => $now,
            'exp' => $now + $ttlSeconds,
            'iss' => 'if-instrument-umkm',
        ]);

        $header = ['typ' => 'JWT', 'alg' => self::ALG];
        $segments = [
            $this->base64UrlEncode(json_encode($header, JSON_UNESCAPED_SLASHES)),
            $this->base64UrlEncode(json_encode($payload, JSON_UNESCAPED_SLASHES)),
        ];
        $segments[] = $this->sign(implode('.', $segments));

        return implode('.', $segments);
    }

    public function verify(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) return null;

        [$header64, $payload64, $signature] = $parts;
        $expected = $this->sign($header64 . '.' . $payload64);
        if (! hash_equals($expected, $signature)) return null;

        $header = json_decode($this->base64UrlDecode($header64), true);
        $payload = json_decode($this->base64UrlDecode($payload64), true);
        if (($header['alg'] ?? '') !== self::ALG || ! is_array($payload)) return null;
        if (($payload['exp'] ?? 0) < time()) return null;

        return $payload;
    }

    private function sign(string $value): string
    {
        return $this->base64UrlEncode(hash_hmac('sha256', $value, $this->secret(), true));
    }

    private function secret(): string
    {
        return (string) (env('JWT_SECRET') ?: env('app.jwtSecret') ?: env('encryption.key') ?: 'if-instrument-dev-secret-change-me');
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function base64UrlDecode(string $value): string
    {
        return base64_decode(strtr($value, '-_', '+/')) ?: '';
    }
}
