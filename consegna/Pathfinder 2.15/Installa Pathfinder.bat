@echo off
rem  Pathfinder - installazione a doppio clic
rem  (C) Andrea Sacchetti - Dietopack S.r.l. (Naturacare Group)
rem
rem  Questo file esiste solo per far partire installa.ps1 con un doppio clic:
rem  Windows non esegue uno script PowerShell in quel modo, e su una macchina
rem  nuova la politica di esecuzione lo bloccherebbe comunque. -ExecutionPolicy
rem  Bypass vale per QUESTA esecuzione e non cambia niente sulla macchina.
rem
rem  Niente caratteri accentati qui dentro: il prompt dei comandi usa una
rem  tabella di caratteri sua, e li mostrerebbe storti.

title Pathfinder - installazione
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0installa.ps1"

echo.
pause
