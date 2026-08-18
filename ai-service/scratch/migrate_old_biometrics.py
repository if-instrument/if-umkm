import pymysql

def run_migration():
    conn = pymysql.connect(host='127.0.0.1', user='root', password='1m4mf4154l', autocommit=False)
    cursor = conn.cursor()

    try:
        # 1. Migrate Face Embeddings
        conn.select_db('if_umkm_ai_db')
        cursor.execute("SELECT id, company_key, user_key, embedding, created_at, updated_at FROM face_embeddings;")
        faces = cursor.fetchall()
        print(f"Found {len(faces)} face embedding records in if_umkm_ai_db.")

        conn.select_db('if_instrument_aiservice')
        inserted_faces = 0
        for f in faces:
            f_id, company_key, user_key, embedding, created_at, updated_at = f
            
            # Check if duplicate exists
            cursor.execute(
                "SELECT COUNT(*) FROM face_embeddings WHERE company_key = %s AND user_key = %s AND embedding = %s;",
                (company_key, user_key, embedding)
            )
            if cursor.fetchone()[0] == 0:
                cursor.execute(
                    "INSERT INTO face_embeddings (company_key, user_key, embedding, created_at, updated_at) VALUES (%s, %s, %s, %s, %s);",
                    (company_key, user_key, embedding, created_at, updated_at)
                )
                inserted_faces += 1

        print(f"Successfully migrated {inserted_faces} face embedding records into if_instrument_aiservice.")

        # 2. Migrate Fingerprint Templates
        conn.select_db('if_umkm_ai_db')
        cursor.execute("SELECT id, company_key, user_key, vendor, template_data, created_at, updated_at FROM fingerprint_templates;")
        fingerprints = cursor.fetchall()
        print(f"Found {len(fingerprints)} fingerprint template records in if_umkm_ai_db.")

        conn.select_db('if_instrument_aiservice')
        inserted_fps = 0
        for fp in fingerprints:
            fp_id, company_key, user_key, vendor, template_data, created_at, updated_at = fp
            
            # Check if duplicate exists
            cursor.execute(
                "SELECT COUNT(*) FROM fingerprint_templates WHERE company_key = %s AND user_key = %s AND vendor = %s AND template_data = %s;",
                (company_key, user_key, vendor, template_data)
            )
            if cursor.fetchone()[0] == 0:
                cursor.execute(
                    "INSERT INTO fingerprint_templates (company_key, user_key, vendor, template_data, created_at, updated_at) VALUES (%s, %s, %s, %s, %s, %s);",
                    (company_key, user_key, vendor, template_data, created_at, updated_at)
                )
                inserted_fps += 1

        print(f"Successfully migrated {inserted_fps} fingerprint template records into if_instrument_aiservice.")

        conn.commit()
        print("Migration committed successfully!")

    except Exception as e:
        conn.rollback()
        print("Migration failed! Error:", e)
    finally:
        conn.close()

if __name__ == "__main__":
    run_migration()
