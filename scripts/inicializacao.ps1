# ============================================================================
#  Liga (ou desliga) o servidor para subir sozinho junto com o Windows.
#
#  Uso, no PowerShell, dentro da pasta do projeto:
#     .\scripts\inicializacao.ps1 -Acao status     (padrao: so mostra a situacao)
#     .\scripts\inicializacao.ps1 -Acao instalar    (liga o start automatico)
#     .\scripts\inicializacao.ps1 -Acao remover     (desliga e limpa tudo)
#
#  O que "instalar" faz:
#    1) cria uma Tarefa Agendada que, no seu login, sobe o servidor sem janela
#       (isso NAO precisa de administrador - e uma tarefa sua)
#    2) cria uma regra de firewall liberando a porta so na rede Privada
#       (isso PRECISA de administrador)
#
#  Para desfazer, rode com -Acao remover. Nada fica escondido: a tarefa aparece
#  no "Agendador de Tarefas" do Windows com o nome abaixo.
# ============================================================================

param(
  [ValidateSet("status", "instalar", "remover")]
  [string]$Acao = "status"
)

$ErrorActionPreference = "Stop"

$NomeTarefa = "NossasFinancas-Servidor"
$NomeRegra  = "Nossas Financas (HTTPS)"
$Porta      = if ($env:HTTPS_PORT) { [int]$env:HTTPS_PORT } else { 3443 }

# Caminhos, derivados da localizacao deste script (raiz = uma pasta acima).
$Raiz = Split-Path -Parent $PSScriptRoot
$Vbs  = Join-Path $PSScriptRoot "win\iniciar-oculto.vbs"

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p  = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Show-Status {
  Write-Host ""
  Write-Host "Situacao atual:" -ForegroundColor Cyan

  $tarefa = Get-ScheduledTask -TaskName $NomeTarefa -ErrorAction SilentlyContinue
  if ($tarefa) {
    $info = Get-ScheduledTaskInfo -TaskName $NomeTarefa -ErrorAction SilentlyContinue
    Write-Host "  Tarefa agendada : EXISTE (estado: $($tarefa.State))"
    if ($info) { Write-Host "                    ultima execucao: $($info.LastRunTime)" }
  } else {
    Write-Host "  Tarefa agendada : nao instalada"
  }

  $regra = Get-NetFirewallRule -DisplayName $NomeRegra -ErrorAction SilentlyContinue
  if ($regra) {
    Write-Host "  Regra firewall  : EXISTE (porta $Porta)"
  } else {
    Write-Host "  Regra firewall  : nao instalada"
  }

  # Avisa se a rede atual esta como Publica - ai a regra Privada nao vale e os
  # celulares nao alcancam o PC.
  $perfis = Get-NetConnectionProfile -ErrorAction SilentlyContinue
  foreach ($perfil in $perfis) {
    if ($perfil.NetworkCategory -eq "Public") {
      Write-Host ""
      Write-Host "  ATENCAO: a rede '$($perfil.Name)' esta classificada como Publica." -ForegroundColor Yellow
      Write-Host "           Enquanto estiver assim, os celulares nao conseguem acessar."
      Write-Host "           Mude para Particular em: Configuracoes > Rede e Internet >"
      Write-Host "           Wi-Fi > (sua rede) > Tipo de perfil de rede > Particular."
    }
  }
  Write-Host ""
}

function Do-Instalar {
  if (-not (Test-Path $Vbs)) {
    throw "Nao encontrei $Vbs. Rode este script de dentro da pasta do projeto."
  }

  Write-Host "Criando a tarefa agendada (sobe o servidor no seu login)..." -ForegroundColor Cyan

  $acaoTarefa = New-ScheduledTaskAction -Execute "wscript.exe" -Argument ('"' + $Vbs + '"') -WorkingDirectory $Raiz
  $gatilho    = New-ScheduledTaskTrigger -AtLogOn -User ("$env:USERDOMAIN\$env:USERNAME")
  $principal  = New-ScheduledTaskPrincipal -UserId ("$env:USERDOMAIN\$env:USERNAME") -LogonType Interactive -RunLevel Limited

  $config = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  # PT0S = sem limite de tempo de execucao (o servidor roda o dia todo).
  $config.ExecutionTimeLimit = "PT0S"

  Register-ScheduledTask -TaskName $NomeTarefa -Action $acaoTarefa -Trigger $gatilho -Principal $principal -Settings $config -Description "Sobe o app Nossas Financas por HTTPS no login." -Force | Out-Null
  Write-Host "  Tarefa criada: $NomeTarefa" -ForegroundColor Green

  Write-Host "Criando a regra de firewall (porta $Porta, so na rede Particular)..." -ForegroundColor Cyan
  if (-not (Test-Admin)) {
    Write-Host ""
    Write-Host "  A regra de firewall precisa de administrador e este PowerShell nao esta elevado." -ForegroundColor Yellow
    Write-Host "  A tarefa ja foi criada. Para liberar a porta, abra o PowerShell como"
    Write-Host "  administrador e rode:"
    Write-Host ""
    Write-Host "    New-NetFirewallRule -DisplayName `"$NomeRegra`" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Porta -Profile Private" -ForegroundColor White
    Write-Host ""
  } else {
    $existente = Get-NetFirewallRule -DisplayName $NomeRegra -ErrorAction SilentlyContinue
    if ($existente) { Remove-NetFirewallRule -DisplayName $NomeRegra -ErrorAction SilentlyContinue }
    New-NetFirewallRule -DisplayName $NomeRegra -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Porta -Profile Private | Out-Null
    Write-Host "  Regra criada." -ForegroundColor Green
  }

  Write-Host ""
  Write-Host "Pronto. Para iniciar agora sem reiniciar o PC:" -ForegroundColor Cyan
  Write-Host "  Start-ScheduledTask -TaskName $NomeTarefa"
  Show-Status
}

function Do-Remover {
  Write-Host "Removendo o start automatico..." -ForegroundColor Cyan

  $tarefa = Get-ScheduledTask -TaskName $NomeTarefa -ErrorAction SilentlyContinue
  if ($tarefa) {
    Stop-ScheduledTask -TaskName $NomeTarefa -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $NomeTarefa -Confirm:$false
    Write-Host "  Tarefa removida." -ForegroundColor Green
  } else {
    Write-Host "  Tarefa ja nao existia."
  }

  $regra = Get-NetFirewallRule -DisplayName $NomeRegra -ErrorAction SilentlyContinue
  if ($regra) {
    if (-not (Test-Admin)) {
      Write-Host "  A regra de firewall existe mas remover precisa de administrador." -ForegroundColor Yellow
      Write-Host "  Rode como admin:  Remove-NetFirewallRule -DisplayName `"$NomeRegra`""
    } else {
      Remove-NetFirewallRule -DisplayName $NomeRegra
      Write-Host "  Regra de firewall removida." -ForegroundColor Green
    }
  } else {
    Write-Host "  Regra de firewall ja nao existia."
  }
  Write-Host ""
}

switch ($Acao) {
  "instalar" { Do-Instalar }
  "remover"  { Do-Remover }
  default     { Show-Status }
}
