import { getRequestConfig } from 'next-intl/server';

export const locales = ['en', 'zh', 'es', 'pt', 'ja'];
export const defaultLocale = 'en';

export default getRequestConfig(async ({ locale }) => ({
  messages: (await import(`./messages/${locale}.json`)).default
}));
