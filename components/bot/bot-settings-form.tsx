import { Bot, Clock, Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import type { AppointmentBotSettings } from "@/types/appointment-bot";

export function BotSettingsForm({ settings }: { settings: AppointmentBotSettings }) {
  return (
    <section className="grid gap-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-md bg-teal-50 text-clinic">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-bold text-ink">Appointment confirmation bot</h2>
            <p className="text-sm text-slate-500">Mock premium settings. Delivery is disabled.</p>
          </div>
        </div>
        <Badge variant="amber">
          <Crown className="mr-1 h-3 w-3" />
          {settings.requiredPlan}
        </Badge>
      </div>

      <label className="flex items-center justify-between gap-4 rounded-md bg-slate-50 p-4 text-sm font-semibold text-ink">
        Enable appointment confirmation bot
        <input type="checkbox" defaultChecked={settings.enabled} className="h-5 w-5 rounded border-slate-300" />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Channel" htmlFor="channel">
          <Select id="channel" defaultValue="WhatsApp">
            {settings.channels.map((channel) => (
              <option key={channel}>{channel}</option>
            ))}
          </Select>
        </Field>
        <Field label="Reminder timing" htmlFor="timing">
          <Select id="timing" defaultValue={settings.reminderTiming}>
            <option>24 hours before</option>
            <option>48 hours before</option>
            <option>Same day</option>
          </Select>
        </Field>
        <Field label="Escalation behavior" htmlFor="escalation">
          <Select id="escalation" defaultValue={settings.escalationBehavior}>
            <option>Notify clinic</option>
            <option>Mark as needs follow-up</option>
            <option>Do nothing</option>
          </Select>
        </Field>
        <Field label="Maximum reminders per patient" htmlFor="max-reminders">
          <Input id="max-reminders" type="number" defaultValue={settings.maxRemindersPerPatient} min={1} max={5} />
        </Field>
        <Field label="Quiet hours start" htmlFor="quiet-start">
          <Input id="quiet-start" type="time" defaultValue={settings.quietHours.start} />
        </Field>
        <Field label="Quiet hours end" htmlFor="quiet-end">
          <Input id="quiet-end" type="time" defaultValue={settings.quietHours.end} />
        </Field>
      </div>

      <p className="flex gap-2 rounded-md bg-amber-50 p-3 text-sm leading-6 text-amber-800">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        Real bot delivery requires a messaging provider, approved templates, opt-in/consent, and production
        credentials.
      </p>

      <div className="flex justify-end">
        <Button type="button">Save mock settings</Button>
      </div>
    </section>
  );
}
