import { BotActivityLog } from "@/components/bot/bot-activity-log";
import { BotSettingsForm } from "@/components/bot/bot-settings-form";
import { BotTemplatePreview } from "@/components/bot/bot-template-preview";
import { PageHeader } from "@/components/dashboard/page-header";
import { appointmentBotSettings, botActivityLog } from "@/lib/mock-appointment-bot";

export default function BotPage() {
  return (
    <>
      <PageHeader
        title="Appointment bot"
        description="Premium confirmation bot scaffold for appointment reminders and response tracking."
      />
      <div className="grid gap-5">
        <BotSettingsForm settings={appointmentBotSettings} />
        <BotTemplatePreview template={appointmentBotSettings.messageTemplate} />
        <BotActivityLog items={botActivityLog} />
      </div>
    </>
  );
}
