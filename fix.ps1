param()
$c = Get-Content "C:\Kilocode\catalogo1\src\app\s\[store]\page.tsx" -Raw
if ($c -notmatch "export const dynamic") {
  $new = "export const dynamic = 'force-dynamic';`r`n" + $c
  Set-Content "C:\Kilocode\catalogo1\src\app\s\[store]\page.tsx" -Value $new
  Write-Host "added"
} else {
  Write-Host "exists"
}
