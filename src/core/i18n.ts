import { SupportedLanguage } from '../types';

export interface TranslationDictionary {
  appName: string;
  appSubtitle: string;
  tagline: string;
  dashboard: string;
  groups: string;
  createGroup: string;
  newGroup: string;
  noGroupsYet: string;
  totalExpenses: string;
  membersCount: string;
  baseCurrency: string;
  calendarPref: string;
  languagePref: string;
  overallBalance: string;
  netOwed: string;
  netOwes: string;
  allSettled: string;
  activeGroups: string;
  expenses: string;
  settlements: string;
  members: string;
  settings: string;
  addExpense: string;
  editExpense: string;
  deleteExpense: string;
  confirmDeleteExpense: string;
  paidBy: string;
  date: string;
  amount: string;
  currency: string;
  exchangeRate: string;
  splitType: string;
  splitEqual: string;
  splitExact: string;
  splitPercentage: string;
  splitShares: string;
  splitItems: string;
  participants: string;
  selectAll: string;
  clearAll: string;
  saveExpense: string;
  saveChanges: string;
  cancel: string;
  title: string;
  titlePlaceholder: string;
  notes: string;
  settleUp: string;
  recordSettlement: string;
  whoPaid: string;
  whoReceived: string;
  directSettlements: string;
  noSettlementsNeeded: string;
  markAsPaid: string;
  copiedToClipboard: string;
  shareSummary: string;
  copyTextSummary: string;
  calendarAD: string;
  calendarBS: string;
  equalSplitDesc: string;
  exactSplitDesc: string;
  percentageSplitDesc: string;
  sharesSplitDesc: string;
  itemsSplitDesc: string;
  insights: string;
  fieldNotes: string;
  snapReceipt: string;
  unitTestsRunner: string;
  runTests: string;
  allTestsPassed: string;
  testSuiteTitle: string;
  validationMinMembers: string;
  validationSelectPayer: string;
  validationMinParticipants: string;
  validationAmountPositive: string;
  validationTitleRequired: string;
  validationSumMismatch: string;
  validationPercentageMismatch: string;
  debtorOwesCreditor: string; // "{debtor} owes {creditor} {amount}"
  settledLabel: string;
  creditorLabel: string;
  debtorLabel: string;
  memberStatsPaid: string;
  memberStatsShare: string;
  memberStatsNet: string;
  demoDataLoaded: string;
  resetDemoData: string;
  exportJSON: string;
  importJSON: string;
}

export const TRANSLATIONS: Record<SupportedLanguage, TranslationDictionary> = {
  en: {
    appName: 'Splitzy',
    appSubtitle: 'Split & Track Shared Costs',
    tagline: 'Split the bill. Keep the moment.',
    dashboard: 'Dashboard',
    groups: 'Groups',
    createGroup: 'Create Group',
    newGroup: 'New Group',
    noGroupsYet: 'No groups yet. Create your first group to start tracking expenses!',
    totalExpenses: 'Total Group Expenses',
    membersCount: 'Members',
    baseCurrency: 'Base Currency',
    calendarPref: 'Calendar Mode',
    languagePref: 'Language',
    overallBalance: 'Overall Net Balance',
    netOwed: 'You are owed',
    netOwes: 'You owe',
    allSettled: 'All balances settled up!',
    activeGroups: 'Active Groups',
    expenses: 'Expenses',
    settlements: 'Balances & Settle',
    members: 'Members',
    settings: 'Settings',
    addExpense: 'Add Expense',
    editExpense: 'Edit Expense',
    deleteExpense: 'Delete',
    confirmDeleteExpense: 'Are you sure you want to delete this expense?',
    paidBy: 'Paid By',
    date: 'Date',
    amount: 'Amount',
    currency: 'Currency',
    exchangeRate: 'Exchange Rate',
    splitType: 'Split Method',
    splitEqual: 'Split Equally',
    splitExact: 'Exact Amounts',
    splitPercentage: 'By Percentage',
    splitShares: 'By Shares',
    splitItems: 'By Items',
    participants: 'Participants',
    selectAll: 'Select All',
    clearAll: 'Clear All',
    saveExpense: 'Save Expense',
    saveChanges: 'Save Changes',
    cancel: 'Cancel',
    title: 'Expense Title',
    titlePlaceholder: 'e.g. Chez Nico Dinner, Groceries, Wine...',
    notes: 'Optional Notes',
    settleUp: 'Settle Up',
    recordSettlement: 'Record Settlement Payment',
    whoPaid: 'Who paid?',
    whoReceived: 'Paid to whom?',
    directSettlements: 'Optimized Settlement Plan',
    noSettlementsNeeded: 'Everyone is squared away! No outstanding balances.',
    markAsPaid: 'Record as Settled',
    copiedToClipboard: 'Summary copied to clipboard!',
    shareSummary: 'Share Expense',
    copyTextSummary: 'Copy Text Summary',
    calendarAD: 'Gregorian (AD)',
    calendarBS: 'Bikram Sambat (BS)',
    equalSplitDesc: 'One tap, everyone even.',
    exactSplitDesc: 'To the cent, with a live Remaining counter.',
    percentageSplitDesc: 'Custom percentage split summing to 100%.',
    sharesSplitDesc: 'When someone counts double or fractional shares.',
    itemsSplitDesc: 'Assign each line to the right person. Unassigned items are shared automatically.',
    insights: 'Personal Insights',
    fieldNotes: 'Field Notes',
    snapReceipt: 'Scan Receipt',
    unitTestsRunner: 'Calculation Test Suite',
    runTests: 'Run Engine Tests',
    allTestsPassed: 'All core algorithms and edge-case tests passed!',
    testSuiteTitle: 'Algorithm & Precision Verification',
    validationMinMembers: 'At least 2 members are required in the group.',
    validationSelectPayer: 'Please choose who paid for this expense.',
    validationMinParticipants: 'Select at least one participant for this expense.',
    validationAmountPositive: 'Amount must be greater than zero.',
    validationTitleRequired: 'Please provide an expense title.',
    validationSumMismatch: 'The sum of member shares does not match total expense.',
    validationPercentageMismatch: 'Percentage shares must sum to 100%.',
    debtorOwesCreditor: '{debtor} owes {creditor} {amount}',
    settledLabel: 'Settled',
    creditorLabel: 'Gets back',
    debtorLabel: 'Owes',
    memberStatsPaid: 'Total Paid',
    memberStatsShare: 'Total Share',
    memberStatsNet: 'Net Balance',
    demoDataLoaded: 'Demo data loaded successfully!',
    resetDemoData: 'Reset Demo Data',
    exportJSON: 'Export Data (JSON)',
    importJSON: 'Import Data',
  },

  fr: {
    appName: 'Splitzy',
    appSubtitle: 'Partager et suivre les dépenses',
    tagline: 'On sépare la facture. On garde le moment.',
    dashboard: 'Tableau de bord',
    groups: 'Groupes',
    createGroup: 'Créer un groupe',
    newGroup: 'Nouveau groupe',
    noGroupsYet: 'Aucun groupe pour l’instant. Créez votre premier groupe !',
    totalExpenses: 'Dépenses totales',
    membersCount: 'Membres',
    baseCurrency: 'Devise principale',
    calendarPref: 'Calendrier',
    languagePref: 'Langue',
    overallBalance: 'Solde net général',
    netOwed: 'On vous doit',
    netOwes: 'Vous devez',
    allSettled: 'Tous les comptes sont réglés !',
    activeGroups: 'Groupes actifs',
    expenses: 'Dépenses',
    settlements: 'Soldes & Règlements',
    members: 'Membres',
    settings: 'Paramètres',
    addExpense: 'Ajouter une dépense',
    editExpense: 'Modifier la dépense',
    deleteExpense: 'Supprimer',
    confirmDeleteExpense: 'Voulez-vous vraiment supprimer cette dépense ?',
    paidBy: 'Payé par',
    date: 'Date',
    amount: 'Montant',
    currency: 'Devise',
    exchangeRate: 'Taux de change',
    splitType: 'Mode de partage',
    splitEqual: 'Égal',
    splitExact: 'Montants exacts',
    splitPercentage: 'Par pourcentage',
    splitShares: 'Par parts',
    splitItems: 'Par article',
    participants: 'Participants',
    selectAll: 'Tout sélectionner',
    clearAll: 'Tout désélectionner',
    saveExpense: 'Enregistrer la dépense',
    saveChanges: 'Enregistrer les modifications',
    cancel: 'Annuler',
    title: 'Titre de la dépense',
    titlePlaceholder: 'ex. Chez Nico, Épicerie, Vin...',
    notes: 'Notes optionnelles',
    settleUp: 'Régler',
    recordSettlement: 'Enregistrer le règlement',
    whoPaid: 'Qui a payé ?',
    whoReceived: 'Payé à qui ?',
    directSettlements: 'Plan de règlement optimisé',
    noSettlementsNeeded: 'Tout le monde est quitte ! Aucun solde en attente.',
    markAsPaid: 'Marquer comme réglé',
    copiedToClipboard: 'Copié dans le presse-papiers !',
    shareSummary: 'Partager',
    copyTextSummary: 'Copier le résumé',
    calendarAD: 'Grégorien (AD)',
    calendarBS: 'Bikram Sambat (BS)',
    equalSplitDesc: 'Un geste, tout le monde à égalité.',
    exactSplitDesc: 'Au centime près, avec compteur de solde restant en direct.',
    percentageSplitDesc: 'Partage personnalisé en pourcentages totalisant 100%.',
    sharesSplitDesc: 'Quand quelqu’un compte double ou triple.',
    itemsSplitDesc: 'Assignez chaque ligne à la bonne personne. Les lignes non assignées sont partagées automatiquement.',
    insights: 'Aperçus personnels',
    fieldNotes: 'Carnet & Astuces',
    snapReceipt: 'Scanner le reçu',
    unitTestsRunner: 'Suite de tests',
    runTests: 'Lancer les tests',
    allTestsPassed: 'Tous les tests d’algorithme sont réussis !',
    testSuiteTitle: 'Vérification de précision',
    validationMinMembers: 'Au moins 2 membres requis dans le groupe.',
    validationSelectPayer: 'Veuillez choisir qui a payé.',
    validationMinParticipants: 'Sélectionnez au moins un participant.',
    validationAmountPositive: 'Le montant doit être supérieur à zéro.',
    validationTitleRequired: 'Veuillez saisir un titre.',
    validationSumMismatch: 'La somme des parts ne correspond pas au total.',
    validationPercentageMismatch: 'Les pourcentages doivent totaliser 100%.',
    debtorOwesCreditor: '{debtor} doit {amount} à {creditor}',
    settledLabel: 'Réglé',
    creditorLabel: 'Reçoit',
    debtorLabel: 'Doit',
    memberStatsPaid: 'Total payé',
    memberStatsShare: 'Part totale',
    memberStatsNet: 'Solde net',
    demoDataLoaded: 'Données de démonstration chargées !',
    resetDemoData: 'Réinitialiser les données',
    exportJSON: 'Exporter les données (JSON)',
    importJSON: 'Importer des données',
  },

  ne: {
    appName: 'हिसाब साथी',
    appSubtitle: 'समूह खर्च व्यवस्थापक',
    tagline: 'साथीभाइ, कोठाका साथीहरू र यात्राको लागि सरल र पारदर्शी हिसाब किताब।',
    dashboard: 'ड्यासबोर्ड',
    groups: 'समूहहरू',
    createGroup: 'नयाँ समूह बनाउनुहोस्',
    newGroup: 'नयाँ समूह',
    noGroupsYet: 'अहिलेसम्म कुनै समूह छैन। खर्च ट्रयाक गर्न नयाँ समूह सिर्जना गर्नुहोस्!',
    totalExpenses: 'कुल समूह खर्च',
    membersCount: 'सदस्यहरू',
    baseCurrency: 'आधार मुद्रा',
    calendarPref: 'पात्रो / क्यालेन्डर',
    languagePref: 'भाषा',
    overallBalance: 'समग्र खुद मौज्दात',
    netOwed: 'तपाईंले पाउनुपर्ने',
    netOwes: 'तपाईंले तिर्नुपर्ने',
    allSettled: 'सबै हिसाब चुक्ता भयो!',
    activeGroups: 'सक्रिय समूहहरू',
    expenses: 'खर्चहरू',
    settlements: 'हिसाब किताब र चुक्ता',
    members: 'सदस्यहरू',
    settings: 'सेटिङहरू',
    addExpense: 'खर्च थप्नुहोस्',
    editExpense: 'खर्च सम्पादन',
    deleteExpense: 'हटाउनुहोस्',
    confirmDeleteExpense: 'के तपाईं यो खर्च हटाउन निश्चित हुनुहुन्छ?',
    paidBy: 'भुक्तानी गर्ने',
    date: 'मिति',
    amount: 'रकम',
    currency: 'मुद्रा',
    exchangeRate: 'विनिमय दर',
    splitType: 'बाँडफाँड विधि',
    splitEqual: 'बराबर बाँडफाँड',
    splitExact: 'तोकिएको रकम',
    splitPercentage: 'प्रतिशत अनुसार',
    splitShares: 'भाग (गुणांक) अनुसार',
    splitItems: 'प्रत्येक सामान अनुसार',
    participants: 'सहभागीहरू',
    selectAll: 'सबै छान्नुहोस्',
    clearAll: 'सबै हटाउनुहोस्',
    saveExpense: 'खर्च सुरक्षित गर्नुहोस्',
    saveChanges: 'परिवर्तन सुरक्षित गर्नुहोस्',
    cancel: 'रद्द गर्नुहोस्',
    title: 'खर्चको शीर्षक',
    titlePlaceholder: 'जस्तै: होटेल, खाना, ट्याक्सी...',
    notes: 'थप विवरण (ऐच्छिक)',
    settleUp: 'हिसाब चुक्ता गर्नुहोस्',
    recordSettlement: 'भुक्तानी रेकर्ड गर्नुहोस्',
    whoPaid: 'कसले तिर्यो?',
    whoReceived: 'कसलाई तिर्यो?',
    directSettlements: 'न्यूनतम लेनदेन हिसाब विवरण',
    noSettlementsNeeded: 'सबैको हिसाब चुक्ता छ! कुनै बक्यौता बाँकी छैन।',
    markAsPaid: 'चुक्ता भएको दर्ता गर्नुहोस्',
    copiedToClipboard: 'हिसाब विवरण कपी भयो!',
    shareSummary: 'हिसाब सेयर गर्नुहोस्',
    copyTextSummary: 'विवरण कपी गर्नुहोस्',
    calendarAD: 'अंग्रेजी (AD)',
    calendarBS: 'नेपाली बिक्रम संवत् (BS)',
    equalSplitDesc: 'सबैलाई बराबर भाग, पैसा/सेन्टको भिन्नता सुरक्षित समाधान सहित।',
    exactSplitDesc: 'प्रत्येक सदस्यले तिर्नुपर्ने ठ्याक्कै रकम उल्लेख गर्नुहोस्।',
    percentageSplitDesc: 'प्रतिशतको कुल १००% हुनुपर्छ।',
    sharesSplitDesc: 'कोही सदस्यको दोब्बर वा फरक हिस्सा हुँदा।',
    itemsSplitDesc: 'प्रत्येक सामान सम्बन्धित व्यक्तिलाई बाँड्नुहोस्।',
    insights: 'व्यक्तिगत हिसाब विश्लेषण',
    fieldNotes: 'सुझाव र नियमहरू',
    snapReceipt: 'रसिद स्क्यानर',
    unitTestsRunner: 'गणना परीक्षण सुइट',
    runTests: 'परीक्षण चलाउनुहोस्',
    allTestsPassed: 'सबै हिसाब परीक्षण र दशमलव सन्तुलन सफल भयो!',
    testSuiteTitle: 'अल्गोरिदम तथा शुद्धता प्रमाणीकरण',
    validationMinMembers: 'समूहमा कम्तीमा २ जना सदस्य हुनुपर्छ।',
    validationSelectPayer: 'कृपया खर्च तिर्ने व्यक्ति चयन गर्नुहोस्।',
    validationMinParticipants: 'कम्तीमा एक सहभागी चयन गर्नुहोस्।',
    validationAmountPositive: 'रकम शून्यभन्दा बढी हुनुपर्छ।',
    validationTitleRequired: 'कृपया खर्चको शीर्षक लेख्नुहोस्।',
    validationSumMismatch: 'सहभागीहरूको कुल भाग र कुल खर्च मिलेन।',
    validationPercentageMismatch: 'प्रतिशतहरूको योग १००% हुनुपर्छ।',
    debtorOwesCreditor: '{debtor} ले {creditor} लाई {amount} दिनुपर्छ',
    settledLabel: 'चुक्ता',
    creditorLabel: 'पाउनुपर्ने',
    debtorLabel: 'दिनुपर्ने',
    memberStatsPaid: 'कुल तिरेको',
    memberStatsShare: 'आफ्नो भाग',
    memberStatsNet: 'खुद ब्यालेन्स',
    demoDataLoaded: 'डेमो डाटा सफलतापूर्वक लोड भयो!',
    resetDemoData: 'डेमो डाटा रिसेट गर्नुहोस्',
    exportJSON: 'डाटा एक्सपोर्ट (JSON)',
    importJSON: 'डाटा आयात गर्नुहोस्',
  },

  hi: {
    appName: 'हिसाब साथी',
    appSubtitle: 'ग्रुप खर्च ट्रैकर',
    tagline: 'दोस्तों, रूममेट्स और ट्रिप्स के लिए सरल और पारदर्शी खर्च का हिसाब।',
    dashboard: 'डैशबोर्ड',
    groups: 'समूह (ग्रुप्स)',
    createGroup: 'नया ग्रुप बनाएं',
    newGroup: 'नया ग्रुप',
    noGroupsYet: 'अभी कोई ग्रुप नहीं है। खर्च ट्रैक करने के लिए पहला ग्रुप बनाएं!',
    totalExpenses: 'कुल ग्रुप खर्च',
    membersCount: 'सदस्य',
    baseCurrency: 'आधार मुद्रा',
    calendarPref: 'कैलेंडर',
    languagePref: 'भाषा',
    overallBalance: 'कुल शुद्ध बकाया',
    netOwed: 'आपको मिलना है',
    netOwes: 'आपको देना है',
    allSettled: 'सभी हिसाब चुकता है!',
    activeGroups: 'सक्रिय ग्रुप्स',
    expenses: 'खर्चे',
    settlements: 'हिसाब और निपटान',
    members: 'सदस्य',
    settings: 'सेटिंग्स',
    addExpense: 'खर्च जोड़ें',
    editExpense: 'खर्च संपादित करें',
    deleteExpense: 'हटाएं',
    confirmDeleteExpense: 'क्या आप वाकई इस खर्च को हटाना चाहते हैं?',
    paidBy: 'किसने भुगतान किया',
    date: 'तारीख',
    amount: 'रकम',
    currency: 'मुद्रा',
    exchangeRate: 'विनिमय दर',
    splitType: 'विभाजन का तरीका',
    splitEqual: 'बराबर बांटें',
    splitExact: 'सटीक रकम',
    splitPercentage: 'प्रतिशत द्वारा',
    splitShares: 'हिस्सों (गुणांक) द्वारा',
    splitItems: 'प्रत्येक सामान द्वारा',
    participants: 'शामिल सदस्य',
    selectAll: 'सभी चुनें',
    clearAll: 'सभी हटाएं',
    saveExpense: 'खर्च सहेजें',
    saveChanges: 'बदलाव सहेजें',
    cancel: 'रद्द करें',
    title: 'खर्च का शीर्षक',
    titlePlaceholder: 'उदा. होटल, डिनर, टैक्सी...',
    notes: 'अतिरिक्त नोट्स',
    settleUp: 'हिसाब चुकता करें',
    recordSettlement: 'भुगतान दर्ज करें',
    whoPaid: 'किसने दिया?',
    whoReceived: 'किसे मिला?',
    directSettlements: 'न्यूनतम लेन-देन निपटान योजना',
    noSettlementsNeeded: 'सभी का हिसाब चुकता है! कोई बकाया नहीं।',
    markAsPaid: 'चुकता दर्ज करें',
    copiedToClipboard: 'हिसाब विवरण कॉपी हो गया!',
    shareSummary: 'हिसाब साझा करें',
    copyTextSummary: 'विवरण कॉपी करें',
    calendarAD: 'ग्रेगोरियन (AD)',
    calendarBS: 'विक्रम संवत (BS)',
    equalSplitDesc: 'पैसे के बिना किसी अंतर के सभी में बराबर विभाजन।',
    exactSplitDesc: 'प्रत्येक सदस्य का सटीक हिस्सा दर्ज करें।',
    percentageSplitDesc: 'प्रतिशत कुल 100% होना चाहिए।',
    sharesSplitDesc: 'जब किसी सदस्य का हिस्सा 2x या अलग हो।',
    itemsSplitDesc: 'प्रत्येक सामान सदस्य को आवंटित करें।',
    insights: 'व्यक्तिगत इनसाइट्स',
    fieldNotes: 'टिप्स और नियम',
    snapReceipt: 'रसीद स्कैनर',
    unitTestsRunner: 'कैलकुलेशन टेस्ट सुइट',
    runTests: 'टेस्ट रन करें',
    allTestsPassed: 'सभी एल्गोरिदम और राउंडिंग टेस्ट सफल रहे!',
    testSuiteTitle: 'एल्गोरिदम और सटीकता सत्यापन',
    validationMinMembers: 'ग्रुप में कम से कम 2 सदस्य होने चाहिए।',
    validationSelectPayer: 'कृपया भुगतान करने वाले सदस्य को चुनें।',
    validationMinParticipants: 'कम से कम एक सहभागी चुनें।',
    validationAmountPositive: 'रकम शून्य से अधिक होनी चाहिए।',
    validationTitleRequired: 'कृपया खर्च का शीर्षक लिखें।',
    validationSumMismatch: 'सदस्यों के हिस्सों का योग कुल खर्च के बराबर नहीं है।',
    validationPercentageMismatch: 'प्रतिशत का योग 100% होना चाहिए।',
    debtorOwesCreditor: '{debtor} को {creditor} को {amount} देना है',
    settledLabel: 'चुकता',
    creditorLabel: 'पाना है',
    debtorLabel: 'देना है',
    memberStatsPaid: 'कुल दिया',
    memberStatsShare: 'कुल हिस्सा',
    memberStatsNet: 'शुद्ध बैलेंस',
    demoDataLoaded: 'डेमो डेटा लोड हो गया!',
    resetDemoData: 'डेमो डेटा रीसेट करें',
    exportJSON: 'डेटा निर्यात (JSON)',
    importJSON: 'डेटा आयात करें',
  },

  mai: {
    appName: 'हिसाब साथी',
    appSubtitle: 'समूह खर्चा ट्रैकर',
    tagline: 'संगी-साथी, रूममेट आ यात्रा लेल आसान आ स्पष्ट हिसाब-किताब।',
    dashboard: 'डैशबोर्ड',
    groups: 'समूह (ग्रुप)',
    createGroup: 'नव समूह बनाउ',
    newGroup: 'नव ग्रुप',
    noGroupsYet: 'अखन कोनो ग्रुप नहि अछि। खर्चा लिखबाक लेल पहिल ग्रुप बनाउ!',
    totalExpenses: 'कुल ग्रुप खर्चा',
    membersCount: 'सदस्य लोकनि',
    baseCurrency: 'मूल मुद्रा',
    calendarPref: 'पंचांग / कैलेंडर',
    languagePref: 'भाषा',
    overallBalance: 'समग्र शुद्ध बाकी',
    netOwed: 'अहाँकेँ भेटबाक अछि',
    netOwes: 'अहाँकेँ देबाक अछि',
    allSettled: 'सभटा हिसाब चुकता भेल!',
    activeGroups: 'सक्रिय ग्रुप्स',
    expenses: 'खर्चा',
    settlements: 'हिसाब आ चुकता',
    members: 'सदस्य',
    settings: 'सेटिंग्स',
    addExpense: 'खर्चा जोड़ू',
    editExpense: 'खर्चा संपादन',
    deleteExpense: 'हटाउ',
    confirmDeleteExpense: 'की अहाँ ई खर्चा हटेबाक लेल निश्चित छी?',
    paidBy: 'के भुक्तान केलनि',
    date: 'तिथि / तारीख',
    amount: 'रकम',
    currency: 'मुद्रा',
    exchangeRate: 'विनिमय दर',
    splitType: 'बाँटबाक तरीका',
    splitEqual: 'बराबर बाँटू',
    splitExact: 'सटीक रकम',
    splitPercentage: 'प्रतिशत सं',
    splitShares: 'भाग (गुणांक) सं',
    splitItems: 'सामान अनुसार',
    participants: 'शामिल लोक',
    selectAll: 'सभ चुनू',
    clearAll: 'सभ हटाउ',
    saveExpense: 'खर्चा सुरक्षित करू',
    saveChanges: 'बदलाव सुरक्षित करू',
    cancel: 'रद्द करू',
    title: 'खर्चाक शीर्षक',
    titlePlaceholder: 'उदा. होटल, भोजन, टैक्सी...',
    notes: 'अतिरिक्त टिप्पणी',
    settleUp: 'हिसाब चुकता करू',
    recordSettlement: 'भुक्तान दर्ज करू',
    whoPaid: 'के देलनि?',
    whoReceived: 'किनका भेटलनि?',
    directSettlements: 'न्यूनतम लेनदेन हिसाब योजना',
    noSettlementsNeeded: 'सभक हिसाब चुकता अछि! कोनो बाकी नहि।',
    markAsPaid: 'चुकता दर्ज करू',
    copiedToClipboard: 'हिसाब कॉपी भऽ गेल!',
    shareSummary: 'हिसाब साझा करू',
    copyTextSummary: 'विवरण कॉपी करू',
    calendarAD: 'ग्रेगोरियन (AD)',
    calendarBS: 'विक्रम संवत (BS)',
    equalSplitDesc: 'पैसाक बिना कोनो अंतर सभमे बराबर बँटवारा।',
    exactSplitDesc: 'प्रत्येक सदस्यक सटीक हिस्सा दर्ज करू।',
    percentageSplitDesc: 'प्रतिशतक योग १००% होयबाक चाही।',
    sharesSplitDesc: 'जखन कोनो सदस्यक हिस्सा २x वा भिन्न होइ।',
    itemsSplitDesc: 'सामान अनुसार बाँटबाक सुविधा।',
    insights: 'व्यक्तिगत इनसाइट्स',
    fieldNotes: 'टिप्स आ नियम',
    snapReceipt: 'रसीद स्कैनर',
    unitTestsRunner: 'कैलकुलेशन टेस्ट सुइट',
    runTests: 'टेस्ट चलाउ',
    allTestsPassed: 'सभटा एल्गोरिदम आ दशमलव गणना सफल रहल!',
    testSuiteTitle: 'एल्गोरिदम आ शुद्धता सत्यापन',
    validationMinMembers: 'ग्रुपमे कम सं कम २ टा सदस्य होयबाक चाही।',
    validationSelectPayer: 'कृपा कऽ भुक्तान कर्ता चुनू।',
    validationMinParticipants: 'कम सं कम एक गोटे सहभागी चुनू।',
    validationAmountPositive: 'रकम शून्य सं बेसी होयबाक चाही।',
    validationTitleRequired: 'कृपा कऽ खर्चाक शीर्षक लिखू।',
    validationSumMismatch: 'सदस्यक हिस्साक योग कुल खर्चा सं नहि मिलल।',
    validationPercentageMismatch: 'प्रतिशतक योग १००% होयबाक चाही।',
    debtorOwesCreditor: '{debtor} केँ {creditor} केँ {amount} देबय पड़त',
    settledLabel: 'चुकता',
    creditorLabel: 'भेटत',
    debtorLabel: 'देबय पड़त',
    memberStatsPaid: 'कुल देलनि',
    memberStatsShare: 'अपन हिस्सा',
    memberStatsNet: 'शुद्ध बैलेंस',
    demoDataLoaded: 'डेमो डेटा लोड भऽ गेल!',
    resetDemoData: 'डेमो डेटा रीसेट करू',
    exportJSON: 'डेटा निर्यात (JSON)',
    importJSON: 'डेटा आयात करू',
  },
};

export const LANGUAGE_OPTIONS: { code: SupportedLanguage; label: string; nativeLabel: string }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'fr', label: 'Français', nativeLabel: 'Français' },
  { code: 'ne', label: 'Nepali', nativeLabel: 'नेपाली' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'mai', label: 'Maithili', nativeLabel: 'मैथिली' },
];

/**
 * Translate helper that interpolates parameters without ever modifying user-generated values.
 */
export function translate(
  lang: SupportedLanguage,
  key: keyof TranslationDictionary,
  params?: Record<string, string | number>
): string {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
  let text = dict[key] || TRANSLATIONS.en[key] || (key as string);

  if (params) {
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
    });
  }

  return text;
}

/**
 * Specialized formatter for "{debtor} owes {creditor} {amount}" strictly respecting user generated names
 */
export function formatSettlementText(
  lang: SupportedLanguage,
  debtorName: string,
  creditorName: string,
  formattedAmount: string
): string {
  return translate(lang, 'debtorOwesCreditor', {
    debtor: debtorName,
    creditor: creditorName,
    amount: formattedAmount,
  });
}
