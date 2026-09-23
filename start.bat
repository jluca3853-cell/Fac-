@echo off
title Bot de Faccao
if not exist node_modules (
  echo Instalando dependencias...
  npm install
)
echo Iniciando bot...
npm start
pause
