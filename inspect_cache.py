import sqlite3

try:
    conn = sqlite3.connect('C:/Sales/sync_cache.sqlite')
    cursor = conn.cursor()

    # Get tables in SQLite cache
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    print("Tables in sync_cache.sqlite:", tables)

    for table in tables:
        tname = table[0]
        cursor.execute(f"SELECT COUNT(*) FROM {tname}")
        count = cursor.fetchone()[0]
        print(f"Table {tname}: {count} records")

    # Let's inspect some records from SyncHashes table
    cursor.execute("PRAGMA table_info(SyncHashes)")
    columns = cursor.fetchall()
    print("SyncHashes columns:", columns)

    cursor.execute("SELECT DISTINCT Entity FROM SyncHashes")
    labels = cursor.fetchall()
    print("Distinct Entities:", labels)

    # Let's count records for Nexus_Financeiro
    cursor.execute("SELECT COUNT(*) FROM SyncHashes WHERE Entity = 'Nexus_Financeiro'")
    count_nexus_fin = cursor.fetchone()[0]
    print("Nexus_Financeiro count in cache:", count_nexus_fin)

    # Let's see some specific records in SyncHashes for IdFirebird = '5746'
    cursor.execute("SELECT * FROM SyncHashes WHERE IdFirebird = '5746'")
    print("SyncHashes row for 5746:", cursor.fetchall())




    conn.close()
except Exception as e:
    print("Error:", e)
