@echo off
rem ============================================================================
rem  Supervisor do servidor. E isto que a tarefa agendada roda no logon.
rem  O que ele faz, de forma bem direta:
rem    1) vai para a pasta do projeto
rem    2) descobre onde esta o node (sem depender do PATH da tarefa agendada)
rem    3) sobe o servidor HTTPS e, se ele cair, reergue em 5 segundos
rem    4) guarda um log em %LOCALAPPDATA%\nossas-financas\servidor.log
rem
rem  Nao ha nada escondido aqui: e um laco simples que reinicia o servidor.
rem ============================================================================
setlocal enableextensions

rem Este arquivo fica em scripts\win\ ; sobe dois niveis ate a raiz do projeto.
cd /d "%~dp0..\.."

set "LOGDIR=%LOCALAPPDATA%\nossas-financas"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
set "LOG=%LOGDIR%\servidor.log"

rem Descobre o node. Ordem: Program Files, depois o nvm4w, depois o PATH.
set "NODE_EXE="
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "C:\nvm4w\nodejs\node.exe" set "NODE_EXE=C:\nvm4w\nodejs\node.exe"
if not defined NODE_EXE for %%I in (node.exe) do if not "%%~$PATH:I"=="" set "NODE_EXE=%%~$PATH:I"

if not defined NODE_EXE (
  echo [%date% %time%] node.exe nao encontrado. Instale o Node 22+ e tente de novo.>> "%LOG%"
  exit /b 1
)

:loop
echo [%date% %time%] iniciando servidor com "%NODE_EXE%">> "%LOG%"
"%NODE_EXE%" scripts\servidor-https.mjs >> "%LOG%" 2>&1
echo [%date% %time%] servidor encerrou (codigo %errorlevel%). Reiniciando em 5s...>> "%LOG%"
timeout /t 5 /nobreak > nul
goto loop
