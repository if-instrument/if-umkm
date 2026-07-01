<?php

namespace App\Services;

use App\Models\UserInvitationModel;
use App\Models\UserModel;
use Config\Database;

class UserInvitationService
{
    public function invite(int $userId): array
    {
        $db = Database::connect();
        $user = (new UserModel())->find($userId);
        if (! $user || $user['type'] === 'super_admin') {
            throw new \InvalidArgumentException('User perusahaan tidak ditemukan.');
        }
        if (StatusCodeService::isActive($user['status'] ?? '')) {
            throw new \InvalidArgumentException('User sudah aktif dan tidak memerlukan undangan baru.');
        }

        $companyId = $this->companyIdForTenantUser($db, $user);
        $company = $db->table('companies')->where('id', $companyId)->get()->getRowArray();
        if (! $company) {
            throw new \InvalidArgumentException('Perusahaan user tidak ditemukan.');
        }

        $invitations = new UserInvitationModel();
        $db->table('user_invitations')->where('user_id', $userId)->whereIn('status', [StatusCodeService::INVITATION_PENDING, 'pending'])->update([
            'status' => StatusCodeService::INVITATION_SUPERSEDED,
            'updated_at' => date('Y-m-d H:i:s'),
        ]);
        (new UserModel())->update($userId, ['status' => StatusCodeService::DRAFT]);

        $token = bin2hex(random_bytes(32));
        $now = date('Y-m-d H:i:s');
        $expiresAt = date('Y-m-d H:i:s', time() + 86400);
        $invitationId = (int) $invitations->insert($this->withCompanyData($db, 'user_invitations', [
            'company_id' => $companyId,
            'user_id' => $userId,
            'email' => $user['email'],
            'token_hash' => hash('sha256', $token),
            'expires_at' => $expiresAt,
            'status' => StatusCodeService::INVITATION_PENDING,
        ], $companyId));
        $centralInvitationId = $this->mirrorInvitationToCentral($db, $user, $company, $token, $expiresAt);

        $url = rtrim((string) config('App')->baseURL, '/') . '/invitation/' . $token;
        $email = service('email');
        $email->setFrom((string) (env('email.fromEmail') ?: env('email.SMTPUser')), (string) (env('email.fromName') ?: 'IF Instrument'));
        $email->setTo($user['email']);
        $email->setSubject('Aktivasi akun ' . ($company['brand_name'] ?: $company['name']));
        $email->setMessage($this->message($user, $company, $url, $expiresAt));

        if (! $email->send()) {
            $invitations->update($invitationId, ['status' => StatusCodeService::INVITATION_FAILED]);
            if ($centralInvitationId) {
                $this->centralConnection()->table('user_invitations')->where('id', $centralInvitationId)->update([
                    'status' => StatusCodeService::INVITATION_FAILED,
                    'updated_at' => $now,
                ]);
            }
            return [
                'email' => $user['email'],
                'expiresAt' => $expiresAt,
                'status' => StatusCodeService::INVITATION_FAILED,
                'message' => 'Akun tersimpan, tetapi email aktivasi gagal dikirim. Periksa SMTP lalu kirim ulang undangan.',
            ];
        }

        $invitations->update($invitationId, ['sent_at' => $now]);
        if ($centralInvitationId) {
            $this->centralConnection()->table('user_invitations')->where('id', $centralInvitationId)->update(['sent_at' => $now]);
        }
        return ['email' => $user['email'], 'expiresAt' => $expiresAt, 'status' => StatusCodeService::INVITATION_SENT];
    }

    public function detail(string $token): array
    {
        $row = $this->invitation($token);
        return [
            'email' => $row['email'],
            'name' => $row['user_name'],
            'companyName' => $row['company_name'],
            'companySlug' => $row['route_slug'],
            'logoUrl' => $row['logo_path'] ?? '',
            'themeColor' => $row['theme_color'] ?? '#6e3a16',
            'expiresAt' => $row['expires_at'],
        ];
    }

    public function accept(string $token, string $password, string $confirmation): array
    {
        if (strlen($password) < 8) {
            throw new \InvalidArgumentException('Password minimal 8 karakter.');
        }
        if ($password !== $confirmation) {
            throw new \InvalidArgumentException('Konfirmasi password tidak sama.');
        }

        $row = $this->invitation($token);
        $db = Database::connect();
        $now = date('Y-m-d H:i:s');
        $db->transStart();
        (new UserModel())->update((int) $row['user_id'], [
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'status' => StatusCodeService::ACTIVE,
        ]);
        (new UserInvitationModel())->update((int) $row['id'], [
            'status' => StatusCodeService::INVITATION_ACCEPTED,
            'accepted_at' => $now,
        ]);
        $db->transComplete();

        $tenant = (new TenantDatabaseService())->connectionForCompanySlug((string) ($row['route_slug'] ?? ''));
        if ($tenant) {
            $tenant->table('users')
                ->where('email', strtolower((string) $row['email']))
                ->update([
                    'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                    'status' => StatusCodeService::ACTIVE,
                    'updated_at' => $now,
                ]);
            $tenant->table('user_invitations')
                ->where('email', strtolower((string) $row['email']))
                ->whereIn('status', [StatusCodeService::INVITATION_PENDING, 'pending'])
                ->update([
                    'status' => StatusCodeService::INVITATION_ACCEPTED,
                    'accepted_at' => $now,
                    'updated_at' => $now,
                ]);
        }

        return [
            'companySlug' => $row['route_slug'],
            'loginUrl' => '/' . $row['route_slug'] . '/login',
        ];
    }

    private function invitation(string $token): array
    {
        if (! preg_match('/^[a-f0-9]{64}$/', $token)) {
            throw new \InvalidArgumentException('Token undangan tidak valid.');
        }

        $row = Database::connect()->table('user_invitations i')
            ->select('i.*, u.name user_name, c.name company_name, c.route_slug, c.logo_path, c.theme_color')
            ->join('users u', 'u.id = i.user_id')
            ->join('companies c', 'c.id = i.company_id')
            ->where('i.token_hash', hash('sha256', $token))
            ->whereIn('i.status', [StatusCodeService::INVITATION_PENDING, 'pending'])
            ->get()->getRowArray();

        if (! $row || strtotime($row['expires_at']) < time()) {
            throw new \InvalidArgumentException('Undangan tidak ditemukan atau sudah kedaluwarsa.');
        }
        return $row;
    }

    private function mirrorInvitationToCentral($currentDb, array $user, array $company, string $token, string $expiresAt): int
    {
        $central = $this->centralConnection();
        if ($currentDb->getDatabase() === $central->getDatabase()) {
            return 0;
        }

        $email = strtolower((string) $user['email']);
        $centralUser = $central->table('users')->where('email', $email)->get()->getRowArray();
        $now = date('Y-m-d H:i:s');
        if (! $centralUser) {
            $central->table('users')->insert([
                'company_id' => (int) ($user['company_id'] ?? $company['id'] ?? 1),
                'name' => $user['name'] ?? $email,
                'email' => $email,
                'password_hash' => $user['password_hash'] ?? password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT),
                'type' => $user['type'] ?? 'company_user',
                'status' => StatusCodeService::DRAFT,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $centralUserId = (int) $central->insertID();
        } else {
            $centralUserId = (int) $centralUser['id'];
            $central->table('users')->where('id', $centralUserId)->update([
                'name' => $user['name'] ?? $centralUser['name'],
                'company_id' => (int) ($user['company_id'] ?? $company['id'] ?? 1),
                'status' => StatusCodeService::DRAFT,
                'updated_at' => $now,
            ]);
        }

        $central->table('user_invitations')
            ->where('user_id', $centralUserId)
            ->whereIn('status', [StatusCodeService::INVITATION_PENDING, 'pending'])
            ->update([
                'status' => StatusCodeService::INVITATION_SUPERSEDED,
                'updated_at' => $now,
            ]);
        $central->table('user_invitations')->insert([
            'company_id' => (int) ($user['company_id'] ?? $company['id'] ?? 1),
            'user_id' => $centralUserId,
            'email' => $email,
            'token_hash' => hash('sha256', $token),
            'expires_at' => $expiresAt,
            'status' => StatusCodeService::INVITATION_PENDING,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return (int) $central->insertID();
    }

    private function centralConnection()
    {
        return Database::connect(config(\Config\Database::class)->default, false);
    }

    private function companyIdForTenantUser($db, array $user): int
    {
        if (! empty($user['company_id'])) {
            return (int) $user['company_id'];
        }

        if ($db->tableExists('companies')) {
            return (int) ($db->table('companies')->select('id')->orderBy('id')->get()->getRowArray()['id'] ?? 1);
        }

        return 1;
    }

    private function withCompanyData($db, string $table, array $data, int $companyId): array
    {
        if ($db->tableExists($table) && $db->fieldExists('company_id', $table)) {
            $data['company_id'] = $companyId;
        } else {
            unset($data['company_id']);
        }

        return $data;
    }

    private function message(array $user, array $company, string $url, string $expiresAt): string
    {
        $name = htmlspecialchars($user['name'], ENT_QUOTES, 'UTF-8');
        $companyName = htmlspecialchars($company['brand_name'] ?: $company['name'], ENT_QUOTES, 'UTF-8');
        $safeUrl = htmlspecialchars($url, ENT_QUOTES, 'UTF-8');
        return <<<HTML
<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#241a14;line-height:1.6">
  <h2>Aktivasi akun {$companyName}</h2>
  <p>Halo {$name}, akun Anda telah dibuat di IF Instrument UMKM Solution.</p>
  <p>Verifikasi email dan buat password melalui tombol berikut:</p>
  <p><a href="{$safeUrl}" style="display:inline-block;padding:12px 18px;background:#6e3a16;color:#fff;text-decoration:none;border-radius:6px">Aktivasi Akun</a></p>
  <p>Link berlaku sampai {$expiresAt}. Abaikan email ini jika Anda tidak mengenali undangan tersebut.</p>
</body></html>
HTML;
    }
}
