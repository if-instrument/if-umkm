import pymysql

def inspect_db():
    conn = pymysql.connect(host='127.0.0.1', user='root', password='1m4mf4154l')
    cursor = conn.cursor()

    print("=== OLD DATABASE: if_umkm_ai_db ===")
    conn.select_db('if_umkm_ai_db')
    cursor.execute("SHOW TABLES")
    tables = [r[0] for r in cursor.fetchall()]
    print("Tables in if_umkm_ai_db:", tables)

    for t in tables:
        cursor.execute(f"SELECT COUNT(*) FROM {t}")
        cnt = cursor.fetchone()[0]
        print(f"Table '{t}' row count: {cnt}")
        if cnt > 0:
            cursor.execute(f"SELECT * FROM {t}")
            rows = cursor.fetchall()
            cursor.execute(f"DESCRIBE {t}")
            cols = [col[0] for col in cursor.fetchall()]
            print(f"  Columns: {cols}")
            for row in rows:
                print(f"  Row ID={row[0]}: company_key={row[1] if len(row)>1 else 'N/A'}, user_key={row[2] if len(row)>2 else 'N/A'}")

    print("\n=== NEW DATABASE: if_instrument_aiservice ===")
    conn.select_db('if_instrument_aiservice')
    cursor.execute("SHOW TABLES")
    new_tables = [r[0] for r in cursor.fetchall()]
    for t in ['face_embeddings', 'fingerprint_templates']:
        if t in new_tables:
            cursor.execute(f"SELECT COUNT(*) FROM {t}")
            cnt = cursor.fetchone()[0]
            print(f"New Table '{t}' row count: {cnt}")
            if cnt > 0:
                cursor.execute(f"SELECT * FROM {t}")
                rows = cursor.fetchall()
                for row in rows:
                    print(f"  New Row ID={row[0]}: {row[:4]}")

if __name__ == "__main__":
    inspect_db()
