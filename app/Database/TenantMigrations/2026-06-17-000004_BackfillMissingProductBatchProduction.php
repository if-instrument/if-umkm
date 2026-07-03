<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class BackfillMissingProductBatchProduction extends Migration
{
    public function up(): void
    {
        if (! $this->db->tableExists('product_batches') || ! $this->db->tableExists('product_batch_movements')) {
            return;
        }

        $rows = $this->db->table('product_batches b')
            ->select('b.*')
            ->join('product_batch_movements m', "m.product_batch_id = b.id AND m.movement_type = 'production'", 'left')
            ->where('m.id', null)
            ->get()
            ->getResultArray();

        $now = date('Y-m-d H:i:s');
        foreach ($rows as $row) {
            $qty = (float) ($row['qty_initial'] ?? 0);
            $unitCost = (float) ($row['unit_cost'] ?? 0);
            $createdAt = $row['created_at'] ?: $now;
            $this->db->table('product_batch_movements')->insert([
                'company_id' => (int) $row['company_id'],
                'outlet_id' => (int) $row['outlet_id'],
                'product_id' => (int) $row['product_id'],
                'product_batch_id' => (int) $row['id'],
                'movement_type' => 'production',
                'stock_before' => 0,
                'qty_in' => $qty,
                'qty_out' => 0,
                'stock_after' => $qty,
                'unit_cost' => $unitCost,
                'total_cost' => $qty * $unitCost,
                'notes' => 'Backfill produksi batch',
                'created_at' => $createdAt,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        if (! $this->db->tableExists('product_batch_movements')) {
            return;
        }

        $this->db->table('product_batch_movements')
            ->where('movement_type', 'production')
            ->where('notes', 'Backfill produksi batch')
            ->delete();
    }
}
