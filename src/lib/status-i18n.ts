import type { StatusBlocksLabels } from "@/components/blocks/status-i18n";
import type { Locale } from "@/lib/status-data";

const localeCode: Record<Locale, string> = {
  en: "en-US",
  ar: "ar",
};

export const locales = [
  {
    value: "en",
    label: "English",
    flagSrc: "https://hatscripts.github.io/circle-flags/flags/us.svg",
  },
  {
    value: "ar",
    label: "العربية",
    flagSrc: "https://hatscripts.github.io/circle-flags/flags/sy.svg",
  },
];

export const copy = {
  en: {
    appName: "SVU Status",
    eyebrow: "University services",
    title: "Live status for SVU online services",
    description:
      "Public reachability checks for the student portal, LMS, mail, website, and request system.",
    source: "GitHub data",
    repository: "GitHub repository",
    madeBy: "Made by",
    authorName: "Shadi Al Milhem",
    lastChecked: "Last checked",
    uptime: "45-day uptime",
    services: "Services",
    recentEvents: "Recent outages",
    latestHttp: "HTTP",
    latency: "Latency",
    attempts: "Attempt",
    dataUnavailable: "Status data is not available",
    dataUnavailableDetail:
      "The page loaded, but the generated status JSON could not be read.",
    noChecks: "No checks have been published yet.",
    allClear: "All monitored services are reachable.",
    outage: "One or more services are unreachable.",
    pending: "Waiting for the first scheduled check.",
  },
  ar: {
    appName: "حالة SVU",
    eyebrow: "خدمات الجامعة",
    title: "حالة مباشرة لخدمات الجامعة الافتراضية",
    description:
      "فحوصات وصول عامة لبوابة الطلاب، نظام التعلم، البريد، الموقع، ونظام الطلبات.",
    source: "بيانات GitHub",
    repository: "مستودع GitHub",
    madeBy: "صنع بواسطة",
    authorName: "شادي الملحم",
    lastChecked: "آخر فحص",
    uptime: "التوفر خلال ٤٥ يوم",
    services: "الخدمات",
    recentEvents: "الأعطال الأخيرة",
    latestHttp: "HTTP",
    latency: "زمن الاستجابة",
    attempts: "المحاولة",
    dataUnavailable: "بيانات الحالة غير متاحة",
    dataUnavailableDetail:
      "تم تحميل الصفحة، لكن تعذر قراءة ملف الحالة المولد.",
    noChecks: "لم يتم نشر أي فحص بعد.",
    allClear: "كل الخدمات المراقبة قابلة للوصول.",
    outage: "خدمة واحدة أو أكثر غير قابلة للوصول.",
    pending: "بانتظار أول فحص مجدول.",
  },
} as const;

export function getInitialLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  return navigator.language.toLowerCase().startsWith("ar") ? "ar" : "en";
}

export function makeStatusLabels(locale: Locale): StatusBlocksLabels {
  const code = localeCode[locale];
  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat(code, {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Dubai",
    }).format(date);
  const formatDateShort = (date: Date) =>
    new Intl.DateTimeFormat(code, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "Asia/Dubai",
    }).format(date);
  const formatDateTime = (date: Date) =>
    new Intl.DateTimeFormat(code, {
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Dubai",
    }).format(date);
  const formatTime = (date: Date) =>
    new Intl.DateTimeFormat(code, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Dubai",
    }).format(date);

  const range = (from?: Date, to?: Date) => {
    if (from && to) return `${formatDateTime(from)} - ${formatDateTime(to)}`;
    if (from) return locale === "ar" ? `منذ ${formatDateTime(from)}` : `Since ${formatDateTime(from)}`;
    if (to) return locale === "ar" ? `حتى ${formatDateTime(to)}` : `Until ${formatDateTime(to)}`;
    return locale === "ar" ? "كل الوقت" : "All time";
  };

  if (locale === "ar") {
    return {
      systemStatus: {
        success: { long: "كل الأنظمة تعمل", short: "يعمل" },
        degraded: { long: "أداء متراجع", short: "متراجع" },
        error: { long: "انقطاع جزئي", short: "عطل" },
        info: { long: "لا توجد بيانات كافية", short: "معلومة" },
        empty: { long: "لا توجد بيانات", short: "بدون بيانات" },
      },
      incidentStatus: {
        investigating: "قيد التحقق",
        identified: "تم التحديد",
        monitoring: "قيد المراقبة",
        resolved: "تم الحل",
      },
      requestStatus: {
        success: "طبيعي",
        degraded: "متراجع",
        error: "خطأ",
        info: "صيانة",
        empty: "لا توجد بيانات",
      },
      today: "اليوم",
      ongoing: "مستمر",
      reportResolved: "تم حل البلاغ",
      noRecentNotifications: "لا توجد تنبيهات حديثة",
      noRecentNotificationsDescription: "لم يتم تسجيل أعطال حديثة.",
      noReports: "لا توجد بلاغات",
      noReportsDescription: "لا توجد بلاغات للعرض.",
      noPublicMonitors: "لا توجد خدمات عامة",
      noPublicMonitorsDescription: "لا توجد خدمات عامة للعرض.",
      themeNames: { light: "فاتح", dark: "داكن", system: "النظام" },
      ariaToggleTheme: "تبديل المظهر",
      subscribe: "اشترك في التحديثات",
      subscribeRssDescription: "اشترك عبر RSS",
      subscribeAtomDescription: "اشترك عبر Atom",
      subscribeJsonDescription: "اشترك عبر JSON",
      subscribeSlackDescription: "انسخ الرابط إلى Slack.",
      subscribeSshDescription: "احصل على الحالة عبر SSH",
      linkCopiedToClipboard: "تم نسخ الرابط",
      ariaCopyLink: "نسخ الرابط",
      poweredBy: "مدعوم بواسطة",
      getInTouch: "تواصل",
      ariaStatusTracker: "متتبع الحالة",
      ariaDayStatus: (n) => `حالة اليوم ${n}`,
      clickAgainToUnpin: "انقر مرة أخرى لإلغاء التثبيت",
      durationIn: (s) => `(خلال ${s})`,
      durationEarlier: (s) => `(${s} قبل)`,
      durationFor: (s) => `(لمدة ${s})`,
      durationAcross: (s) => `على مدى ${s}`,
      formatDate,
      formatDateShort,
      formatDateTime,
      formatDateRange: range,
      formatDateRangeParts: (from, to) => ({
        from: formatDateTime(from),
        to: formatTime(to),
      }),
    };
  }

  return {
    systemStatus: {
      success: { long: "All Services Operational", short: "Operational" },
      degraded: { long: "Degraded Performance", short: "Degraded" },
      error: { long: "Partial Outage", short: "Outage" },
      info: { long: "Waiting for Status Data", short: "Pending" },
      empty: { long: "No Data", short: "No Data" },
    },
    incidentStatus: {
      investigating: "Investigating",
      identified: "Identified",
      monitoring: "Monitoring",
      resolved: "Resolved",
    },
    requestStatus: {
      success: "Up",
      degraded: "Degraded",
      error: "Down",
      info: "Maintenance",
      empty: "No data",
    },
    today: "Today",
    ongoing: "Ongoing",
    reportResolved: "Report resolved",
    noRecentNotifications: "No recent outages",
    noRecentNotificationsDescription: "No outages have been recorded recently.",
    noReports: "No reports",
    noReportsDescription: "There are no reports to display.",
    noPublicMonitors: "No public monitors",
    noPublicMonitorsDescription: "There are no public monitors to display.",
    themeNames: { light: "Light", dark: "Dark", system: "System" },
    ariaToggleTheme: "Toggle theme",
    subscribe: "Get updates",
    subscribeRssDescription: "Get the RSS feed",
    subscribeAtomDescription: "Get the Atom feed",
    subscribeJsonDescription: "Get the JSON updates",
    subscribeSlackDescription:
      "For status updates in Slack, paste the text below into any channel.",
    subscribeSshDescription: "Get status via SSH",
    linkCopiedToClipboard: "Link copied to clipboard",
    ariaCopyLink: "Copy link",
    poweredBy: "powered by",
    getInTouch: "Get in touch",
    ariaStatusTracker: "Status tracker",
    ariaDayStatus: (n) => `Day ${n} status`,
    clickAgainToUnpin: "Click again to unpin",
    durationIn: (s) => `(in ${s})`,
    durationEarlier: (s) => `(${s} earlier)`,
    durationFor: (s) => `(for ${s})`,
    durationAcross: (s) => `across ${s}`,
    formatDate,
    formatDateShort,
    formatDateTime,
    formatDateRange: range,
    formatDateRangeParts: (from, to) => ({
      from: formatDateTime(from),
      to: formatTime(to),
    }),
  };
}
