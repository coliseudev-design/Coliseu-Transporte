using System;
using FirebirdSql.Data.FirebirdClient;

class Program
{
    static void Main()
    {
        string cs = "User=SYSDBA;Password=masterkey;Database=C:\\Nexus\\Data\\KSTRATOR.FDB;DataSource=localhost;Port=3050;Dialect=3;Charset=NONE;";
        using (FbConnection conn = new FbConnection(cs))
        {
            conn.Open();
            try {
                using (FbCommand cmd = new FbCommand("SELECT FIRST 1 * FROM EMPRESA", conn))
                using (FbDataReader r = cmd.ExecuteReader())
                {
                    for(int i = 0; i < r.FieldCount; i++) {
                        Console.WriteLine($"COLUMN: {r.GetName(i)}");
                    }
                }
            }
            catch (Exception ex) {
                Console.WriteLine($"ERRO: {ex.Message}");
            }
        }
    }
}
