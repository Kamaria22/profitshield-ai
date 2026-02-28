/**
 * Static translation dictionary for common UI strings.
 * Enables instant (no-API) translations for the most used text.
 * Keys are English strings, values are translations per language code.
 */

const translations = {
  // Navigation
  'Dashboard': { es: 'Panel', fr: 'Tableau de bord', de: 'Dashboard', it: 'Dashboard', pt: 'Painel', nl: 'Dashboard', zh: '仪表板', ja: 'ダッシュボード', ko: '대시보드', ar: 'لوحة القيادة', ru: 'Панель', hi: 'डैशबोर्ड', pl: 'Panel', tr: 'Panel' },
  'Orders': { es: 'Pedidos', fr: 'Commandes', de: 'Bestellungen', it: 'Ordini', pt: 'Pedidos', nl: 'Bestellingen', zh: '订单', ja: '注文', ko: '주문', ar: 'الطلبات', ru: 'Заказы', hi: 'ऑर्डर', pl: 'Zamówienia', tr: 'Siparişler' },
  'Products': { es: 'Productos', fr: 'Produits', de: 'Produkte', it: 'Prodotti', pt: 'Produtos', nl: 'Producten', zh: '产品', ja: '製品', ko: '제품', ar: 'المنتجات', ru: 'Продукты', hi: 'उत्पाद', pl: 'Produkty', tr: 'Ürünler' },
  'Customers': { es: 'Clientes', fr: 'Clients', de: 'Kunden', it: 'Clienti', pt: 'Clientes', nl: 'Klanten', zh: '客户', ja: '顧客', ko: '고객', ar: 'العملاء', ru: 'Клиенты', hi: 'ग्राहक', pl: 'Klienci', tr: 'Müşteriler' },
  'Settings': { es: 'Configuración', fr: 'Paramètres', de: 'Einstellungen', it: 'Impostazioni', pt: 'Configurações', nl: 'Instellingen', zh: '设置', ja: '設定', ko: '설정', ar: 'الإعدادات', ru: 'Настройки', hi: 'सेटिंग्स', pl: 'Ustawienia', tr: 'Ayarlar' },
  'Alerts': { es: 'Alertas', fr: 'Alertes', de: 'Alarme', it: 'Avvisi', pt: 'Alertas', nl: 'Meldingen', zh: '警报', ja: 'アラート', ko: '알림', ar: 'التنبيهات', ru: 'Оповещения', hi: 'अलर्ट', pl: 'Alerty', tr: 'Uyarılar' },
  'Sign out': { es: 'Cerrar sesión', fr: 'Se déconnecter', de: 'Abmelden', it: 'Disconnettersi', pt: 'Sair', nl: 'Uitloggen', zh: '退出', ja: 'サインアウト', ko: '로그아웃', ar: 'تسجيل الخروج', ru: 'Выйти', hi: 'साइन आउट', pl: 'Wyloguj', tr: 'Çıkış yap' },
  'Loading...': { es: 'Cargando...', fr: 'Chargement...', de: 'Laden...', it: 'Caricamento...', pt: 'Carregando...', nl: 'Laden...', zh: '加载中...', ja: '読み込み中...', ko: '로딩 중...', ar: 'جاري التحميل...', ru: 'Загрузка...', hi: 'लोड हो रहा है...', pl: 'Ładowanie...', tr: 'Yükleniyor...' },

  // Common actions
  'Save': { es: 'Guardar', fr: 'Enregistrer', de: 'Speichern', it: 'Salva', pt: 'Salvar', nl: 'Opslaan', zh: '保存', ja: '保存', ko: '저장', ar: 'حفظ', ru: 'Сохранить', hi: 'सहेजें', pl: 'Zapisz', tr: 'Kaydet' },
  'Cancel': { es: 'Cancelar', fr: 'Annuler', de: 'Abbrechen', it: 'Annulla', pt: 'Cancelar', nl: 'Annuleren', zh: '取消', ja: 'キャンセル', ko: '취소', ar: 'إلغاء', ru: 'Отмена', hi: 'रद्द करें', pl: 'Anuluj', tr: 'İptal' },
  'Delete': { es: 'Eliminar', fr: 'Supprimer', de: 'Löschen', it: 'Elimina', pt: 'Excluir', nl: 'Verwijderen', zh: '删除', ja: '削除', ko: '삭제', ar: 'حذف', ru: 'Удалить', hi: 'हटाएं', pl: 'Usuń', tr: 'Sil' },
  'Edit': { es: 'Editar', fr: 'Modifier', de: 'Bearbeiten', it: 'Modifica', pt: 'Editar', nl: 'Bewerken', zh: '编辑', ja: '編集', ko: '편집', ar: 'تحرير', ru: 'Редактировать', hi: 'संपादित करें', pl: 'Edytuj', tr: 'Düzenle' },
  'Search': { es: 'Buscar', fr: 'Rechercher', de: 'Suchen', it: 'Cerca', pt: 'Pesquisar', nl: 'Zoeken', zh: '搜索', ja: '検索', ko: '검색', ar: 'بحث', ru: 'Поиск', hi: 'खोजें', pl: 'Szukaj', tr: 'Ara' },
  'Filter': { es: 'Filtrar', fr: 'Filtrer', de: 'Filtern', it: 'Filtra', pt: 'Filtrar', nl: 'Filteren', zh: '过滤', ja: 'フィルター', ko: '필터', ar: 'تصفية', ru: 'Фильтр', hi: 'फ़िल्टर', pl: 'Filtruj', tr: 'Filtrele' },
  'Export': { es: 'Exportar', fr: 'Exporter', de: 'Exportieren', it: 'Esporta', pt: 'Exportar', nl: 'Exporteren', zh: '导出', ja: 'エクスポート', ko: '내보내기', ar: 'تصدير', ru: 'Экспорт', hi: 'निर्यात', pl: 'Eksportuj', tr: 'Dışa aktar' },
  'Refresh': { es: 'Actualizar', fr: 'Actualiser', de: 'Aktualisieren', it: 'Aggiorna', pt: 'Atualizar', nl: 'Vernieuwen', zh: '刷新', ja: '更新', ko: '새로고침', ar: 'تحديث', ru: 'Обновить', hi: 'रीफ्रेश', pl: 'Odśwież', tr: 'Yenile' },

  // Status
  'Active': { es: 'Activo', fr: 'Actif', de: 'Aktiv', it: 'Attivo', pt: 'Ativo', nl: 'Actief', zh: '活跃', ja: 'アクティブ', ko: '활성', ar: 'نشط', ru: 'Активный', hi: 'सक्रिय', pl: 'Aktywny', tr: 'Aktif' },
  'Inactive': { es: 'Inactivo', fr: 'Inactif', de: 'Inaktiv', it: 'Inattivo', pt: 'Inativo', nl: 'Inactief', zh: '非活跃', ja: '非アクティブ', ko: '비활성', ar: 'غير نشط', ru: 'Неактивный', hi: 'निष्क्रिय', pl: 'Nieaktywny', tr: 'Pasif' },
  'Pending': { es: 'Pendiente', fr: 'En attente', de: 'Ausstehend', it: 'In sospeso', pt: 'Pendente', nl: 'In behandeling', zh: '待处理', ja: '保留中', ko: '보류 중', ar: 'معلق', ru: 'Ожидание', hi: 'लंबित', pl: 'Oczekujące', tr: 'Beklemede' },
  'Completed': { es: 'Completado', fr: 'Terminé', de: 'Abgeschlossen', it: 'Completato', pt: 'Concluído', nl: 'Voltooid', zh: '已完成', ja: '完了', ko: '완료', ar: 'مكتمل', ru: 'Завершено', hi: 'पूर्ण', pl: 'Ukończono', tr: 'Tamamlandı' },
  'Failed': { es: 'Fallido', fr: 'Échoué', de: 'Fehlgeschlagen', it: 'Fallito', pt: 'Falhou', nl: 'Mislukt', zh: '失败', ja: '失敗', ko: '실패', ar: 'فشل', ru: 'Ошибка', hi: 'विफल', pl: 'Nieudane', tr: 'Başarısız' },
  'High': { es: 'Alto', fr: 'Élevé', de: 'Hoch', it: 'Alto', pt: 'Alto', nl: 'Hoog', zh: '高', ja: '高', ko: '높음', ar: 'عالي', ru: 'Высокий', hi: 'उच्च', pl: 'Wysoki', tr: 'Yüksek' },
  'Medium': { es: 'Medio', fr: 'Moyen', de: 'Mittel', it: 'Medio', pt: 'Médio', nl: 'Gemiddeld', zh: '中', ja: '中', ko: '중간', ar: 'متوسط', ru: 'Средний', hi: 'मध्यम', pl: 'Średni', tr: 'Orta' },
  'Low': { es: 'Bajo', fr: 'Faible', de: 'Niedrig', it: 'Basso', pt: 'Baixo', nl: 'Laag', zh: '低', ja: '低', ko: '낮음', ar: 'منخفض', ru: 'Низкий', hi: 'कम', pl: 'Niski', tr: 'Düşük' },
  'Critical': { es: 'Crítico', fr: 'Critique', de: 'Kritisch', it: 'Critico', pt: 'Crítico', nl: 'Kritiek', zh: '严重', ja: 'クリティカル', ko: '위험', ar: 'حرج', ru: 'Критический', hi: 'गंभीर', pl: 'Krytyczny', tr: 'Kritik' },

  // Risk
  'Risk Score': { es: 'Puntuación de riesgo', fr: 'Score de risque', de: 'Risiko-Score', it: 'Punteggio di rischio', pt: 'Pontuação de risco', nl: 'Risicoscore', zh: '风险评分', ja: 'リスクスコア', ko: '위험 점수', ar: 'درجة المخاطر', ru: 'Оценка риска', hi: 'जोखिम स्कोर', pl: 'Wynik ryzyka', tr: 'Risk Puanı' },
  'Fraud Detection': { es: 'Detección de fraude', fr: 'Détection de fraude', de: 'Betrugserkennung', it: 'Rilevamento frode', pt: 'Detecção de fraude', nl: 'Fraudedetectie', zh: '欺诈检测', ja: '不正検知', ko: '사기 감지', ar: 'كشف الاحتيال', ru: 'Обнаружение мошенничества', hi: 'धोखाधड़ी पहचान', pl: 'Wykrywanie oszustw', tr: 'Dolandırıcılık Tespiti' },
  'Connect Store': { es: 'Conectar tienda', fr: 'Connecter la boutique', de: 'Shop verbinden', it: 'Connetti negozio', pt: 'Conectar loja', nl: 'Winkel verbinden', zh: '连接商店', ja: 'ストアを接続', ko: '스토어 연결', ar: 'توصيل المتجر', ru: 'Подключить магазин', hi: 'स्टोर कनेक्ट करें', pl: 'Połącz sklep', tr: 'Mağaza Bağla' },
  'No store selected': { es: 'Ninguna tienda seleccionada', fr: 'Aucune boutique sélectionnée', de: 'Kein Shop ausgewählt', it: 'Nessun negozio selezionato', pt: 'Nenhuma loja selecionada', nl: 'Geen winkel geselecteerd', zh: '未选择商店', ja: 'ストアが選択されていません', ko: '선택된 스토어 없음', ar: 'لم يتم اختيار متجر', ru: 'Магазин не выбран', hi: 'कोई स्टोर नहीं चुना', pl: 'Nie wybrano sklepu', tr: 'Mağaza seçilmedi' },
};

/**
 * Synchronously translate a string using the static dictionary.
 * Falls back to original text if no translation found.
 */
export function staticTranslate(text, lang) {
  if (!text || lang === 'en') return text;
  return translations[text]?.[lang] || text;
}

export default translations;