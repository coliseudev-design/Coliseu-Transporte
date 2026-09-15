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
            using (FbCommand cmd = new FbCommand("SELECT FIRST 5 TIPO, COUNT(*) FROM PEDIDOS WHERE STATUS = 2 GROUP BY TIPO", conn))
            using (FbDataReader r = cmd.ExecuteReader())
            {
                while (r.Read())
                {
                    Console.WriteLine($"TIPO: {r[0]}, COUNT: {r[1]}");
                }
            }
        }
    }
}
