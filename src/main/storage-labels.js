'use strict';

const TEXT = {
  fr: {
    title: 'Sauvegarde et clés API',
    persistent: 'La clé sera chiffrée avec le trousseau sécurisé du système.',
    session: 'Sans trousseau sécurisé disponible, la clé reste uniquement en mémoire jusqu’à la fermeture de Capri. Déverrouille KWallet ou le trousseau GNOME, ou utilise une variable d’environnement pour les prochains lancements.',
    locked: 'Une clé enregistrée est inaccessible. Déverrouille le trousseau d’origine ou saisis de nouveau la clé.',
    recovered: 'Les réglages ont été récupérés depuis la sauvegarde. Le fichier endommagé a été conservé. Les clés API doivent être saisies de nouveau.',
    reset: 'Les réglages étaient endommagés. Le fichier original a été conservé et Capri utilise les valeurs par défaut.',
    failed: 'Impossible d’enregistrer les données. Les changements concernés n’ont pas été sauvegardés. Vérifie les permissions et l’espace disque, puis réessaie.',
    blocked: 'Les données enregistrées sont illisibles ou leur version n’est pas prise en charge. Capri les préserve sans les remplacer.',
    providerFailed: 'Le service n’a pas pu être validé. Vérifie la clé, l’adresse du service et la connexion.',
  },
  en: {
    title: 'Saved settings and API keys',
    persistent: 'The key will be encrypted using the system secure keyring.',
    session: 'Without a secure keyring, the key stays only in memory until Capri closes. Unlock KWallet or the GNOME keyring, or use an environment variable for future launches.',
    locked: 'A stored key is unavailable. Unlock its original keyring or enter the key again.',
    recovered: 'Settings were recovered from the backup. The damaged file was preserved. API keys need to be entered again.',
    reset: 'Settings were damaged. The original file was preserved and Capri is using defaults.',
    failed: 'The data could not be saved. The affected changes were not saved. Check permissions and free disk space, then try again.',
    blocked: 'Saved data cannot be read or its version is unsupported. Capri preserves it without overwriting it.',
    providerFailed: 'The service could not be validated. Check the key, service address and connection.',
  },
  es: {
    title: 'Ajustes guardados y claves API', persistent: 'La clave se cifrará con el llavero seguro del sistema.',
    session: 'Sin llavero seguro, la clave solo permanece en memoria hasta cerrar Capri. Desbloquea KWallet o el llavero GNOME, o usa una variable de entorno para futuros inicios.',
    locked: 'Una clave guardada no está disponible. Desbloquea su llavero original o introduce la clave de nuevo.',
    recovered: 'Se recuperaron los ajustes desde la copia de seguridad. Se conservó el archivo dañado. Vuelve a introducir las claves API.',
    reset: 'Los ajustes estaban dañados. Se conservó el original y Capri usa los valores predeterminados.',
    failed: 'No se pudieron guardar los datos ni los cambios afectados. Revisa los permisos y el espacio libre e inténtalo de nuevo.',
    blocked: 'Los datos guardados no se pueden leer o su versión no es compatible. Capri los conserva sin reemplazarlos.',
    providerFailed: 'No se pudo validar el servicio. Revisa la clave, la dirección y la conexión.',
  },
  pt: {
    title: 'Configurações salvas e chaves de API', persistent: 'A chave será criptografada com o chaveiro seguro do sistema.',
    session: 'Sem chaveiro seguro, a chave fica apenas na memória até Capri fechar. Desbloqueie KWallet ou o chaveiro GNOME, ou use uma variável de ambiente nos próximos inícios.',
    locked: 'Uma chave salva está inacessível. Desbloqueie o chaveiro original ou digite a chave novamente.',
    recovered: 'As configurações foram recuperadas do backup. O arquivo danificado foi preservado. Digite as chaves de API novamente.',
    reset: 'As configurações estavam danificadas. O original foi preservado e Capri usa os padrões.',
    failed: 'Não foi possível salvar os dados nem as alterações afetadas. Confira as permissões e o espaço livre e tente novamente.',
    blocked: 'Os dados salvos estão ilegíveis ou a versão não é compatível. Capri os preserva sem substituir.',
    providerFailed: 'Não foi possível validar o serviço. Confira a chave, o endereço e a conexão.',
  },
  ru: {
    title: 'Сохранение настроек и ключей API', persistent: 'Ключ будет зашифрован с помощью защищённого хранилища системы.',
    session: 'Без защищённого хранилища ключ остаётся только в памяти до закрытия Capri. Разблокируй KWallet или хранилище GNOME либо используй переменную окружения для следующих запусков.',
    locked: 'Сохранённый ключ недоступен. Разблокируй исходное хранилище или введи ключ заново.',
    recovered: 'Настройки восстановлены из резервной копии. Повреждённый файл сохранён. Ключи API нужно ввести заново.',
    reset: 'Настройки повреждены. Исходный файл сохранён, Capri использует настройки по умолчанию.',
    failed: 'Не удалось сохранить данные и изменения. Проверь права и свободное место, затем повтори попытку.',
    blocked: 'Сохранённые данные не читаются или их версия не поддерживается. Capri сохраняет их без перезаписи.',
    providerFailed: 'Не удалось проверить сервис. Проверь ключ, адрес и соединение.',
  },
};

Object.assign(TEXT.fr, { memoryRecovered: 'La mémoire des conversations a été récupérée depuis la sauvegarde. Le fichier endommagé a été conservé.',
  memoryReset: 'La mémoire enregistrée était endommagée. Le fichier original a été conservé et Capri repart sans cet historique.' });
Object.assign(TEXT.en, { memoryRecovered: 'Conversation memory was recovered from backup. The damaged file was preserved.',
  memoryReset: 'Saved conversation memory was damaged. The original file was preserved and Capri is starting without that history.' });
Object.assign(TEXT.es, { memoryRecovered: 'Se recuperó el historial de conversaciones desde la copia de seguridad. Se conservó el archivo dañado.',
  memoryReset: 'El historial estaba dañado. Se conservó el original y Capri continúa sin ese historial.' });
Object.assign(TEXT.pt, { memoryRecovered: 'O histórico de conversas foi recuperado do backup. O arquivo danificado foi preservado.',
  memoryReset: 'O histórico estava danificado. O original foi preservado e Capri continua sem esse histórico.' });
Object.assign(TEXT.ru, { memoryRecovered: 'История разговоров восстановлена из резервной копии. Повреждённый файл сохранён.',
  memoryReset: 'История разговоров повреждена. Исходный файл сохранён, Capri продолжает без этой истории.' });

module.exports = { storageText: (lang) => TEXT[lang] || TEXT.en };
