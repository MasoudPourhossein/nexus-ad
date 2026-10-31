import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Lang = 'fa' | 'en';

const fa: Record<string, string> = {
  appName: 'نکسوس اد',
  tagline: 'پلتفرم پیام‌رسانی هوشمند',
  login: 'ورود', email: 'ایمیل', password: 'رمز عبور', logout: 'خروج',
  invalid_credentials: 'ایمیل یا رمز عبور اشتباه است', too_many_attempts: 'تلاش زیاد. ۱۵ دقیقه دیگر امتحان کنید',
  dashboard: 'داشبورد', sessions: 'حساب‌ها', contacts: 'مخاطبین', campaigns: 'کمپین‌ها', rules: 'پاسخ خودکار',
  leads: 'سرنخ‌ها', inbox: 'پیام‌های دریافتی', apiKeys: 'API و توسعه', settings: 'تنظیمات',
  admin: 'مدیریت', tenants: 'مشتریان', plans: 'پکیج‌ها', vpn: 'اتصال VPN',
  credits: 'اعتبار پیام', unlimited: 'نامحدود', sentToday: 'ارسال امروز', deliveryRate: 'نرخ تحویل', readRate: 'نرخ خوانده‌شدن',
  replyRate: 'نرخ پاسخ', last14: 'ارسال و دریافت ۱۴ روز اخیر', sent: 'ارسال‌شده', received: 'دریافتی', funnel: 'قیف تبدیل',
  delivered: 'تحویل‌شده', read: 'خوانده‌شده', replied: 'پاسخ‌داده', failed: 'ناموفق', queued: 'در صف', invalid: 'بدون واتساپ',
  opted_out: 'لغو عضویت', cancelled: 'لغوشده', sending: 'در حال ارسال',
  activeSessions: 'حساب‌های فعال', runningCampaigns: 'کمپین در حال اجرا', totalContacts: 'کل مخاطبین', optOuts: 'لغو عضویت‌ها',
  newSession: 'حساب جدید', label: 'نام', ratePerMinute: 'پیام در دقیقه', dailyCap: 'سقف روزانه', connect: 'اتصال',
  scanQr: 'کد QR را با واتساپ اسکن کنید', scanHelp: 'واتساپ ← تنظیمات ← دستگاه‌های متصل ← اتصال دستگاه',
  pairWithCode: 'اتصال با کد', getCode: 'دریافت کد', phone: 'شماره', restart: 'راه‌اندازی مجدد', delete: 'حذف', edit: 'ویرایش',
  save: 'ذخیره', cancel: 'انصراف', create: 'ایجاد', close: 'بستن', confirmDelete: 'مطمئن هستید؟', loading: 'در حال بارگذاری…',
  empty: 'موردی وجود ندارد', search: 'جستجو', actions: 'عملیات', status: 'وضعیت', name: 'نام', createdAt: 'تاریخ',
  WORKING: 'متصل', SCAN_QR_CODE: 'منتظر اسکن', STARTING: 'در حال اتصال', STOPPED: 'متوقف', FAILED: 'خطا', UNKNOWN: 'نامشخص',
  newList: 'لیست جدید', importCsv: 'وارد کردن CSV', dropCsv: 'فایل CSV را اینجا رها کنید یا کلیک کنید', csvHelp: 'ستون شماره (phone یا شماره) الزامی است. ستون‌های دیگر به‌عنوان متغیر قابل استفاده‌اند: {name} {شهر}',
  pasteNumbers: 'چسباندن شماره‌ها', pasteHelp: 'هر شماره در یک خط', add: 'افزودن', imported: 'وارد شد', duplicates: 'تکراری', invalidRows: 'نامعتبر',
  lists: 'لیست‌ها', view: 'مشاهده', back: 'بازگشت',
  newCampaign: 'کمپین جدید', session: 'حساب', list: 'لیست', message: 'پیام', messageType: 'نوع پیام', text: 'متن', image: 'تصویر', file: 'فایل', video: 'ویدیو', voice: 'صوت',
  mediaUrl: 'لینک فایل', checkExists: 'قبل از ارسال، داشتن واتساپ بررسی شود', startNow: 'شروع فوری', start: 'شروع', pause: 'توقف', resume: 'ادامه',
  variablesHelp: 'متغیرها: {name} {phone} و هر ستون CSV', preview: 'پیش‌نمایش', progress: 'پیشرفت', draft: 'پیش‌نویس', running: 'در حال اجرا', paused: 'متوقف', done: 'تمام‌شده',
  no_credits: 'اعتبار تمام شد', manual: 'دستی', hourly: 'ارسال ساعتی', leadsByTag: 'سرنخ‌ها بر اساس برچسب',
  newRule: 'پاسخ خودکار جدید', keywords: 'کلمات کلیدی', keywordsHelp: 'با Enter اضافه کنید. اعداد فارسی و انگلیسی یکسان‌اند', match: 'نوع تطبیق',
  exact: 'دقیقاً برابر', contains: 'شامل', any: 'هر پیامی', reply: 'پاسخ', tag: 'برچسب سرنخ', tagHelp: 'مثلاً catalog — هر کسی این پاسخ را بگیرد در سرنخ‌ها ثبت می‌شود',
  onlyCampaign: 'فقط برای گیرندگان کمپین', allCampaigns: 'همه', allSessions: 'همه حساب‌ها', priority: 'اولویت', active: 'فعال', hits: 'اجرا',
  exportCsv: 'خروجی CSV', all: 'همه', from: 'از',
  newKey: 'کلید جدید', keyCreated: 'این کلید فقط یک بار نمایش داده می‌شود', copy: 'کپی', copied: 'کپی شد', revoked: 'باطل‌شده', revoke: 'ابطال', lastUsed: 'آخرین استفاده',
  apiDocs: 'مستندات API', profile: 'پروفایل', changePassword: 'تغییر رمز', currentPassword: 'رمز فعلی', newPassword: 'رمز جدید',
  webhookUrl: 'آدرس Webhook', webhookHelp: 'رویدادها (وضعیت پیام، پیام دریافتی، سرنخ) به این آدرس ارسال می‌شوند', optOutKeywords: 'کلمات لغو عضویت',
  optOutReply: 'پاسخ لغو عضویت', language: 'زبان', theme: 'پوسته', saved: 'ذخیره شد',
  newTenant: 'مشتری جدید', plan: 'پکیج', expires: 'انقضا', addCredits: 'افزایش اعتبار', amount: 'تعداد', sessionLimit: 'سقف حساب',
  newPlan: 'پکیج جدید', price: 'قیمت', messageQuota: 'تعداد پیام', durationDays: 'مدت (روز)', role: 'نقش', user: 'کاربر', assignPlan: 'تخصیص پکیج',
  vpnHelp: 'لینک‌های vless، vmess، ss و trojan (شامل xhttp، reality، ws، grpc) را وارد کنید. واتساپ از طریق کانفیگ فعال وصل می‌شود.',
  addConfigs: 'افزودن کانفیگ', activate: 'فعال‌سازی', deactivate: 'غیرفعال‌سازی', test: 'تست اتصال', xrayRunning: 'Xray در حال اجرا', xrayStopped: 'Xray خاموش', direct: 'اتصال مستقیم',
  latency: 'تأخیر', ok: 'موفق', error: 'خطا', upstream_error: 'خطا در ارتباط با سرور واتساپ', session_limit_reached: 'به سقف حساب‌ها رسیده‌اید',
  validation_error: 'اطلاعات ورودی نامعتبر است', email_taken: 'این ایمیل قبلاً ثبت شده', wrong_password: 'رمز فعلی اشتباه است',
  sendTest: 'ارسال تکی', send: 'ارسال', noSessions: 'ابتدا یک حساب واتساپ متصل کنید', direction: 'جهت', in: 'ورودی', out: 'خروجی',
  attachFile: 'افزودن فایل', orPasteUrl: 'یا چسباندن لینک', caption: 'کپشن (اختیاری)', record: 'ضبط صدا', stopRecord: 'توقف ضبط', or: 'یا', micUnavailable: 'مرورگر میکروفون را پشتیبانی نمی‌کند', micDenied: 'دسترسی میکروفون رد شد', overrideRate: 'تنظیم سرعت/سقف برای این کمپین', unlimitedHint: '۰ = بدون محدودیت', autoReplyToggle: 'پاسخ خودکار به این کمپین', triggerKeywords: 'کلمه‌ی کلیدی پاسخ', triggerHint: 'مثلاً ۱ یا کاتالوگ — با Enter یا کاما جدا کن', secondMessage: 'پیام دوم (پاسخ)', groups: 'گروه و کانال', createGroup: 'ساخت گروه', addMembers: 'افزودن عضو', createChannel: 'ساخت کانال', groupName: 'نام گروه', pickGroup: 'انتخاب گروه', membersFrom: 'اعضا از', fromList: 'از لیست مخاطبین', fromPaste: 'شماره‌ها (هر خط یکی)', channelTitle: 'نام کانال', channelDesc: 'توضیحات', added: 'اضافه شد', groupCreated: 'گروه ساخته شد', channelCreated: 'کانال ساخته شد', loadGroups: 'بارگذاری گروه‌ها', noGroups: 'گروهی پیدا نشد', subscription: 'لینک اشتراک (Subscription)', importSub: 'دریافت از اشتراک', testAll: 'تست همه', autoBest: 'انتخاب کمترین پینگ', xrayMissing: 'Xray نصب نیست', xrayMissingHelp: 'دانلود Xray از گیت‌هاب روی این سرور فیلتر است. فایل xray را در volume به نام xray-data (مسیر /data/xray/xray) کپی کن یا XRAY_DOWNLOAD_BASE را در .env بگذار، سپس nexus restart.', testing: 'در حال تست…', skipped: 'تکراری', bestPicked: 'بهترین کانفیگ فعال شد', sessionsProxy: 'وضعیت واقعی حساب‌ها (از خود WAHA)', proxyApplied: 'پروکسی اعمال شده', proxyNotApplied: 'بدون پروکسی', reapply: 'اعمال مجدد روی حساب‌ها', livePing: 'پینگ زنده', checkWa: 'تست اتصال به واتساپ', waReachable: 'واتساپ از این کانفیگ در دسترس است', waBlocked: 'واتساپ IP این سرور را رد می‌کند — کانفیگ/سرور دیگری انتخاب کن', waNetErr: 'به واتساپ نرسید — مشکل پروکسی/شبکه', waStalled: 'اتصال باز می‌شود ولی داده گیر می‌کند', waIpBlocked: 'پروکسی سالم است (کنترل OK) ولی واتساپ وب از این IP جواب نمی‌دهد — این سرور برای واتساپ وب بلاک است؛ سرور دیگری لازم است', waCtl: 'کنترل (Cloudflare)', waOk: 'واتساپ ✓', waBad: 'واتساپ ✗', noWaConfig: 'هیچ کانفیگی واتساپ وب را پاس نمی‌دهد — از سرور/لوکیشن دیگر کانفیگ بگیر', ipBlockedHint: 'IPهای دیتاسنتر/VPN اغلب توسط واتساپ بلاک می‌شوند. سرور با IP کم‌استفاده یا residential بهتر جواب می‌دهد.', failover: 'تعویض خودکار هنگام قطع (هر دقیقه تست، بعد از ۲ خطا می‌رود سراغ کمترین پینگ)',
};

const en: Record<string, string> = {
  appName: 'Nexus Ad', tagline: 'Smart messaging platform',
  login: 'Sign in', email: 'Email', password: 'Password', logout: 'Sign out',
  invalid_credentials: 'Wrong email or password', too_many_attempts: 'Too many attempts. Try again in 15 minutes',
  dashboard: 'Dashboard', sessions: 'Accounts', contacts: 'Contacts', campaigns: 'Campaigns', rules: 'Auto replies',
  leads: 'Leads', inbox: 'Inbox', apiKeys: 'API & Developers', settings: 'Settings',
  admin: 'Admin', tenants: 'Customers', plans: 'Plans', vpn: 'VPN',
  credits: 'Message credits', unlimited: 'Unlimited', sentToday: 'Sent today', deliveryRate: 'Delivery rate', readRate: 'Read rate',
  replyRate: 'Reply rate', last14: 'Sent and received, last 14 days', sent: 'Sent', received: 'Received', funnel: 'Conversion funnel',
  delivered: 'Delivered', read: 'Read', replied: 'Replied', failed: 'Failed', queued: 'Queued', invalid: 'No WhatsApp',
  opted_out: 'Opted out', cancelled: 'Cancelled', sending: 'Sending',
  activeSessions: 'Active accounts', runningCampaigns: 'Running campaigns', totalContacts: 'Total contacts', optOuts: 'Opt-outs',
  newSession: 'New account', label: 'Name', ratePerMinute: 'Messages per minute', dailyCap: 'Daily cap', connect: 'Connect',
  scanQr: 'Scan the QR code with WhatsApp', scanHelp: 'WhatsApp → Settings → Linked devices → Link a device',
  pairWithCode: 'Link with code', getCode: 'Get code', phone: 'Phone', restart: 'Restart', delete: 'Delete', edit: 'Edit',
  save: 'Save', cancel: 'Cancel', create: 'Create', close: 'Close', confirmDelete: 'Are you sure?', loading: 'Loading…',
  empty: 'Nothing here yet', search: 'Search', actions: 'Actions', status: 'Status', name: 'Name', createdAt: 'Date',
  WORKING: 'Connected', SCAN_QR_CODE: 'Waiting for scan', STARTING: 'Connecting', STOPPED: 'Stopped', FAILED: 'Error', UNKNOWN: 'Unknown',
  newList: 'New list', importCsv: 'Import CSV', dropCsv: 'Drop a CSV file here or click', csvHelp: 'A phone column (phone or شماره) is required. Other columns become variables: {name} {city}',
  pasteNumbers: 'Paste numbers', pasteHelp: 'One number per line', add: 'Add', imported: 'Imported', duplicates: 'Duplicates', invalidRows: 'Invalid',
  lists: 'Lists', view: 'View', back: 'Back',
  newCampaign: 'New campaign', session: 'Account', list: 'List', message: 'Message', messageType: 'Message type', text: 'Text', image: 'Image', file: 'File', video: 'Video', voice: 'Voice',
  mediaUrl: 'File URL', checkExists: 'Check the number has WhatsApp before sending', startNow: 'Start now', start: 'Start', pause: 'Pause', resume: 'Resume',
  variablesHelp: 'Variables: {name} {phone} and any CSV column', preview: 'Preview', progress: 'Progress', draft: 'Draft', running: 'Running', paused: 'Paused', done: 'Done',
  no_credits: 'Out of credits', manual: 'Manual', hourly: 'Hourly sends', leadsByTag: 'Leads by tag',
  newRule: 'New auto reply', keywords: 'Keywords', keywordsHelp: 'Press Enter to add. Persian and Latin digits match', match: 'Match',
  exact: 'Exact', contains: 'Contains', any: 'Any message', reply: 'Reply', tag: 'Lead tag', tagHelp: 'For example catalog: everyone who gets this reply is saved as a lead',
  onlyCampaign: 'Only for campaign recipients', allCampaigns: 'All', allSessions: 'All accounts', priority: 'Priority', active: 'Active', hits: 'Hits',
  exportCsv: 'Export CSV', all: 'All', from: 'From',
  newKey: 'New key', keyCreated: 'This key is shown only once', copy: 'Copy', copied: 'Copied', revoked: 'Revoked', revoke: 'Revoke', lastUsed: 'Last used',
  apiDocs: 'API docs', profile: 'Profile', changePassword: 'Change password', currentPassword: 'Current password', newPassword: 'New password',
  webhookUrl: 'Webhook URL', webhookHelp: 'Events (message status, incoming messages, leads) are posted here', optOutKeywords: 'Opt-out keywords',
  optOutReply: 'Opt-out reply', language: 'Language', theme: 'Theme', saved: 'Saved',
  newTenant: 'New customer', plan: 'Plan', expires: 'Expires', addCredits: 'Add credits', amount: 'Amount', sessionLimit: 'Account limit',
  newPlan: 'New plan', price: 'Price', messageQuota: 'Messages', durationDays: 'Duration (days)', role: 'Role', user: 'User', assignPlan: 'Assign plan',
  vpnHelp: 'Paste vless, vmess, ss or trojan links (xhttp, reality, ws, grpc supported). WhatsApp connects through the active config.',
  addConfigs: 'Add configs', activate: 'Activate', deactivate: 'Deactivate', test: 'Test', xrayRunning: 'Xray running', xrayStopped: 'Xray stopped', direct: 'Direct connection',
  latency: 'Latency', ok: 'OK', error: 'Error', upstream_error: 'WhatsApp server error', session_limit_reached: 'Account limit reached',
  validation_error: 'Invalid input', email_taken: 'Email already registered', wrong_password: 'Current password is wrong',
  sendTest: 'Single send', send: 'Send', noSessions: 'Connect a WhatsApp account first', direction: 'Direction', in: 'In', out: 'Out',
  attachFile: 'Attach file', orPasteUrl: 'or paste a URL', caption: 'Caption (optional)', record: 'Record', stopRecord: 'Stop', or: 'or', micUnavailable: 'Microphone not supported in this browser', micDenied: 'Microphone access denied', overrideRate: 'Set rate/cap for this campaign', unlimitedHint: '0 = unlimited', autoReplyToggle: 'Auto-reply for this campaign', triggerKeywords: 'Reply keyword', triggerHint: 'e.g. 1 or catalog — Enter or comma to add', secondMessage: 'Second message (reply)', groups: 'Groups & channels', createGroup: 'Create group', addMembers: 'Add members', createChannel: 'Create channel', groupName: 'Group name', pickGroup: 'Pick a group', membersFrom: 'Members from', fromList: 'contact list', fromPaste: 'numbers (one per line)', channelTitle: 'Channel name', channelDesc: 'Description', added: 'added', groupCreated: 'Group created', channelCreated: 'Channel created', loadGroups: 'Load groups', noGroups: 'No groups found', subscription: 'Subscription link', importSub: 'Import subscription', testAll: 'Test all', autoBest: 'Pick lowest ping', xrayMissing: 'Xray is not installed', xrayMissingHelp: 'Downloading Xray from GitHub is blocked on this server. Copy an xray binary into the xray-data volume (/data/xray/xray) or set XRAY_DOWNLOAD_BASE in .env, then nexus restart.', testing: 'Testing…', skipped: 'duplicates', bestPicked: 'Best config activated', sessionsProxy: 'Real account state (from WAHA)', proxyApplied: 'proxy applied', proxyNotApplied: 'no proxy', reapply: 'Re-apply to accounts', livePing: 'Live ping', checkWa: 'Test WhatsApp reachability', waReachable: 'WhatsApp is reachable through this config', waBlocked: 'WhatsApp refuses this server IP — pick another config/server', waNetErr: 'Could not reach WhatsApp — proxy/network problem', waStalled: 'Connection opens but data stalls', waIpBlocked: 'Proxy is fine (control OK) but WhatsApp Web does not answer from this IP — this server is blocked for WhatsApp Web; use another server', waCtl: 'Control (Cloudflare)', waOk: 'WhatsApp ✓', waBad: 'WhatsApp ✗', noWaConfig: 'No config passes WhatsApp Web — get configs from another server/location', ipBlockedHint: 'Datacenter/VPN IPs are often blocked by WhatsApp; a low-use or residential IP works better.', failover: 'Auto-switch on failure (checked every minute; after 2 failures picks the lowest ping)',
};

const dicts: Record<Lang, Record<string, string>> = { fa, en };

interface I18n {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  t: (key: string) => string;
  setLang: (l: Lang) => void;
  fmt: (n: number | null | undefined) => string;
  date: (d: string | Date | null | undefined, withTime?: boolean) => string;
}

const Ctx = createContext<I18n>(null as any);

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('nx_lang');
    if (saved === 'fa' || saved === 'en') return saved;
  } catch {
    // ignore
  }
  return navigator.language.startsWith('fa') ? 'fa' : 'fa';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const dir = lang === 'fa' ? 'rtl' : 'ltr';
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);
  const value: I18n = {
    lang,
    dir,
    t: (key) => dicts[lang][key] ?? dicts.en[key] ?? key,
    setLang: (l) => {
      try {
        localStorage.setItem('nx_lang', l);
      } catch {
        // ignore
      }
      setLangState(l);
    },
    fmt: (n) => (n === null || n === undefined ? '—' : new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US').format(n)),
    date: (d, withTime = true) => {
      if (!d) return '—';
      const opts: Intl.DateTimeFormatOptions = withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' };
      return new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR' : 'en-US', opts).format(new Date(d));
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  return useContext(Ctx);
}
