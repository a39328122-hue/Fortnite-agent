(() => {
  "use strict";

  const STORAGE_KEY = "fortniteAiAgent.language.v1";
  const SUPPORTED = ["en", "fr", "ar"];

  const COPY = {
    en: {
      brand: "Fortnite Ai Agent",
      newChat: "New chat",
      moreTools: "More Fortnite Tools",
      settings: "Settings",
      recents: "Recents",
      welcomeTitle: "Chat with FNAA (Fortnite Ai Agent)",
      welcomeSubtitle: "Fortnite files, FModel, UEFN, Verse, asset paths and research.",
      messagePlaceholder: "Message Fortnite Ai Agent",
      toolsTitle: "More Fortnite Tools",
      searchTab: "Search",
      ids: "IDs",
      devices: "Devices",
      convert: "Convert",
      path: "Path",
      cosmetic: "Cosmetic",
      settingsTitle: "Settings",
      changeLanguage: "Change the language",
      language: "Language",
      dmOwner: "DM the owner",
      ownerHint: "@its.swag on Discord",
      loginWelcome: "Log in to use your Fortnite Ai Agent account.",
      noAccount: "you don’t have an account?",
      signupFree: "sign up For free",
      continueAs: "Continue as a",
      googleLoginHint: "Use Google. We never receive or store your Google password.",
      useGoogle: "Use your Google",
      addAccount: "Add another account",
      setupQuestion: "Do u want to continue Account set up?",
      sure: "Sure",
      no: "No",
      accountSetup: "Account set up",
      choosePhoto: "Choose photo",
      username: "Username",
      save: "Save",
      changeUsername: "Change username",
      usernameHint: "Type Whatever u want — 9 characters max.",
      changeTheme: "Change The Theme",
      blackTheme: "Black Theme",
      whiteTheme: "White Theme",
      fortniteTheme: "Override Theme",
      ownerAccounts: "Owner accounts :",
      loginDescription: "Use Google or continue as Guest.",
      login: "Log in",
      guest: "Guest",
      continue: "Continue",
      manualSearch: "Manual Search",
      manualNote: "Search the full local Fortnite files database manually.",
      searchPlaceholder: "Search a path, asset, SM_, M_, MI_...",
      search: "Search",
      searching: "Searching",
      pathModifier: "Path Modifier",
      pathNote: "Convert Fortnite file paths to Unreal object paths.",
      format: "Format",
      addClassAction: "Add _C",
      addClass: "Add _C",
      convertedPath: "Converted path will appear here",
      copy: "Copy",
      json: "JSON",
      hideJson: "Hide JSON",
      copyJson: "Copy JSON",
      jsonUnavailable: "JSON is unavailable for this path.",
      islandsIds: "Islands & IDs",
      searchIslands: "Search islands / IDs",
      deviceMeshes: "Device Meshes",
      searchDevice: "Search device...",
      cosmeticBrowser: "Cosmetic Browser",
      cosmeticNote: "Search your local Fortnite database for cosmetics.",
      cosmeticSearch: "Skin name, CID, character path...",
      moreCosmeticIds: "For more cosmetics ids"
    },

    fr: {
      brand: "Fortnite Ai Agent",
      newChat: "Nouveau chat",
      moreTools: "Plus d’outils Fortnite",
      settings: "Paramètres",
      recents: "Récents",
      welcomeTitle: "Discuter avec FNAA (Fortnite Ai Agent)",
      welcomeSubtitle: "Fichiers Fortnite, FModel, UEFN, Verse, chemins d’assets et recherche.",
      messagePlaceholder: "Message à Fortnite Ai Agent",
      toolsTitle: "Plus d’outils Fortnite",
      searchTab: "Recherche",
      ids: "IDs",
      devices: "Appareils",
      convert: "Convertir",
      path: "Chemin",
      cosmetic: "Cosmétiques",
      settingsTitle: "Paramètres",
      changeLanguage: "Changer la langue",
      language: "Langue",
      dmOwner: "Contacter le propriétaire",
      ownerHint: "@its.swag sur Discord",
      loginWelcome: "Connecte-toi à ton compte Fortnite Ai Agent.",
      noAccount: "tu n’as pas de compte ?",
      signupFree: "créer un compte gratuitement",
      continueAs: "Continuer en",
      googleLoginHint: "Utilise Google. Nous ne recevons ni ne stockons ton mot de passe Google.",
      useGoogle: "Utiliser Google",
      addAccount: "Ajouter un autre compte",
      setupQuestion: "Continuer la configuration du compte ?",
      sure: "Oui",
      no: "Non",
      accountSetup: "Configuration du compte",
      choosePhoto: "Choisir une photo",
      username: "Nom d’utilisateur",
      save: "Enregistrer",
      changeUsername: "Changer le nom d’utilisateur",
      usernameHint: "Écris ce que tu veux — 9 caractères max.",
      changeTheme: "Changer le thème",
      blackTheme: "Thème noir",
      whiteTheme: "Thème blanc",
      fortniteTheme: "Thème Override",
      ownerAccounts: "Comptes du propriétaire :",
      loginDescription: "Utilise Google ou continue en invité.",
      login: "Connexion",
      guest: "Invité",
      continue: "Continuer",
      manualSearch: "Recherche manuelle",
      manualNote: "Recherche manuellement dans la base locale des fichiers Fortnite.",
      searchPlaceholder: "Chemin, asset, SM_, M_, MI_...",
      search: "Rechercher",
      searching: "Recherche",
      pathModifier: "Modificateur de chemin",
      pathNote: "Convertit les chemins de fichiers Fortnite en chemins d’objets Unreal.",
      format: "Formater",
      addClassAction: "Ajouter _C",
      addClass: "Ajouter _C",
      convertedPath: "Le chemin converti apparaîtra ici",
      copy: "Copier",
      json: "JSON",
      hideJson: "Masquer JSON",
      copyJson: "Copier JSON",
      jsonUnavailable: "JSON indisponible pour ce chemin.",
      islandsIds: "Îles & IDs",
      searchIslands: "Rechercher îles / IDs",
      deviceMeshes: "Meshes des appareils",
      searchDevice: "Rechercher un appareil...",
      cosmeticBrowser: "Navigateur de cosmétiques",
      cosmeticNote: "Recherche les cosmétiques dans ta base Fortnite locale.",
      cosmeticSearch: "Nom du skin, CID, chemin character...",
      moreCosmeticIds: "Plus d’IDs de cosmétiques"
    },

    ar: {
      brand: "Fortnite Ai Agent",
      newChat: "محادثة جديدة",
      moreTools: "المزيد من أدوات فورتنايت",
      settings: "الإعدادات",
      recents: "المحادثات الأخيرة",
      welcomeTitle: "تحدث مع FNAA (Fortnite Ai Agent)",
      welcomeSubtitle: "ملفات فورتنايت، FModel، UEFN، Verse، المسارات والبحث.",
      messagePlaceholder: "اكتب إلى Fortnite Ai Agent",
      toolsTitle: "المزيد من أدوات فورتنايت",
      searchTab: "البحث",
      ids: "المعرفات",
      devices: "الأجهزة",
      convert: "التحويل",
      path: "المسار",
      cosmetic: "الكوزمتكس",
      settingsTitle: "الإعدادات",
      changeLanguage: "تغيير اللغة",
      language: "اللغة",
      dmOwner: "راسل المالك",
      ownerHint: "@its.swag على Discord",
      loginWelcome: "سجّل الدخول لاستخدام حساب Fortnite Ai Agent.",
      noAccount: "ما عندك حساب؟",
      signupFree: "أنشئ حساب مجاناً",
      continueAs: "المتابعة كـ",
      googleLoginHint: "استخدم Google. نحن لا نستلم ولا نخزن كلمة مرور Google الخاصة بك.",
      useGoogle: "استخدم حساب Google",
      addAccount: "أضف حساباً آخر",
      setupQuestion: "هل تريد تكمل إعداد الحساب؟",
      sure: "أكيد",
      no: "لا",
      accountSetup: "إعداد الحساب",
      choosePhoto: "اختر صورة",
      username: "اسم المستخدم",
      save: "حفظ",
      changeUsername: "تغيير اسم المستخدم",
      usernameHint: "اكتب اللي تريده — الحد 9 أحرف.",
      changeTheme: "تغيير الثيم",
      blackTheme: "الثيم الأسود",
      whiteTheme: "الثيم الأبيض",
      fortniteTheme: "ثيم Override",
      ownerAccounts: "حسابات المالك :",
      loginDescription: "استخدم Google أو أكمل كضيف.",
      login: "تسجيل الدخول",
      guest: "ضيف",
      continue: "متابعة",
      manualSearch: "البحث اليدوي",
      manualNote: "ابحث يدوياً داخل قاعدة ملفات فورتنايت المحلية.",
      searchPlaceholder: "ابحث عن مسار، asset، SM_، M_، MI_...",
      search: "بحث",
      searching: "جاري البحث",
      pathModifier: "تعديل المسار",
      pathNote: "حوّل مسارات ملفات فورتنايت إلى Unreal object paths.",
      format: "تنسيق",
      addClassAction: "إضافة _C",
      addClass: "إضافة _C",
      convertedPath: "سيظهر المسار المحول هنا",
      copy: "نسخ",
      json: "JSON",
      hideJson: "إخفاء JSON",
      copyJson: "نسخ JSON",
      jsonUnavailable: "لا يوجد JSON متاح لهذا المسار.",
      islandsIds: "الجزر والمعرفات",
      searchIslands: "ابحث عن جزيرة / ID",
      deviceMeshes: "Device Meshes",
      searchDevice: "ابحث عن جهاز...",
      cosmeticBrowser: "متصفح الكوزمتكس",
      cosmeticNote: "ابحث عن الكوزمتكس داخل قاعدة فورتنايت المحلية.",
      cosmeticSearch: "اسم السكن، CID، character path...",
      moreCosmeticIds: "المزيد من Cosmetic IDs"
    }
  };

  function getLanguage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED.includes(saved) ? saved : "en";
  }

  function t(key) {
    const lang = getLanguage();
    return COPY[lang]?.[key] ?? COPY.en[key] ?? key;
  }

  function apply(root = document) {
    const lang = getLanguage();
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

    root.querySelectorAll?.("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });

    root.querySelectorAll?.("[data-i18n-placeholder]").forEach((el) => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });

    root.querySelectorAll?.("[data-set-language]").forEach((el) => {
      el.classList.toggle("active", el.dataset.setLanguage === lang);
    });
  }

  function setLanguage(lang) {
    if (!SUPPORTED.includes(lang)) return;
    localStorage.setItem(STORAGE_KEY, lang);
    apply(document);
    window.dispatchEvent(new CustomEvent("fortnite-language-changed", {
      detail: { language: lang }
    }));
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-set-language]");
    if (!button) return;
    setLanguage(button.dataset.setLanguage);
  });

  window.FortniteI18n = { t, apply, setLanguage, getLanguage };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => apply(document), { once:true });
  } else {
    apply(document);
  }
})();
