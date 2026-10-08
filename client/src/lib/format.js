import { intlLocale } from '../i18n/index.js';

export const formatDate = (value) => {
  if (!value) return '';
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
};

export const formatDateTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return d.toLocaleString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

/** Age in whole years on today's date, or null. */
export function ageFrom(isoDate) {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age;
}

/** wa.me link that opens WhatsApp with the message typed in, ready to send. */
export const whatsappLink = (phone, text) => `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
export const smsLink = (phone, text) => `sms:+91${phone}?body=${encodeURIComponent(text)}`;
