; Standard LCIDs avoid depending on the template's language-include order.
LangString ALMTaskRemovalFailed 1033 "ALM could not remove its scheduled maintenance task. Close ALM and retry. Uninstallation will stop if you cancel; other applications' tasks will not be removed."
LangString ALMTaskRemovalFailed 1036 "ALM n’a pas pu retirer sa tâche de maintenance. Ferme ALM et réessaie. Annuler arrête la désinstallation ; les tâches des autres applications sont conservées."
LangString ALMTaskRemovalFailed 3082 "ALM no pudo eliminar su tarea de mantenimiento. Cierra ALM y reintenta. Cancelar detiene la desinstalación; se conservan las tareas de otras aplicaciones."
LangString ALMTaskRemovalFailed 1031 "ALM konnte seine Wartungsaufgabe nicht entfernen. Schließe ALM und versuche es erneut. Abbrechen stoppt die Deinstallation; Aufgaben anderer Anwendungen bleiben erhalten."
LangString ALMTaskRemovalFailed 1041 "ALMの保守タスクを削除できませんでした。ALMを閉じて再試行してください。キャンセルするとアンインストールを中止します。他のアプリのタスクは削除しません。"
LangString ALMTaskRemovalFailed 1046 "ALM não pôde remover sua tarefa de manutenção. Feche o ALM e tente novamente. Cancelar interrompe a desinstalação; tarefas de outros aplicativos são preservadas."
LangString ALMTaskRemovalFailed 2052 "无法删除ALM的维护任务。请关闭ALM后重试。取消将停止卸载，其他应用的任务会保留。"

!macro customUnInstall
  Push $0
  Push $1
almTaskRemovalRetry:
  ; Remove this user's maintenance task before the installed executable disappears.
  nsExec::ExecToStack /TIMEOUT=30000 '"$INSTDIR\Anime Local Manager.exe" --remove-maintenance'
  Pop $0
  Pop $1
  StrCmp $0 "0" almTaskRemovalDone
  IfSilent almTaskRemovalAbort 0
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "$(ALMTaskRemovalFailed)" IDRETRY almTaskRemovalRetry
almTaskRemovalAbort:
  Pop $1
  Pop $0
  SetErrorLevel 1
  Abort
almTaskRemovalDone:
  Pop $1
  Pop $0
!macroend
