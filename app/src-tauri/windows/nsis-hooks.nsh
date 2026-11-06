!macro NSIS_HOOK_PREINSTALL
  RMDir /r "$INSTDIR\python"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  RMDir /r "$INSTDIR\python"
  RMDir "$INSTDIR"
!macroend
