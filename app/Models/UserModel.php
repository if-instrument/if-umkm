<?php

namespace App\Models;

class UserModel extends BaseAppModel
{
    protected $table = 'users';
    protected $primaryKey = 'id';
    protected $allowedFields = ['company_id', 'user_key', 'name', 'email', 'password_hash', 'type', 'status'];
    protected $hidden = ['password_hash'];

    public static function generateGuid(): string
    {
        return sprintf(
            '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0xffff)
        );
    }

    public function ensureUserKey(array $user): string
    {
        $existing = (string) ($user['user_key'] ?? '');
        if ($existing !== '') {
            return $existing;
        }

        $userId = (int) ($user['id'] ?? 0);
        $newKey = self::generateGuid();

        if ($userId > 0) {
            $this->update($userId, ['user_key' => $newKey]);
        }

        return $newKey;
    }
}
