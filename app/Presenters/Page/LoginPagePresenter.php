<?php

namespace App\Presenters\Page;

class LoginPagePresenter
{
    public function bootstrap(array $data): array
    {
        return [
            'mode' => $data['mode'] ?? 'global',
            'company' => $data['company'] ? $this->company($data['company']) : null,
            'companies' => array_values(array_map(fn ($row) => $this->company($row), $data['companies'] ?? [])),
        ];
    }

    private function company(array $row): array
    {
        return [
            'id' => $row['id'] ?? null,
            'companyId' => $row['companyId'] ?? '',
            'name' => $row['brandName'] ?? $row['name'] ?? '',
            'brandName' => $row['brandName'] ?? $row['name'] ?? '',
            'routeSlug' => $row['routeSlug'] ?? '',
            'routeUrl' => $row['routeUrl'] ?? (($row['routeSlug'] ?? '') ? '/' . $row['routeSlug'] . '/login' : ''),
            'logoUrl' => $row['logoUrl'] ?? '',
            'themeColor' => $row['themeColor'] ?? '#6e3a16',
            'tagline' => $row['tagline'] ?? 'UMKM Solution',
        ];
    }
}
