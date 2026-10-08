import ChatBot from '../../bot/ChatBot.jsx';
import { useT } from '../../i18n/LanguageContext.jsx';

export default function BotPage() {
  const { t } = useT();
  return (
    <div className="space-y-3">
      <h1 className="page-title">{t('bot.pageTitle')}</h1>
      <p className="text-sm text-stone-600">{t('bot.pageIntro')}</p>
      <ChatBot mode="staff" />
    </div>
  );
}
