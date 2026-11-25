// Scanner de disco do Raio-X (Windows). Compilado em tempo de execução pelo
// Windows PowerShell 5.1 via Add-Type, por isso usa só sintaxe C# 5.
//
// Percorre a árvore com DirectoryInfo.EnumerateFileSystemInfos, pula reparse
// points (junctions/symlinks, para não contar nada duas vezes nem sair do
// disco) e devolve uma árvore podada em JSON: só entram pastas/arquivos com
// pelo menos minBytes, no máximo maxKids por pasta; o resto vira "o" (outros).
// O JSON é gravado em UTF-8 num arquivo (o stdout do PowerShell não é UTF-8).
// Progresso vai para o stderr como linhas "P <pastas> <bytes>".
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

public class TurboScanNode
{
    public string Name;
    public bool IsFile;
    public long Size;
    public long Files;
    public long Other;
    public long Errors;
    public List<TurboScanNode> Kids;
}

public static class TurboScan
{
    static long minBytes;
    static int maxKids;
    static long dirCount;
    static long totalBytes;
    static DateTime lastProgress;

    public static void Run(string root, long min, int maxChildren, string outPath)
    {
        minBytes = min;
        maxKids = maxChildren;
        dirCount = 0;
        totalBytes = 0;
        lastProgress = DateTime.UtcNow;
        TurboScanNode node = ScanDir(new DirectoryInfo(root), root);
        StringBuilder sb = new StringBuilder(1 << 16);
        Write(node, sb);
        File.WriteAllText(outPath, sb.ToString(), new UTF8Encoding(false));
        Console.Error.WriteLine("P " + dirCount + " " + totalBytes);
    }

    static TurboScanNode ScanDir(DirectoryInfo dir, string name)
    {
        TurboScanNode n = new TurboScanNode();
        n.Name = name;
        n.Kids = new List<TurboScanNode>();
        dirCount++;

        IEnumerator<FileSystemInfo> it;
        try
        {
            it = dir.EnumerateFileSystemInfos().GetEnumerator();
        }
        catch
        {
            n.Errors++;
            return n;
        }

        while (true)
        {
            FileSystemInfo fsi;
            try
            {
                if (!it.MoveNext()) break;
                fsi = it.Current;
            }
            catch
            {
                n.Errors++;
                break;
            }
            try
            {
                FileAttributes a = fsi.Attributes;
                if ((a & FileAttributes.ReparsePoint) != 0) continue;
                if ((a & FileAttributes.Directory) != 0)
                {
                    TurboScanNode c = ScanDir((DirectoryInfo)fsi, fsi.Name);
                    n.Size += c.Size;
                    n.Files += c.Files;
                    n.Errors += c.Errors;
                    n.Kids.Add(c);
                }
                else
                {
                    long len = ((FileInfo)fsi).Length;
                    n.Size += len;
                    n.Files++;
                    totalBytes += len;
                    TurboScanNode f = new TurboScanNode();
                    f.Name = fsi.Name;
                    f.IsFile = true;
                    f.Size = len;
                    f.Files = 1;
                    if (len >= minBytes) n.Kids.Add(f);
                    else n.Other += len;
                }
            }
            catch
            {
                n.Errors++;
            }
        }

        n.Kids.Sort(delegate (TurboScanNode x, TurboScanNode y) { return y.Size.CompareTo(x.Size); });
        List<TurboScanNode> keep = new List<TurboScanNode>();
        foreach (TurboScanNode c in n.Kids)
        {
            if (keep.Count < maxKids && c.Size >= minBytes) keep.Add(c);
            else n.Other += c.Size;
        }
        n.Kids = keep;

        DateTime now = DateTime.UtcNow;
        if ((now - lastProgress).TotalMilliseconds >= 500)
        {
            lastProgress = now;
            Console.Error.WriteLine("P " + dirCount + " " + totalBytes);
        }
        return n;
    }

    static void Write(TurboScanNode n, StringBuilder sb)
    {
        sb.Append("{\"n\":");
        Str(n.Name, sb);
        sb.Append(",\"s\":").Append(n.Size);
        if (n.IsFile)
        {
            sb.Append(",\"t\":1}");
            return;
        }
        sb.Append(",\"f\":").Append(n.Files);
        if (n.Other > 0) sb.Append(",\"o\":").Append(n.Other);
        if (n.Errors > 0) sb.Append(",\"e\":").Append(n.Errors);
        if (n.Kids.Count > 0)
        {
            sb.Append(",\"k\":[");
            for (int i = 0; i < n.Kids.Count; i++)
            {
                if (i > 0) sb.Append(',');
                Write(n.Kids[i], sb);
            }
            sb.Append(']');
        }
        sb.Append('}');
    }

    static void Str(string s, StringBuilder sb)
    {
        sb.Append('"');
        foreach (char ch in s)
        {
            if (ch == '"') sb.Append("\\\"");
            else if (ch == '\\') sb.Append("\\\\");
            else if (ch < 0x20) sb.Append("\\u").Append(((int)ch).ToString("x4"));
            else sb.Append(ch);
        }
        sb.Append('"');
    }
}
