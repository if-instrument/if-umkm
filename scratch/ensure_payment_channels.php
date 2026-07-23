<?php

$dbConfig = [
    'host' => '127.0.0.1',
    'port' => 3306,
    'user' => 'root',
    'pass' => '1m4mf4154l',
    'db'   => 'if_instrument_umkm'
];

try {
    $dsn = "mysql:host={$dbConfig['host']};port={$dbConfig['port']};dbname={$dbConfig['db']};charset=utf8mb4";
    $pdo = new PDO($dsn, $dbConfig['user'], $dbConfig['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 5
    ]);
    
    // Check fields
    $stmt = $pdo->query("SHOW COLUMNS FROM payment_methods");
    $columns = $stmt->fetchAll(PDO::FETCH_COLUMN, 0);
    
    if (!in_array('is_available_pos', $columns)) {
        $pdo->exec("ALTER TABLE payment_methods ADD COLUMN is_available_pos TINYINT(1) DEFAULT 1 AFTER status");
        echo "Added is_available_pos column!\n";
    }
    
    if (!in_array('is_available_online', $columns)) {
        $pdo->exec("ALTER TABLE payment_methods ADD COLUMN is_available_online TINYINT(1) DEFAULT 1 AFTER is_available_pos");
        echo "Added is_available_online column!\n";
    }
    
    $stmt = $pdo->query("SHOW COLUMNS FROM payment_methods");
    $columns = $stmt->fetchAll(PDO::FETCH_COLUMN, 0);
    echo "Columns in payment_methods: " . implode(", ", $columns) . "\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
