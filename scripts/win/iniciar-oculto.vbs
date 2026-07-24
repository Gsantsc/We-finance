' ============================================================================
'  Lancador silencioso.
'
'  Por que existe: um arquivo .cmd, quando roda, abre uma janela preta de
'  console que ficaria aberta o tempo todo (o servidor roda dentro dela). Este
'  .vbs de duas linhas chama o mesmo .cmd, mas com a janela OCULTA - so para nao
'  ficar uma janela preta no seu login. Nada mais que isso.
'
'  Os dois parametros do .Run:
'    0     = janela oculta (1 seria janela normal)
'    False = nao espera o servidor terminar (ele fica rodando)
' ============================================================================
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run """" & pasta & "\iniciar-servidor.cmd""", 0, False
