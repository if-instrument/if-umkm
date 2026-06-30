<?php

namespace App\Services;

class ReceiptRendererService
{
    public function renderHtml(array $order, array $company, array $outlet, array $items, array $options = []): string
    {
        $brand = $company['brand_name'] ?: ($company['name'] ?? 'IF Instrument');
        $logo = (string) ($options['logoSrc'] ?? $this->logoSrc((string) ($company['logo_path'] ?? '')));
        $outletCode = (string) ($outlet['code'] ?? '');
        $outletName = (string) ($outlet['name'] ?? 'Outlet');
        $outletAddress = (string) ($outlet['address'] ?? '');
        $statusLabel = (string) ($order['payment_status'] ?? 'unpaid');
        $rows = implode('', array_map(fn ($item) => $this->itemRow($item), $items));
        $subtotal = (float) ($order['product_revenue'] ?? $this->itemsSubtotal($items));
        $packaging = (float) ($order['packaging_fee'] ?? 0);
        $tax = (float) ($order['tax_total'] ?? 0);
        $service = max(0, (float) ($order['grand_total'] ?? 0) - $subtotal - $packaging - $tax);
        $paymentFee = (float) ($order['payment_fee'] ?? 0);
        $customerPaysFee = ($order['payment_fee_payer'] ?? '') === 'customer';
        $total = (float) ($order['grand_total'] ?? 0);
        $title = $options['title'] ?? 'Receipt Order';
        $paperStyle = 'width:380px;max-width:380px;margin:0 auto;background:#ffffff;border:1px solid #e5ddd4;font-family:Consolas,Menlo,Monaco,monospace;font-size:13px;line-height:1.45;color:#221d19;';

        return '<div style="margin:0;padding:20px;background:#f7f1ea;color:#201a15;font-family:Arial,Helvetica,sans-serif;">'
            . '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background:#f7f1ea;"><tr><td align="center">'
            . '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:380px;max-width:380px;border-collapse:collapse;margin:0 auto 14px;"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.3;font-weight:700;color:#201a15;">' . $this->e($title) . '</td></tr></table>'
            . '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="' . $paperStyle . '">'
            . '<tr><td style="text-align:center;border-bottom:1px dashed #9c8c7e;padding:18px 16px 12px 16px;">'
            . ($logo !== '' ? '<img src="' . $this->e($logo) . '" alt="' . $this->e($brand) . '" width="58" height="58" style="display:block;width:58px;height:58px;object-fit:contain;margin:0 auto 8px;border:0;outline:none;text-decoration:none;">' : '')
            . '<div style="font-size:18px;line-height:1.25;font-weight:900;text-transform:uppercase;letter-spacing:.5px;">' . $this->e($brand) . '</div>'
            . '<div style="font-size:14px;line-height:1.35;">' . $this->e($this->outletLabel($outletName, $outletCode)) . '</div>'
            . ($outletAddress !== '' ? '<div style="font-size:13px;line-height:1.35;color:#5f5348;">' . nl2br($this->e($outletAddress)) . '</div>' : '')
            . '</td></tr>'
            . '<tr><td style="border-bottom:1px dashed #9c8c7e;padding:12px 16px;">'
            . $this->line('ORDER', '#' . ($order['order_no'] ?? '-'))
            . $this->line('TANGGAL', $this->date((string) ($order['created_at'] ?? '')))
            . $this->line('LAYANAN', (string) ($order['service_type'] ?? '-'))
            . $this->line('CUSTOMER', (string) (($order['customer_name'] ?: $order['table_name']) ?: '-'))
            . $this->line('STATUS', strtoupper($statusLabel))
            . $this->line('BAYAR', (string) ($order['payment_method'] ?: '-'))
            . '</td></tr>'
            . '<tr><td style="border-bottom:1px dashed #9c8c7e;padding:12px 16px;">' . ($rows ?: $this->emptyRow()) . '</td></tr>'
            . '<tr><td style="padding:12px 16px 0 16px;">'
            . $this->line('SUBTOTAL', $this->idr($subtotal))
            . ($packaging > 0 ? $this->line('KEMASAN', $this->idr($packaging)) : '')
            . ($service > 0 ? $this->line('SERVICE', $this->idr($service)) : '')
            . ($tax > 0 ? $this->line('PAJAK', $this->idr($tax)) : '')
            . ($customerPaysFee && $paymentFee > 0 ? $this->line('PAYMENT FEE', $this->idr($paymentFee)) : '')
            . '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border-top:1px dashed #9c8c7e;margin-top:8px;"><tr><td style="padding-top:9px;">' . $this->line('TOTAL', $this->idr($total), true) . '</td></tr></table>'
            . '</td></tr>'
            . '<tr><td style="text-align:center;border-top:1px dashed #9c8c7e;padding:12px 16px 16px 16px;color:#4f4339;">'
            . '<strong style="display:block;color:#18130f;">TERIMA KASIH</strong>'
            . '<span>Simpan struk ini sebagai bukti transaksi.</span>'
            . '</td></tr>'
            . '</table>'
            . '</td></tr></table>'
            . '</div>';
    }

    private function itemRow(array $item): string
    {
        $modifiers = $this->modifiers($item);
        $qty = (float) ($item['qty'] ?? 0);
        $unit = (float) ($item['unit_price'] ?? 0);
        $total = (float) ($item['line_total'] ?? ($qty * $unit));
        return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:9px;">'
            . '<tr>'
            . '<td valign="top" style="width:70%;padding:0 8px 0 0;font-family:Consolas,Menlo,Monaco,monospace;font-size:13px;line-height:1.35;color:#221d19;">'
            . '<strong style="display:block;text-transform:uppercase;">' . $this->e((string) ($item['product_name'] ?? 'Item')) . '</strong>'
            . ($modifiers !== '' ? '<span style="display:block;color:#5f5348;font-size:12px;">' . $this->e($modifiers) . '</span>' : '')
            . '<span style="display:block;color:#5f5348;font-size:12px;">' . $this->qty($qty) . ' x ' . $this->idr($unit) . '</span>'
            . '</td>'
            . '<td valign="top" align="right" style="width:30%;padding:0;font-family:Consolas,Menlo,Monaco,monospace;font-size:13px;line-height:1.35;color:#221d19;font-weight:700;white-space:nowrap;">' . $this->idr($total) . '</td>'
            . '</tr>'
            . '</table>';
    }

    private function modifiers(array $item): string
    {
        $snapshot = json_decode((string) ($item['modifier_snapshot'] ?? ''), true);
        if (! is_array($snapshot)) return '';
        $modifiers = $snapshot['modifiers'] ?? [];
        if (! is_array($modifiers)) return '';
        return implode(', ', array_filter(array_map('strval', $modifiers)));
    }

    private function emptyRow(): string
    {
        return $this->line('ITEM', '-');
    }

    private function line(string $label, string $value, bool $strong = false): string
    {
        $fontSize = $strong ? '16px' : '13px';
        return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:3px 0;">'
            . '<tr>'
            . '<td valign="top" style="width:42%;padding:0 8px 0 0;font-family:Consolas,Menlo,Monaco,monospace;font-size:' . $fontSize . ';line-height:1.35;color:#5f5348;font-weight:' . ($strong ? '900' : '400') . ';">' . $this->e($label) . '</td>'
            . '<td valign="top" align="right" style="width:58%;padding:0;font-family:Consolas,Menlo,Monaco,monospace;font-size:' . $fontSize . ';line-height:1.35;color:#221d19;font-weight:900;text-align:right;">' . $this->e($value) . '</td>'
            . '</tr>'
            . '</table>';
    }

    private function itemsSubtotal(array $items): float
    {
        return array_sum(array_map(fn ($item) => (float) ($item['line_total'] ?? 0), $items));
    }

    private function logoSrc(string $path): string
    {
        if ($path === '') return '';
        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) return $path;
        $local = FCPATH . ltrim($path, '/');
        if (is_file($local) && filesize($local) <= 300000) {
            $mime = mime_content_type($local) ?: $this->mimeFromExtension($local);
            $content = file_get_contents($local);
            if ($content !== false && str_starts_with($mime, 'image/')) {
                return 'data:' . $mime . ';base64,' . base64_encode($content);
            }
        }
        return rtrim((string) base_url(), '/') . '/' . ltrim($path, '/');
    }

    private function mimeFromExtension(string $path): string
    {
        return match (strtolower(pathinfo($path, PATHINFO_EXTENSION))) {
            'jpg', 'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            default => 'application/octet-stream',
        };
    }

    private function outletLabel(string $name, string $code): string
    {
        return trim($code) !== '' ? $name . ' (' . $code . ')' : $name;
    }

    private function date(string $value): string
    {
        $time = $value !== '' ? strtotime($value) : time();
        return date('d/m/Y H:i', $time ?: time());
    }

    private function idr(float $value): string
    {
        return 'Rp ' . number_format($value, 0, ',', '.');
    }

    private function qty(float $value): string
    {
        return rtrim(rtrim(number_format($value, 3, ',', '.'), '0'), ',');
    }

    private function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
    }
}
