'use strict';
const languages=['fr','en','es','de','ja','pt-BR','zh-CN'];
const rows=`
title|Moteur local ALM|ALM local engine|Motor local ALM|Lokale ALM-Engine|ALMローカルエンジン|Motor local ALM|ALM本地引擎
stopped|Le moteur local s’est arrêté.|The local engine stopped.|El motor local se ha detenido.|Die lokale Engine wurde beendet.|ローカルエンジンが停止しました。|O motor local parou.|本地引擎已停止。
unresponsive|Le moteur local ne répond plus.|The local engine is not responding.|El motor local no responde.|Die lokale Engine reagiert nicht.|ローカルエンジンが応答していません。|O motor local não está respondendo.|本地引擎无响应。
failed|Le redémarrage du moteur a échoué.|The engine could not restart.|No se pudo reiniciar el motor.|Die Engine konnte nicht neu gestartet werden.|エンジンを再起動できませんでした。|Não foi possível reiniciar o motor.|无法重启引擎。
notice|Les opérations interrompues ne seront pas relancées automatiquement. Au redémarrage, ALM rechargera les données déjà enregistrées.|Interrupted operations will not be retried automatically. On restart, ALM reloads previously saved data.|Las operaciones interrumpidas no se repetirán automáticamente. Al reiniciar, ALM cargará los datos guardados.|Unterbrochene Vorgänge werden nicht automatisch wiederholt. Nach dem Neustart lädt ALM gespeicherte Daten.|中断した処理は自動で再実行されません。再起動時に保存済みデータを読み込みます。|Operações interrompidas não serão repetidas automaticamente. Ao reiniciar, o ALM carrega os dados salvos.|中断的操作不会自动重试，重启后ALM将重新加载已保存的数据。
limit|La limite de deux tentatives rapprochées est atteinte. Consulte le diagnostic ou ferme puis relance ALM.|Two restart attempts were made recently. Check the diagnostic or close and reopen ALM.|Se alcanzaron dos intentos recientes. Revisa el diagnóstico o cierra y abre ALM.|Zwei Neustartversuche wurden kürzlich ausgeführt. Prüfe die Diagnose oder starte ALM neu.|短時間に2回の再起動を試みました。診断を確認するか、ALMを終了して開き直してください。|Foram feitas duas tentativas recentes. Veja o diagnóstico ou feche e reabra o ALM.|短时间内已尝试重启两次，请查看诊断或关闭后重新打开ALM。
restart|Redémarrer le moteur|Restart engine|Reiniciar motor|Engine neu starten|エンジンを再起動|Reiniciar motor|重启引擎
wait|Continuer à attendre|Keep waiting|Seguir esperando|Weiter warten|待機を続ける|Continuar aguardando|继续等待
diagnostic|Voir le diagnostic|View diagnostic|Ver diagnóstico|Diagnose anzeigen|診断を表示|Ver diagnóstico|查看诊断
close|Fermer ALM|Close ALM|Cerrar ALM|ALM schließen|ALMを終了|Fechar ALM|关闭ALM
back|Retour|Back|Volver|Zurück|戻る|Voltar|返回
`.trim().split('\n').map(row=>row.split('|'));
function copy(language){const index=Math.max(0,languages.indexOf(language));return Object.fromEntries(rows.map(row=>[row[0],row[index+1]]));}
module.exports={copy,languages};
