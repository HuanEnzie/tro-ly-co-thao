# Mở .docx bằng Word (COM, ẩn, chỉ đọc) và in ra JSON: với mỗi đoạn nằm trong các ô thuộc cột cần xem,
# đưa ra bảng/hàng/cột/thứ tự đoạn trong ô, trang + vị trí dọc (điểm) của dòng ĐẦU và dòng CUỐI, số dòng đầu/cuối.
#   powershell -NoProfile -File scripts/word-lines.ps1 -Docx <file.docx> [-Cols 4,5] [-Out <file.json>]
# Vị trí dọc: Range.Information(6) (wdVerticalPositionRelativeToPage); trang: (3);
# số dòng: (10) (wdFirstCharacterLineNumber). Đoạn trải qua 2 trang có thêm "lines" = đầu các dòng (quét từng từ).
# Cột là số cột của Word (1 = Thời gian, 4 = Hoạt động của cô, 5 = Hoạt động của trẻ trong KH ngày). Không chụp màn hình.
# Mặc định đo trên trang cao 22 inch, mỗi hàng bảng (từ hàng 3) bắt đầu một trang mới, để hàng dài không bị cắt qua trang (thêm -RealPages để đo trang thật).
# Dùng C# biên dịch sẵn (Add-Type) gọi Word qua COM.
param([Parameter(Mandatory = $true)][string]$Docx, [string]$Cols = '', [string]$Out = '', [switch]$RealPages)
$ErrorActionPreference = 'Stop'
$path = (Resolve-Path -LiteralPath $Docx).Path
$colsArg = $Cols
$tall = if ($RealPages) { 0 } else { 1 }
Add-Type -ReferencedAssemblies 'Microsoft.CSharp' -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
public static class WordLines {
  static string J(string s) {
    var b = new StringBuilder("\"");
    foreach (char c in s) {
      if (c == (char)34) { b.Append((char)92); b.Append((char)34); }
      else if (c == (char)92) { b.Append((char)92); b.Append((char)92); }
      else if (c < 32) { b.Append((char)92); b.Append("u" + ((int)c).ToString("x4")); }
      else b.Append(c);
    }
    return b.Append('"').ToString();
  }
  static string N(double d) { return d.ToString("0.##", CultureInfo.InvariantCulture); }
  public static string Run(string path, string colsArg, int tall) {
    var want = new HashSet<int>();
    foreach (var c in colsArg.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)) want.Add(int.Parse(c));
    Type wt = Type.GetTypeFromProgID("Word.Application");
    dynamic word = Activator.CreateInstance(wt);
    var sb = new StringBuilder("[");
    bool first = true;
    try {
      word.Visible = false; word.DisplayAlerts = 0;
      dynamic doc = word.Documents.Open(path, false, true, false);
      try { doc.ActiveWindow.View.Type = 3; } catch { }
      // Đo trên trang cao tối đa (22 inch): hàng bảng dài không bị cắt qua trang nên vị trí dọc của hai cột so sánh được
      // (Word báo sai trang/vị trí dọc cho ô bị chia qua nhiều trang). Chỉ đổi trong bộ nhớ, không lưu file.
      if (tall == 1) { foreach (dynamic sec in doc.Sections) { try { sec.PageSetup.PageHeight = 1584; } catch { } } }
      // và mỗi hàng bảng (từ hàng 3) bắt đầu ở đầu một trang mới: vị trí dọc trong hàng đo được liên tục, không bị cắt trang
      if (tall == 1) {
        int nT0 = doc.Tables.Count;
        for (int ti0 = 1; ti0 <= nT0; ti0++) {
          dynamic t0 = doc.Tables[ti0];
          if (t0.NestingLevel > 1) continue;
          dynamic cs = t0.Range.Cells;
          int n0 = cs.Count;
          for (int k = 1; k <= n0; k++) {
            dynamic c0 = cs[k];
            if ((int)c0.ColumnIndex == 1 && (int)c0.RowIndex >= 3) { try { c0.Range.Paragraphs[1].PageBreakBefore = -1; } catch { } }
          }
        }
      }
      doc.Repaginate();
      int nT = doc.Tables.Count;
      for (int ti = 1; ti <= nT; ti++) {
        dynamic t = doc.Tables[ti];
        if (t.NestingLevel > 1) continue;
        dynamic cells = t.Range.Cells;
        int nc = cells.Count;
        for (int ci = 1; ci <= nc; ci++) {
          dynamic cell = cells[ci];
          int col = cell.ColumnIndex, row = cell.RowIndex;
          if (want.Count > 0 && !want.Contains(col)) continue;
          dynamic ps = cell.Range.Paragraphs;
          int n = ps.Count;
          for (int pi = 1; pi <= n; pi++) {
            dynamic r = ps[pi].Range;
            int s = r.Start, e = r.End;
            string txt = r.Text;
            string clean = txt.TrimEnd((char)13, (char)7);
            dynamic r1 = doc.Range(s, s);
            int pg = (int)r1.Information(3);
            double y = (double)r1.Information(6);
            int l0 = (int)r1.Information(10);
            int pg2 = pg, l1 = l0; double y2 = y;
            var lines = new List<string>();
            if (clean.Length > 1) {
              int endc = Math.Max(s, e - 2);
              dynamic r2 = doc.Range(endc, endc);
              pg2 = (int)r2.Information(3); y2 = (double)r2.Information(6); l1 = (int)r2.Information(10);
              if (pg2 != pg) {
                int lastL = l0, lastP = pg; double lastY = y;
                lines.Add("[" + pg + "," + N(y) + "]");
                for (int k = 1; k < clean.Length; k++) {
                  char pc = clean[k - 1];
                  if (pc != ' ' && pc != '-' && pc != (char)0x2013) continue;
                  dynamic rk = doc.Range(s + k, s + k);
                  int pk = (int)rk.Information(3); double yk = (double)rk.Information(6); int lk = (int)rk.Information(10);
                  if (pk != lastP || lk != lastL || Math.Abs(yk - lastY) > 1.0) { lines.Add("[" + pk + "," + N(yk) + "]"); lastP = pk; lastL = lk; lastY = yk; }
                }
              }
            }
            if (!first) sb.Append(','); first = false;
            sb.Append("{\"t\":" + ti + ",\"row\":" + row + ",\"col\":" + col + ",\"p\":" + (pi - 1) + ",\"page\":" + pg + ",\"y\":" + N(y) +
              ",\"pageEnd\":" + pg2 + ",\"yEnd\":" + N(y2) + ",\"l0\":" + l0 + ",\"l1\":" + l1 + ",\"len\":" + clean.Length +
              ",\"text\":" + J(clean.Substring(0, Math.Min(40, clean.Length))) + ",\"lines\":[" + string.Join(",", lines) + "]}");
          }
        }
      }
      doc.Close(false);
    } finally {
      try { word.Quit(); } catch { }
    }
    return sb.Append(']').ToString();
  }
}
'@
$json = [WordLines]::Run($path, $colsArg, $tall)
if ($Out) { [System.IO.File]::WriteAllText($Out, $json, (New-Object System.Text.UTF8Encoding($false))) } else { $json }
