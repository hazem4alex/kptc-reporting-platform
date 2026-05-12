export const translations = {
  en: {
    overview: "Overview",
    transactions: "Transactions",
    devices: "Devices/Buses",
    cardTypes: "Card Types",
    liveMap: "Live Map",
    users: "Users",
    reportingPlatform: "Reporting Platform",
    signIn: "Sign in",
    username: "Username",
    password: "Password",
    logout: "Logout",
    collapse: "Collapse",
    expand: "Expand",
    light: "Light",
    dark: "Dark",
    language: "Language",
    userAccess: "User access",
    createUser: "Create user",
    displayName: "Display name",
    role: "Role",
    admin: "Admin",
    viewer: "Viewer",
    created: "Created",
    lastLogin: "Last login"
  },
  ar: {
    overview: "نظرة عامة",
    transactions: "المعاملات",
    devices: "الأجهزة والحافلات",
    cardTypes: "أنواع البطاقات",
    liveMap: "الخريطة المباشرة",
    users: "المستخدمون",
    reportingPlatform: "منصة التقارير",
    signIn: "تسجيل الدخول",
    username: "اسم المستخدم",
    password: "كلمة المرور",
    logout: "خروج",
    collapse: "طي",
    expand: "توسيع",
    light: "فاتح",
    dark: "داكن",
    language: "اللغة",
    userAccess: "صلاحيات المستخدمين",
    createUser: "إنشاء مستخدم",
    displayName: "الاسم المعروض",
    role: "الدور",
    admin: "مدير",
    viewer: "مشاهد",
    created: "تاريخ الإنشاء",
    lastLogin: "آخر دخول"
  }
};

export function createTranslator(language) {
  return (key) => translations[language]?.[key] || translations.en[key] || key;
}
