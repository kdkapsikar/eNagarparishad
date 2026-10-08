import ChatBot from '../../bot/ChatBot.jsx';
import { useT } from '../../i18n/LanguageContext.jsx';

export default function SelfRegister() {
  const { t } = useT();
  return (
    <div className="space-y-3">
      <h1 className="page-title">{t('register.title')}</h1>
      <p className="text-sm text-stone-600">{t('register.intro')}</p>
      <ChatBot mode="public" start="register" />
    </div>
  );
}
